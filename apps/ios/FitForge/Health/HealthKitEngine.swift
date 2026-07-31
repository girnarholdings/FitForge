import Foundation
import HealthKit

/// What the engine needs from the bridge. Weakly held: the bridge owns nothing here.
protocol BridgeOutput: AnyObject {
    /// True once the page said hello — nothing may be pushed before that.
    var isReady: Bool { get }
    func send(_ message: BridgeMessage)
}

/// Read-only Apple Health engine for the v1 metric set (docs/IOS-SHELL-CONTRACT.md).
///
/// - Quantities (restingHeartRate, hrvSdnn, steps, activeEnergy, bodyFatPercentage) aggregate
///   through HKStatisticsCollectionQuery 1-day buckets — HealthKit's statistics path already
///   de-duplicates overlapping Watch+iPhone sources.
/// - sleep / bodyMass / workouts run HKAnchoredObjectQuery with persisted anchors; an anchor
///   is saved only AFTER the page acks the batch, so a crash between query and ack re-delivers
///   instead of losing data (web ingestion is idempotent by hkUuid/date).
/// - bodyMass still crosses as day-grained points (earliest sample of the day — the morning
///   weigh-in — wins, per the body-weight merge law); the anchored query is the change
///   detector and the affected days are re-read in full so a later-day sample can never
///   replace an earlier one across incremental syncs.
/// - Day strings are the USER'S LOCAL calendar. Missing days are silence, never zeroes.
/// - `yieldedData` (any data ever arrived per metric) is the only per-metric honesty signal;
///   HealthKit never reveals read-denial.
final class HealthKitEngine: ObservableObject {
    @Published private(set) var consentRequested: Bool
    @Published private(set) var yieldedData: [String: Bool]
    @Published private(set) var lastSyncDate: Date?

    weak var output: BridgeOutput?

    var isHealthDataAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    private let store = HKHealthStore()
    private let defaults = UserDefaults.standard
    private let anchorsDirectory: URL

    private var batchCounter = 0
    private var pending: [(payload: BatchPayload, commit: () -> Void)] = []
    private var awaitingAckBatchId: String?
    private var syncInFlight = false
    private var syncStaleSince: String?
    private var observersStarted = false

    private enum DefaultsKey {
        static let consentRequested = "health.consentRequested"
        static let yieldedData = "health.yieldedData"
        static let lastSync = "health.lastSyncDate"
    }

    init() {
        consentRequested = defaults.bool(forKey: DefaultsKey.consentRequested)
        yieldedData = (defaults.dictionary(forKey: DefaultsKey.yieldedData) as? [String: Bool]) ?? [:]
        lastSyncDate = defaults.object(forKey: DefaultsKey.lastSync) as? Date
        anchorsDirectory = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("HealthAnchors", isDirectory: true)
        try? FileManager.default.createDirectory(
            at: anchorsDirectory,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
        )
    }

    // MARK: - Metric plumbing

    private struct QuantityDescriptor {
        let metric: HealthMetric
        let identifier: HKQuantityTypeIdentifier
        let options: HKStatisticsOptions
        let unit: HKUnit
        let unitLabel: String
        /// HKUnit.percent() yields fractions; the wire carries human percent.
        let scale: Double
    }

    private static let quantityDescriptors: [QuantityDescriptor] = [
        QuantityDescriptor(metric: .restingHeartRate, identifier: .restingHeartRate,
                           options: .discreteAverage,
                           unit: HKUnit.count().unitDivided(by: .minute()), unitLabel: "count/min", scale: 1),
        QuantityDescriptor(metric: .hrvSdnn, identifier: .heartRateVariabilitySDNN,
                           options: .discreteAverage,
                           unit: HKUnit.secondUnit(with: .milli), unitLabel: "ms", scale: 1),
        QuantityDescriptor(metric: .steps, identifier: .stepCount,
                           options: .cumulativeSum,
                           unit: .count(), unitLabel: "count", scale: 1),
        QuantityDescriptor(metric: .activeEnergy, identifier: .activeEnergyBurned,
                           options: .cumulativeSum,
                           unit: .kilocalorie(), unitLabel: "kcal", scale: 1),
        QuantityDescriptor(metric: .bodyFatPercentage, identifier: .bodyFatPercentage,
                           options: .discreteAverage,
                           unit: .percent(), unitLabel: "%", scale: 100),
    ]

