import Foundation

/// The pure parts of the mirror, split out so unit tests can exercise them without a
/// filesystem or a webview.
enum MirrorLogic {
    static let metaFileName = "mirror-meta.json"
    /// Web-side generation counter's localStorage key. Deliberately OUTSIDE the `fitforge.`
    /// namespace: the web app's cloud extras sweep hoovers every `fitforge.*` key, and a
    /// generation imported from another device would wrongly suppress a restore here.
    static let generationKey = "forgeShell.generation"
    /// Only these keys are mirrored — the same namespace the web backup/export walks.
    static let mirroredPrefix = "fitforge."

    /// Mirrors LocalBackup in apps/web/lib/demo/store.ts.
    static let backupFormat = "fitforge.backup"
    static let backupVersion = 2
    static let demoKey = "fitforge.demo.v1"
    static let workoutLogKey = "fitforge.workoutlog.v1"
    /// DEVICE_LOCAL_PREFIXES (store.ts): this device's sync bookkeeping never rides any copy.
    static let deviceLocalPrefixes = ["fitforge.cloudPushed"]

    private static let fileNameAllowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: ".-_"))

    /// Filesystem-safe, reversible encoding of a localStorage key ('/' and '%' always escape).
    static func fileName(forKey key: String) -> String {
        key.addingPercentEncoding(withAllowedCharacters: fileNameAllowed) ?? key
    }

    static func key(forFileName name: String) -> String? {
        name.removingPercentEncoding
    }

    /// The launch-time decision: repopulate the web store only when the mirror is strictly
    /// ahead (missing web counter reads as 0 — a wiped store is exactly the restore case).
    static func shouldRestore(webGeneration: Int?, mirrorGeneration: Int) -> Bool {
        mirrorGeneration > (webGeneration ?? 0)
    }

    static func readGeneration(from url: URL) -> Int {
        guard let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let generation = object["generation"] as? Int
        else { return 0 }
        return generation
    }

    static func metaData(generation: Int) -> Data {
        (try? JSONSerialization.data(withJSONObject: ["generation": generation])) ?? Data("{\"generation\":0}".utf8)
    }

    /// Build the web app's backup-bundle shape (Settings → Export data emits the same) from
    /// mirrored keys. A user-initiated export INCLUDES health keys — the sync denylist governs
    /// the automatic cloud sweep only. Returns nil without the demo state: there is nothing
    /// importable in a bundle that lacks it.
    static func backupBundle(entries: [String: String], exportedAt: Date) -> Data? {
        guard let demoRaw = entries[demoKey],
              let demo = try? JSONSerialization.jsonObject(with: Data(demoRaw.utf8))
        else { return nil }

        var bundle: [String: Any] = [
            "format": backupFormat,
            "version": backupVersion,
            "exportedAt": isoTimestamp(exportedAt),
            "demo": demo,
        ]
        if let logRaw = entries[workoutLogKey],
           let log = try? JSONSerialization.jsonObject(with: Data(logRaw.utf8)) {
            bundle["workoutLog"] = log
        } else {
            // The web LocalBackup type requires the field; an empty log is the honest default.
            bundle["workoutLog"] = ["sessions": [Any]()]
        }

        var extras: [String: String] = [:]
        for (key, value) in entries {
            guard key != demoKey, key != workoutLogKey else { continue }
            guard !deviceLocalPrefixes.contains(where: { key.hasPrefix($0) }) else { continue }
            extras[key] = value
        }
        bundle["extras"] = extras

        return try? JSONSerialization.data(withJSONObject: bundle, options: [.prettyPrinted, .sortedKeys])
    }

    private static func isoTimestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}

/// Durable native copy of the web app's `fitforge.*` localStorage (contract law 3:
/// localStorage is a cache WebKit may evict; this is the copy that survives). One atomic file
/// per key under Application Support/Mirror with
/// NSFileProtectionCompleteUntilFirstUserAuthentication — readable by background HealthKit
/// wakes after first unlock, never before. The generation counter bumps ONLY after the file
/// write completed, so the web-side counter can never claim durability that does not exist.
final class StorageMirror {
    struct Snapshot {
        let generation: Int
        let entries: [String: String]
    }

    static let debounceInterval: TimeInterval = 0.25

    /// Called on the main queue after the write that bumped the generation has completed.
    var onGenerationChange: ((Int) -> Void)?

