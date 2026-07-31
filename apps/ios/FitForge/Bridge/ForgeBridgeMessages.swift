import Foundation

// Swift mirror of ForgeBridge v1. The wire truth is apps/web/lib/native/forgeBridge.ts and
// the frozen fixtures at fixtures/forgebridge/*.json — DecodingTests round-trips every
// fixture through these types, the web tests round-trip the same files, so neither side can
// drift alone. The contract is additive-only forever: unknown message types decode to
// `.unrecognized` instead of failing, and unknown payload fields are ignored (Codable's
// default), so a newer page can always talk to an older shell.

/// Metric identifiers as they cross the wire (HEALTH_METRICS in forgeBridge.ts).
enum HealthMetric: String, CaseIterable, Codable {
    case sleep
    case restingHeartRate
    case hrvSdnn
    case bodyMass
    case bodyFatPercentage
    case steps
    case activeEnergy
    case workouts
}

/// One day of one quantity metric. `date` is the USER'S LOCAL calendar day — the shell
/// aggregates in the phone's calendar so the web side never re-derives a day through UTC.
struct DailyMetricPoint: Codable, Equatable {
    let date: String // YYYY-MM-DD
    let value: Double
    let unit: String
}

/// A discrete HealthKit sample (sleep session / external workout). `hkUuid` is the dedupe key.
struct HealthSample: Codable, Equatable {
    let hkUuid: String
    let start: String // ISO-8601 with the offset the sample was recorded in
    let end: String
    let value: Double
    let unit: String
    /// sleep: "asleep" (in-bed is filtered native-side); workouts: the HKWorkoutActivityType name
    let kind: String
    /// workouts only: active energy for the session
    let kcal: Double?
}

/// HealthKit never reveals read-denial; `yieldedData` — "did any data actually arrive" — is
/// the only honest per-metric signal.
struct MetricPermissionState: Codable, Equatable {
    let requested: Bool
    let determined: Bool
    let yieldedData: Bool
}

struct HelloPayload: Codable, Equatable {
    let pageBridgeVersion: Int
}

struct HelloAckPayload: Codable, Equatable {
    let shellVersion: String
    let bridgeVersion: Int
    let capabilities: [String]
}

struct UnsupportedPayload: Codable, Equatable {
    let forId: String
    let type: String
}

/// `types` stays [String]: a newer page may name metrics this build has never heard of, and
/// an unknown name must ride through (the engine simply has nothing to read for it).
struct RequestPermissionsPayload: Codable, Equatable {
    let types: [String]
}

struct PermissionsPayload: Codable, Equatable {
    let perMetric: [String: MetricPermissionState]
}

/// `haveUpTo`: per metric, the newest local date the web store already holds
/// (null = send everything, the shell's cue to run the 90-day backfill).
struct RequestSyncPayload: Codable, Equatable {
    let haveUpTo: [String: String?]
}

/// Exactly one of `points` / `samples` is present, by metric kind.
struct BatchPayload: Codable, Equatable {
    let batchId: String
    let metric: String
    let points: [DailyMetricPoint]?
    let samples: [HealthSample]?
}

struct AckBatchPayload: Codable, Equatable {
    let batchId: String
}

struct SyncCompletePayload: Codable, Equatable {
    /// present when the shell knows its data is stale since a date (background delivery lapsed)
    let staleSince: String?
}

struct EmptyPayload: Codable, Equatable {}

/// Every v1 message, discriminated by the envelope's `type` string.
enum BridgeMessage: Equatable {
    // page → native
    case hello(HelloPayload)
    case requestPermissions(RequestPermissionsPayload)
    case requestSync(RequestSyncPayload)
    case ackBatch(AckBatchPayload)
    // native → page
    case helloAck(HelloAckPayload)
    case permissions(PermissionsPayload)
    case batch(BatchPayload)
    case syncComplete(SyncCompletePayload)
    case unsupported(UnsupportedPayload)
    /// Additive tolerance: a type this build does not know. Never re-emitted as itself —
    /// the bridge answers it with `bridge/unsupported`.
    case unrecognized(rawType: String)

    var type: String {
        switch self {
        case .hello: return "bridge/hello"
        case .helloAck: return "bridge/helloAck"
        case .requestPermissions: return "health/requestPermissions"
        case .requestSync: return "health/requestSync"
        case .ackBatch: return "health/ackBatch"
        case .permissions: return "health/permissions"
        case .batch: return "health/batch"
        case .syncComplete: return "health/syncComplete"
        case .unsupported: return "bridge/unsupported"
        case .unrecognized(let rawType): return rawType
        }
    }
}

/// `{ v: 1, id: uuid, type: string, payload: object }`.
struct BridgeEnvelope: Codable, Equatable {
    let v: Int
    let id: String
    let message: BridgeMessage

    init(v: Int = 1, id: String = UUID().uuidString.lowercased(), message: BridgeMessage) {
        self.v = v
        self.id = id
        self.message = message
    }

    private enum CodingKeys: String, CodingKey {
        case v, id, type, payload
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        v = try container.decode(Int.self, forKey: .v)
        id = try container.decode(String.self, forKey: .id)
        let type = try container.decode(String.self, forKey: .type)
        switch type {
        case "bridge/hello":
            message = .hello(try container.decode(HelloPayload.self, forKey: .payload))
        case "bridge/helloAck":
            message = .helloAck(try container.decode(HelloAckPayload.self, forKey: .payload))
        case "health/requestPermissions":
            message = .requestPermissions(try container.decode(RequestPermissionsPayload.self, forKey: .payload))
        case "health/requestSync":
            message = .requestSync(try container.decode(RequestSyncPayload.self, forKey: .payload))
        case "health/ackBatch":
            message = .ackBatch(try container.decode(AckBatchPayload.self, forKey: .payload))
        case "health/permissions":
            message = .permissions(try container.decode(PermissionsPayload.self, forKey: .payload))
        case "health/batch":
            message = .batch(try container.decode(BatchPayload.self, forKey: .payload))
        case "health/syncComplete":
            message = .syncComplete(try container.decode(SyncCompletePayload.self, forKey: .payload))
        case "bridge/unsupported":
            message = .unsupported(try container.decode(UnsupportedPayload.self, forKey: .payload))
        default:
            message = .unrecognized(rawType: type)
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(v, forKey: .v)
        try container.encode(id, forKey: .id)
        try container.encode(message.type, forKey: .type)
        switch message {
        case .hello(let payload): try container.encode(payload, forKey: .payload)
        case .helloAck(let payload): try container.encode(payload, forKey: .payload)
        case .requestPermissions(let payload): try container.encode(payload, forKey: .payload)
        case .requestSync(let payload): try container.encode(payload, forKey: .payload)
        case .ackBatch(let payload): try container.encode(payload, forKey: .payload)
        case .permissions(let payload): try container.encode(payload, forKey: .payload)
        case .batch(let payload): try container.encode(payload, forKey: .payload)
        case .syncComplete(let payload): try container.encode(payload, forKey: .payload)
        case .unsupported(let payload): try container.encode(payload, forKey: .payload)
        case .unrecognized: try container.encode(EmptyPayload(), forKey: .payload)
        }
    }
}