    private static var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = [HKObjectType.workoutType()]
        let identifiers: [HKQuantityTypeIdentifier] = [
            .restingHeartRate, .heartRateVariabilitySDNN, .stepCount,
            .activeEnergyBurned, .bodyMass, .bodyFatPercentage,
        ]
        for identifier in identifiers {
            if let type = HKObjectType.quantityType(forIdentifier: identifier) { types.insert(type) }
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { types.insert(sleep) }
        return types
    }

    // MARK: - Permissions

    /// Presents the system Health sheet (a no-op after the first time — iOS shows it once).
    /// Reached from the native consent screen or from `health/requestPermissions`; both are
    /// the same call, and the resulting per-metric state is pushed to the page either way.
    func requestAuthorization(completion: (() -> Void)? = nil) {
        guard HKHealthStore.isHealthDataAvailable() else {
            output?.send(.permissions(PermissionsPayload(perMetric: permissionStates())))
            completion?()
            return
        }
        store.requestAuthorization(toShare: nil, read: Self.readTypes) { [weak self] _, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                self.consentRequested = true
                self.defaults.set(true, forKey: DefaultsKey.consentRequested)
                self.startObserversIfAuthorized()
                self.output?.send(.permissions(PermissionsPayload(perMetric: self.permissionStates())))
                completion?()
            }
        }
    }

    /// `determined` mirrors `requested`: read-status is invisible by design, so "the sheet ran"
    /// is the most that can honestly be claimed. `yieldedData` carries the real signal.
    func permissionStates() -> [String: MetricPermissionState] {
        var states: [String: MetricPermissionState] = [:]
        for metric in HealthMetric.allCases {
            states[metric.rawValue] = MetricPermissionState(
                requested: consentRequested,
                determined: consentRequested,
                yieldedData: yieldedData[metric.rawValue] ?? false
            )
        }
        return states
    }

    // MARK: - Sync

    /// One full pass over every metric: quantities from `haveUpTo` (null → 90-day backfill),
    /// anchored metrics from their persisted anchors. Batches go out one at a time, each
    /// waiting for `health/ackBatch`, then a single `health/syncComplete` closes the pass.
    func performSync(haveUpTo: [String: String?]) {
        guard let output, output.isReady, !syncInFlight else { return }
        guard HKHealthStore.isHealthDataAvailable(), consentRequested else {
            output.send(.syncComplete(SyncCompletePayload(staleSince: nil)))
            return
        }
        syncInFlight = true

        var built: [(metric: String, points: [DailyMetricPoint]?, samples: [HealthSample]?, commit: (() -> Void)?)] = []
        var failedAny = false
        let group = DispatchGroup()

        for descriptor in Self.quantityDescriptors {
            group.enter()
            let start = quantityStart(haveUpTo[descriptor.metric.rawValue] ?? nil)
            collectQuantityPoints(descriptor, since: start) { points in
                if let points {
                    if !points.isEmpty { built.append((descriptor.metric.rawValue, points, nil, nil)) }
                } else {
                    failedAny = true
                }
                group.leave()
            }
        }

        group.enter()
        collectSleep { samples, commit in
            if let samples {
                if samples.isEmpty { commit?() } else { built.append((HealthMetric.sleep.rawValue, nil, samples, commit)) }
            } else {
                failedAny = true
            }
            group.leave()
        }

        group.enter()
        collectBodyMass { points, commit in
            if let points {
                if points.isEmpty { commit?() } else { built.append((HealthMetric.bodyMass.rawValue, points, nil, commit)) }
            } else {
                failedAny = true
            }
            group.leave()
        }

        group.enter()
        collectWorkouts { samples, commit in
            if let samples {
                if samples.isEmpty { commit?() } else { built.append((HealthMetric.workouts.rawValue, nil, samples, commit)) }
            } else {
                failedAny = true
            }
            group.leave()
        }

        group.notify(queue: .main) { [weak self] in
            guard let self else { return }
            // Deterministic batch order: the contract's metric ranking.
            let order = HealthMetric.allCases.map(\.rawValue)
            let sorted = built.sorted {
                (order.firstIndex(of: $0.metric) ?? order.count) < (order.firstIndex(of: $1.metric) ?? order.count)
            }
            for item in sorted {
                self.batchCounter += 1
                let payload = BatchPayload(
                    batchId: String(format: "b-%04d", self.batchCounter),
                    metric: item.metric,
                    points: item.points,
                    samples: item.samples
                )
                self.pending.append((payload, item.commit ?? {}))
            }
            self.syncStaleSince = failedAny ? Self.dayString(self.lastSyncDate ?? Self.backfillStart()) : nil
            self.trySendNext()
        }
    }

    func ackBatch(_ batchId: String) {
        guard batchId == awaitingAckBatchId, let first = pending.first else { return }
        awaitingAckBatchId = nil
        pending.removeFirst()
        markYielded(first.payload.metric)
        first.commit()
        trySendNext()
    }

    /// The page navigated away mid-conversation: void the transport state so the next
    /// requestSync starts clean instead of deadlocking on an ack that will never come.
    func resetTransport() {
        pending.removeAll()
        awaitingAckBatchId = nil
        syncInFlight = false
        syncStaleSince = nil
    }

    private func trySendNext() {
        guard let output, output.isReady, awaitingAckBatchId == nil else { return }
        if let next = pending.first {
            awaitingAckBatchId = next.payload.batchId
            output.send(.batch(next.payload))
        } else if syncInFlight {
            syncInFlight = false
            let now = Date()
            lastSyncDate = now
            defaults.set(now, forKey: DefaultsKey.lastSync)
            output.send(.syncComplete(SyncCompletePayload(staleSince: syncStaleSince)))
            syncStaleSince = nil
        }
    }

    private func markYielded(_ metric: String) {
        var next = yieldedData
        next[metric] = true
        yieldedData = next
        defaults.set(next, forKey: DefaultsKey.yieldedData)
    }

    // MARK: - Background delivery

    /// Observer queries + background delivery: hourly, sleep daily (contract). A fire while
    /// the page is not connected is simply dropped — the page's own requestSync on its next
    /// hello covers the gap, and anchors/haveUpTo make re-delivery cheap.
    func startObserversIfAuthorized() {
        guard consentRequested, HKHealthStore.isHealthDataAvailable(), !observersStarted else { return }
        observersStarted = true

        var observed: [(HKSampleType, HKUpdateFrequency)] = [(HKObjectType.workoutType(), .hourly)]
        let hourlyIdentifiers: [HKQuantityTypeIdentifier] = [
            .restingHeartRate, .heartRateVariabilitySDNN, .stepCount,
            .activeEnergyBurned, .bodyMass, .bodyFatPercentage,
        ]
        for identifier in hourlyIdentifiers {
            if let type = HKObjectType.quantityType(forIdentifier: identifier) { observed.append((type, .hourly)) }
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { observed.append((sleep, .daily)) }

        for (type, frequency) in observed {
            let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completionHandler, _ in
                DispatchQueue.main.async { self?.observerFired() }
                completionHandler()
            }
            store.execute(query)
            store.enableBackgroundDelivery(for: type, frequency: frequency) { _, _ in }
        }
    }

    private func observerFired() {
        guard let output, output.isReady, !syncInFlight else { return }
        performSync(haveUpTo: lastKnownHaveUpTo())
    }

    /// Observer-driven syncs have no page-supplied haveUpTo; the last completed sync day
    /// (re-queried inclusively) is the conservative stand-in.
    private func lastKnownHaveUpTo() -> [String: String?] {
        guard let last = lastSyncDate else { return [:] }
        let day = Self.dayString(last)
        var marks: [String: String?] = [:]
        for descriptor in Self.quantityDescriptors { marks[descriptor.metric.rawValue] = day }
        return marks
    }

    // MARK: - Quantity collection

    private static func backfillStart() -> Date {
        Calendar.current.date(byAdding: .day, value: -90, to: Date()) ?? Date()
    }

    private func quantityStart(_ haveUpToDay: String?) -> Date {
        let backfill = Self.backfillStart()
        guard let day = haveUpToDay, let date = Self.dayFormatter.date(from: day) else { return backfill }
        // Re-query the newest known day: its totals are still growing (idempotent web-side).
        return max(backfill, min(date, Date()))
    }

    private func collectQuantityPoints(
        _ descriptor: QuantityDescriptor,
        since start: Date,
        completion: @escaping ([DailyMetricPoint]?) -> Void
    ) {
        guard let quantityType = HKObjectType.quantityType(forIdentifier: descriptor.identifier) else {
            completion([])
            return
        }
        let anchorDate = Calendar.current.startOfDay(for: start)
        let query = HKStatisticsCollectionQuery(
            quantityType: quantityType,
            quantitySamplePredicate: HKQuery.predicateForSamples(withStart: anchorDate, end: nil, options: .strictStartDate),
            options: descriptor.options,
            anchorDate: anchorDate,
            intervalComponents: DateComponents(day: 1)
        )
        query.initialResultsHandler = { _, collection, error in
            DispatchQueue.main.async {
                if error != nil {
                    completion(nil)
                    return
                }
                guard let collection else {
                    completion([])
                    return
                }
                var points: [DailyMetricPoint] = []
                collection.enumerateStatistics(from: anchorDate, to: Date()) { statistics, _ in
                    let quantity = descriptor.options.contains(.cumulativeSum)
                        ? statistics.sumQuantity()
                        : statistics.averageQuantity()
                    // Bucket without data → no point: missing data is silence, never zeroes.
                    guard let quantity else { return }
                    points.append(DailyMetricPoint(
                        date: Self.dayString(statistics.startDate),
                        value: Self.round1(quantity.doubleValue(for: descriptor.unit) * descriptor.scale),
                        unit: descriptor.unitLabel
                    ))
                }
                completion(points)
            }
        }
        store.execute(query)
    }

    // MARK: - Anchored collection

    /// completion(nil, _) = query error; commit persists the new anchor and runs only after
    /// the page acked the resulting batch (or immediately when there was nothing to send).
    private func collectAnchored(
        sampleType: HKSampleType,
        anchorName: String,
        completion: @escaping ([HKSample]?, (() -> Void)?) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: Self.backfillStart(), end: nil, options: [])
        let query = HKAnchoredObjectQuery(
            type: sampleType,
            predicate: predicate,
            anchor: loadAnchor(named: anchorName),
            limit: HKObjectQueryNoLimit
        ) { [weak self] _, samples, _, newAnchor, error in
            DispatchQueue.main.async {
                guard let self else { return }
                if error != nil {
                    completion(nil, nil)
                    return
                }
                let commit: (() -> Void)? = newAnchor.map { anchor in
                    { self.saveAnchor(anchor, named: anchorName) }
                }
                completion(samples ?? [], commit)
            }
        }
        store.execute(query)
    }

    private func collectSleep(completion: @escaping ([HealthSample]?, (() -> Void)?) -> Void) {
        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            completion([], nil)
            return
        }
        collectAnchored(sampleType: sleepType, anchorName: "sleep") { samples, commit in
            guard let samples else {
                completion(nil, nil)
                return
            }
            let out: [HealthSample] = samples.compactMap { sample in
                guard let categorySample = sample as? HKCategorySample,
                      let value = HKCategoryValueSleepAnalysis(rawValue: categorySample.value),
                      HKCategoryValueSleepAnalysis.allAsleepValues.contains(value)
                else { return nil } // asleep time only — in-bed is filtered here, per contract
                let hours = categorySample.endDate.timeIntervalSince(categorySample.startDate) / 3600
                return HealthSample(
                    hkUuid: categorySample.uuid.uuidString.lowercased(),
                    start: Self.isoString(categorySample.startDate),
                    end: Self.isoString(categorySample.endDate),
                    value: Self.round2(hours),
                    unit: "hr",
                    kind: "asleep",
                    kcal: nil
                )
            }
            completion(out, commit)
        }
    }

    /// Anchored change detection + full re-read of the affected days, reduced to the EARLIEST
    /// sample per day (the morning weigh-in wins — body-weight merge law). Without the
    /// re-read, an evening sample arriving in a later incremental sync would silently
    /// replace the morning point.
    private func collectBodyMass(completion: @escaping ([DailyMetricPoint]?, (() -> Void)?) -> Void) {
        guard let massType = HKObjectType.quantityType(forIdentifier: .bodyMass) else {
            completion([], nil)
            return
        }
        collectAnchored(sampleType: massType, anchorName: "bodyMass") { [weak self] samples, commit in
            guard let self else { return }
            guard let samples else {
                completion(nil, nil)
                return
            }
            let affectedDays = Set(samples.map { Self.dayString($0.startDate) })
            guard !affectedDays.isEmpty else {
                completion([], commit)
                return
            }
            self.earliestBodyMassPerDay(massType: massType, days: affectedDays) { points in
                completion(points, commit)
            }
        }
    }

    private func earliestBodyMassPerDay(
        massType: HKQuantityType,
        days: Set<String>,
        completion: @escaping ([DailyMetricPoint]?) -> Void
    ) {
        let calendar = Calendar.current
        let dayStarts = days.compactMap { Self.dayFormatter.date(from: $0) }
        guard let earliestDay = dayStarts.min() else {
            completion([])
            return
        }
        let predicate = HKQuery.predicateForSamples(withStart: calendar.startOfDay(for: earliestDay), end: nil, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: massType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
            DispatchQueue.main.async {
                if error != nil {
                    completion(nil)
                    return
                }
                var earliest: [String: Double] = [:]
                for sample in samples ?? [] {
                    guard let quantitySample = sample as? HKQuantitySample else { continue }
                    let day = Self.dayString(quantitySample.startDate)
                    guard days.contains(day), earliest[day] == nil else { continue } // ascending → first is earliest
                    earliest[day] = quantitySample.quantity.doubleValue(for: .gramUnit(with: .kilo))
                }
                let points = earliest
                    .map { DailyMetricPoint(date: $0.key, value: Self.round2($0.value), unit: "kg") }
                    .sorted { $0.date < $1.date }
                completion(points)
            }
        }
        store.execute(query)
    }

    private func collectWorkouts(completion: @escaping ([HealthSample]?, (() -> Void)?) -> Void) {
        collectAnchored(sampleType: HKObjectType.workoutType(), anchorName: "workouts") { samples, commit in
            guard let samples else {
                completion(nil, nil)
                return
            }
            let energyType = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)
            let out: [HealthSample] = samples.compactMap { sample in
                guard let workout = sample as? HKWorkout else { return nil }
                var kcal: Double?
                if let energyType,
                   let sum = workout.statistics(for: energyType)?.sumQuantity() {
                    kcal = Self.round1(sum.doubleValue(for: .kilocalorie()))
                }
                return HealthSample(
                    hkUuid: workout.uuid.uuidString.lowercased(),
                    start: Self.isoString(workout.startDate),
                    end: Self.isoString(workout.endDate),
                    value: Self.round1(workout.duration / 60),
                    unit: "min",
                    kind: Self.activityName(workout.workoutActivityType),
                    kcal: kcal
                )
            }
            completion(out, commit)
        }
    }

    // MARK: - Anchors

    private func anchorURL(named name: String) -> URL {
        anchorsDirectory.appendingPathComponent(name + ".anchor")
    }

    private func loadAnchor(named name: String) -> HKQueryAnchor? {
        guard let data = try? Data(contentsOf: anchorURL(named: name)) else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    }

    private func saveAnchor(_ anchor: HKQueryAnchor, named name: String) {
        guard let data = try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true) else { return }
        try? data.write(to: anchorURL(named: name), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    // MARK: - Formatting

    /// Local-calendar day string — the wire's date grammar (never UTC-derived).
    static func dayString(_ date: Date) -> String {
        dayFormatter.string(from: date)
    }

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar.current
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    /// ISO-8601 carrying the local offset ('2026-07-30T18:02:00-07:00'), so the web side can
    /// take the leading 10 characters as the local date.
    private static func isoString(_ date: Date) -> String {
        isoFormatter.string(from: date)
    }

    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        formatter.timeZone = TimeZone.current
        return formatter
    }()

    private static func round1(_ value: Double) -> Double { (value * 10).rounded() / 10 }
    private static func round2(_ value: Double) -> Double { (value * 100).rounded() / 100 }

    private static func activityName(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .traditionalStrengthTraining: return "traditionalStrengthTraining"
        case .functionalStrengthTraining: return "functionalStrengthTraining"
        case .highIntensityIntervalTraining: return "highIntensityIntervalTraining"
        case .coreTraining: return "coreTraining"
        case .crossTraining: return "crossTraining"
        case .mixedCardio: return "mixedCardio"
        case .running: return "running"
        case .walking: return "walking"
        case .cycling: return "cycling"
        case .swimming: return "swimming"
        case .rowing: return "rowing"
        case .elliptical: return "elliptical"
        case .stairClimbing: return "stairClimbing"
        case .hiking: return "hiking"
        case .yoga: return "yoga"
        case .pilates: return "pilates"
        case .jumpRope: return "jumpRope"
        case .martialArts: return "martialArts"
        case .boxing: return "boxing"
        case .tennis: return "tennis"
        case .basketball: return "basketball"
        case .soccer: return "soccer"
        default: return "other"
        }
    }
}