    // .default, not .utility: these writes are the durability promise behind the whole mirror,
    // and utility-QoS queues can be starved for whole seconds on a loaded device — exactly the
    // window in which a crash would eat the athlete's last set. First observed as a CI failure
    // where the debounce timer had not fired 600ms after the write on a busy simulator.
    private let queue = DispatchQueue(label: "com.fitforge.storage-mirror", qos: .default)
    private let directory: URL
    private var debounced: [String: DispatchWorkItem] = [:]
    private var pendingValues: [String: String] = [:]
    private var generation: Int

    init(directory: URL? = nil) {
        let base = directory ?? FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Mirror", isDirectory: true)
        self.directory = base
        try? FileManager.default.createDirectory(
            at: base,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
        )
        generation = MirrorLogic.readGeneration(from: base.appendingPathComponent(MirrorLogic.metaFileName))
    }

    var currentGeneration: Int {
        queue.sync { generation }
    }

    /// Debounced ≥250ms per key on top of the page-side debounce — rapid re-writes of the
    /// same key cost one file write, and only the final value lands.
    func set(key: String, value: String) {
        guard key.hasPrefix(MirrorLogic.mirroredPrefix) else { return }
        queue.async {
            self.pendingValues[key] = value
            self.debounced[key]?.cancel()
            let work = DispatchWorkItem { [weak self] in self?.writeNow(key: key) }
            self.debounced[key] = work
            self.queue.asyncAfter(deadline: .now() + Self.debounceInterval, execute: work)
        }
    }

    func remove(key: String) {
        guard key.hasPrefix(MirrorLogic.mirroredPrefix) else { return }
        queue.async {
            self.debounced[key]?.cancel()
            self.debounced[key] = nil
            self.pendingValues[key] = nil
            let url = self.fileURL(forKey: key)
            if FileManager.default.fileExists(atPath: url.path) {
                try? FileManager.default.removeItem(at: url)
                self.bumpGeneration()
            }
        }
    }

    func clear() {
        queue.async {
            for (_, work) in self.debounced { work.cancel() }
            self.debounced.removeAll()
            self.pendingValues.removeAll()
            var removedAny = false
            for url in self.keyFileURLs() {
                try? FileManager.default.removeItem(at: url)
                removedAny = true
            }
            if removedAny { self.bumpGeneration() }
        }
    }

    /// Everything the restore script needs, with un-flushed debounced values overlaid (they
    /// are newer than their files).
    func snapshot() -> Snapshot {
        queue.sync {
            var entries: [String: String] = [:]
            for url in keyFileURLs() {
                guard let key = MirrorLogic.key(forFileName: url.lastPathComponent),
                      key.hasPrefix(MirrorLogic.mirroredPrefix),
                      let data = try? Data(contentsOf: url),
                      let value = String(data: data, encoding: .utf8)
                else { continue }
                entries[key] = value
            }
            for (key, value) in pendingValues { entries[key] = value }
            return Snapshot(generation: generation, entries: entries)
        }
    }

    /// Drain every debounced write synchronously — the app calls this on backgrounding, the
    /// last reliable moment before a possible suspension kill.
    func flush() {
        queue.sync {
            for key in Array(pendingValues.keys) {
                debounced[key]?.cancel()
                debounced[key] = nil
                writeNow(key: key)
            }
        }
    }

    func exportBackupData(now: Date = Date()) -> Data? {
        MirrorLogic.backupBundle(entries: snapshot().entries, exportedAt: now)
    }

    // MARK: - Private (all on `queue`)

    private func fileURL(forKey key: String) -> URL {
        directory.appendingPathComponent(MirrorLogic.fileName(forKey: key))
    }

    private func keyFileURLs() -> [URL] {
        let all = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        return all.filter { $0.lastPathComponent != MirrorLogic.metaFileName }
    }

    private func writeNow(key: String) {
        debounced[key] = nil
        guard let value = pendingValues.removeValue(forKey: key) else { return }
        do {
            try Data(value.utf8).write(
                to: fileURL(forKey: key),
                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
            )
            bumpGeneration()
        } catch {
            // A failed write must NOT bump: the counter is a durability promise. The key stays
            // absent from pendingValues; the next page write retries naturally.
        }
    }

    private func bumpGeneration() {
        generation += 1
        try? MirrorLogic.metaData(generation: generation).write(
            to: directory.appendingPathComponent(MirrorLogic.metaFileName),
            options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
        )
        let value = generation
        DispatchQueue.main.async { self.onGenerationChange?(value) }
    }
}
