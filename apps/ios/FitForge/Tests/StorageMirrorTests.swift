import XCTest
@testable import FitForge

/// Generation logic + the pure MirrorLogic parts (restore decision, filename encoding, the
/// backup-bundle shape). Anything needing a webview stays out — that path is exercised on
/// device.
final class StorageMirrorTests: XCTestCase {
    private var directory: URL!
    private var mirror: StorageMirror!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        mirror = StorageMirror(directory: directory)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    // MARK: - Restore decision

    func testShouldRestoreOnlyWhenMirrorIsStrictlyAhead() {
        XCTAssertFalse(MirrorLogic.shouldRestore(webGeneration: 0, mirrorGeneration: 0))
        XCTAssertFalse(MirrorLogic.shouldRestore(webGeneration: 5, mirrorGeneration: 5))
        XCTAssertFalse(MirrorLogic.shouldRestore(webGeneration: 6, mirrorGeneration: 5))
        XCTAssertTrue(MirrorLogic.shouldRestore(webGeneration: 4, mirrorGeneration: 5))
        // A wiped web store (no counter) restores as soon as the mirror holds anything.
        XCTAssertTrue(MirrorLogic.shouldRestore(webGeneration: nil, mirrorGeneration: 1))
        XCTAssertFalse(MirrorLogic.shouldRestore(webGeneration: nil, mirrorGeneration: 0))
    }

    // MARK: - Filename encoding

    func testFileNameRoundTripsAwkwardKeys() {
        let keys = [
            "fitforge.demo.v1",
            "fitforge.health.v1",
            "fitforge.key with spaces",
            "fitforge.100%/weird\\key",
        ]
        for key in keys {
            let name = MirrorLogic.fileName(forKey: key)
            XCTAssertFalse(name.contains("/"), name)
            XCTAssertNotEqual(name, MirrorLogic.metaFileName)
            XCTAssertEqual(MirrorLogic.key(forFileName: name), key)
        }
    }

    // MARK: - Generation counter

    func testGenerationBumpsOnlyAfterWriteCompletes() {
        XCTAssertEqual(mirror.currentGeneration, 0)
        mirror.set(key: "fitforge.demo.v1", value: "{\"a\":1}")
        XCTAssertEqual(mirror.currentGeneration, 0, "a debounced (unwritten) value must not pre-bump the generation")
        mirror.flush()
        XCTAssertEqual(mirror.currentGeneration, 1)
        XCTAssertEqual(mirror.snapshot().entries["fitforge.demo.v1"], "{\"a\":1}")
    }

    func testGenerationSurvivesReopen() {
        mirror.set(key: "fitforge.demo.v1", value: "{}")
        mirror.flush()
        let reopened = StorageMirror(directory: directory)
        XCTAssertEqual(reopened.currentGeneration, 1)
        XCTAssertEqual(reopened.snapshot().entries["fitforge.demo.v1"], "{}")
    }

    func testDebouncedWriteLandsWithoutFlush() {
        mirror.set(key: "fitforge.a", value: "1")
        let settled = expectation(description: "debounce window passed")
        DispatchQueue.main.asyncAfter(deadline: .now() + StorageMirror.debounceInterval + 0.35) {
            settled.fulfill()
        }
        wait(for: [settled], timeout: 2)
        XCTAssertEqual(mirror.currentGeneration, 1)
    }

    func testRapidRewritesCoalesceToTheLastValue() {
        mirror.set(key: "fitforge.a", value: "1")
        mirror.set(key: "fitforge.a", value: "2")
        mirror.set(key: "fitforge.a", value: "3")
        mirror.flush()
        XCTAssertEqual(mirror.currentGeneration, 1, "coalesced writes are one write, one bump")
        XCTAssertEqual(mirror.snapshot().entries["fitforge.a"], "3")
    }

    func testSnapshotIncludesPendingUnflushedValues() {
        mirror.set(key: "fitforge.a", value: "pending")
        XCTAssertEqual(mirror.snapshot().entries["fitforge.a"], "pending")
        XCTAssertEqual(mirror.snapshot().generation, 0)
    }

    func testRemoveAndClearBumpOnlyWhenSomethingChanged() {
        mirror.set(key: "fitforge.a", value: "1")
        mirror.set(key: "fitforge.b", value: "2")
        mirror.flush()
        XCTAssertEqual(mirror.currentGeneration, 2)

        mirror.remove(key: "fitforge.a")
        XCTAssertEqual(mirror.snapshot().entries.keys.sorted(), ["fitforge.b"])
        XCTAssertEqual(mirror.currentGeneration, 3)

        mirror.remove(key: "fitforge.never-existed")
        XCTAssertEqual(mirror.currentGeneration, 3, "removing an absent key is not a change")

        mirror.clear()
        XCTAssertTrue(mirror.snapshot().entries.isEmpty)
        XCTAssertEqual(mirror.currentGeneration, 4)

        mirror.clear()
        XCTAssertEqual(mirror.currentGeneration, 4, "clearing an empty mirror is not a change")
    }

    func testNonMirroredKeysAreRefused() {
        mirror.set(key: "forgeShell.generation", value: "99")
        mirror.set(key: "other.key", value: "x")
        mirror.flush()
        XCTAssertEqual(mirror.currentGeneration, 0)
        XCTAssertTrue(mirror.snapshot().entries.isEmpty)
    }

    // MARK: - Backup bundle (the web app's LocalBackup shape)

    func testBackupBundleShapeAndExclusions() throws {
        let entries = [
            "fitforge.demo.v1": "{\"profile\":{}}",
            "fitforge.workoutlog.v1": "{\"sessions\":[]}",
            "fitforge.health.v1": "{\"version\":1}",
            "fitforge.cloudPushed.v1": "device-local",
        ]
        let data = try XCTUnwrap(MirrorLogic.backupBundle(entries: entries, exportedAt: Date()))
        let bundle = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(bundle["format"] as? String, "fitforge.backup")
        XCTAssertEqual(bundle["version"] as? Int, 2)
        XCTAssertNotNil(bundle["exportedAt"] as? String)
        XCTAssertNotNil(bundle["demo"] as? [String: Any])
        XCTAssertNotNil(bundle["workoutLog"] as? [String: Any])

        let extras = try XCTUnwrap(bundle["extras"] as? [String: Any])
        XCTAssertNotNil(extras["fitforge.health.v1"], "a user-initiated export INCLUDES health keys")
        XCTAssertNil(extras["fitforge.cloudPushed.v1"], "device-local sync bookkeeping never rides any copy")
        XCTAssertNil(extras["fitforge.demo.v1"], "first-class keys do not repeat in extras")
        XCTAssertNil(extras["fitforge.workoutlog.v1"])
    }

    func testBackupBundleDefaultsAnAbsentWorkoutLog() throws {
        let data = try XCTUnwrap(MirrorLogic.backupBundle(entries: ["fitforge.demo.v1": "{}"], exportedAt: Date()))
        let bundle = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let log = try XCTUnwrap(bundle["workoutLog"] as? [String: Any])
        XCTAssertEqual((log["sessions"] as? [Any])?.count, 0)
    }

    func testBackupRequiresDemoState() {
        XCTAssertNil(MirrorLogic.backupBundle(entries: ["fitforge.health.v1": "{}"], exportedAt: Date()))
        XCTAssertNil(MirrorLogic.backupBundle(entries: [:], exportedAt: Date()))
    }
}
