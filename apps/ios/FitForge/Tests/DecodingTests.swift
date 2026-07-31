import XCTest
@testable import FitForge

/// Round-trips EVERY frozen fixture in fixtures/forgebridge (copied into this bundle by
/// project.yml) through ForgeBridgeMessages. The web suite round-trips the same files, so
/// a fixture that decodes on one side and not the other fails CI — the drift alarm the
/// contract demands.
final class DecodingTests: XCTestCase {

    private func fixtureURLs() throws -> [URL] {
        let urls = Bundle(for: DecodingTests.self).urls(forResourcesWithExtension: "json", subdirectory: nil) ?? []
        XCTAssertFalse(urls.isEmpty, "forgebridge fixtures missing from the test bundle — check project.yml resources")
        return urls.sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    func testEveryFixtureDecodesToAKnownMessage() throws {
        for url in try fixtureURLs() {
            let data = try Data(contentsOf: url)
            let envelope = try JSONDecoder().decode(BridgeEnvelope.self, from: data)
            XCTAssertEqual(envelope.v, 1, url.lastPathComponent)
            XCTAssertFalse(envelope.id.isEmpty, url.lastPathComponent)
            if case .unrecognized(let rawType) = envelope.message {
                XCTFail("\(url.lastPathComponent): type '\(rawType)' decoded as unrecognized — ForgeBridgeMessages is behind the fixtures")
            }
        }
    }

    /// Decode → re-encode → compare as JSON objects: every envelope field and every payload
    /// field must survive, including absent optionals staying absent and explicit nulls
    /// staying null (requestSync's haveUpTo).
    func testRoundTripPreservesEveryFixtureField() throws {
        for url in try fixtureURLs() {
            let data = try Data(contentsOf: url)
            let original = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? NSDictionary, url.lastPathComponent)
            let envelope = try JSONDecoder().decode(BridgeEnvelope.self, from: data)
            let reencoded = try JSONEncoder().encode(envelope)
            let roundTripped = try XCTUnwrap(try JSONSerialization.jsonObject(with: reencoded) as? NSDictionary, url.lastPathComponent)
            XCTAssertEqual(roundTripped, original, url.lastPathComponent)
        }
    }

    // MARK: - Additive tolerance (contract: v1 is additive-only forever)

    func testUnknownTypeDecodesToUnrecognized() throws {
        let json = """
        { "v": 1, "id": "a1b2c3d4-00ff-4000-8000-0000000000ff", "type": "health/futureThing", "payload": { "anything": true } }
        """
        let envelope = try JSONDecoder().decode(BridgeEnvelope.self, from: Data(json.utf8))
        guard case .unrecognized(let rawType) = envelope.message else {
            return XCTFail("expected .unrecognized, got \(envelope.message.type)")
        }
        XCTAssertEqual(rawType, "health/futureThing")
        XCTAssertEqual(envelope.id, "a1b2c3d4-00ff-4000-8000-0000000000ff")
    }

    func testUnknownPayloadFieldsAreIgnored() throws {
        let json = """
        { "v": 1, "id": "x", "type": "bridge/hello", "payload": { "pageBridgeVersion": 2, "futureField": "ok" } }
        """
        let envelope = try JSONDecoder().decode(BridgeEnvelope.self, from: Data(json.utf8))
        guard case .hello(let payload) = envelope.message else {
            return XCTFail("expected .hello")
        }
        XCTAssertEqual(payload.pageBridgeVersion, 2)
    }

    func testRequestSyncPreservesExplicitNulls() throws {
        let json = """
        { "v": 1, "id": "x", "type": "health/requestSync", "payload": { "haveUpTo": { "sleep": "2026-07-30", "steps": null } } }
        """
        let envelope = try JSONDecoder().decode(BridgeEnvelope.self, from: Data(json.utf8))
        guard case .requestSync(let payload) = envelope.message else {
            return XCTFail("expected .requestSync")
        }
        XCTAssertEqual(payload.haveUpTo["sleep"], "2026-07-30")
        // Present key, null value — distinct from an absent key.
        XCTAssertEqual(payload.haveUpTo["steps"], String??.some(nil))
    }
}
