import Foundation
import WebKit

/// Native side of ForgeBridge v1 (docs/IOS-SHELL-CONTRACT.md). Owns the documentStart user
/// scripts, both WKScriptMessageHandler channels ("forgebridge", "storageMirror"), and the
/// single native→page path: `evaluateJavaScript` into `window.ForgeShell._receive`.
/// Main-thread only, like WKWebView itself.
final class ForgeBridge: NSObject, WKScriptMessageHandler, BridgeOutput {
    static let bridgeChannel = "forgebridge"
    static let mirrorChannel = "storageMirror"
    static let bridgeVersion = 1
    static let capabilities = ["health", "storageMirror", "backupExport"]

    private(set) var helloReceived = false
    var isReady: Bool { helloReceived }

    private weak var webView: WKWebView?
    private let mirror: StorageMirror
    private let engine: HealthKitEngine
    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()

    private var shellVersion: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "1.0.0"
    }

    init(mirror: StorageMirror, engine: HealthKitEngine) {
        self.mirror = mirror
        self.engine = engine
        super.init()
    }

    /// The userContentController retains its handlers, so the reference chain is
    /// webView → controller → bridge → (weak) webView: no cycle.
    func attach(to webView: WKWebView) {
        self.webView = webView
        let controller = webView.configuration.userContentController
        controller.add(self, name: Self.bridgeChannel)
        controller.add(self, name: Self.mirrorChannel)
        installUserScripts()
        mirror.onGenerationChange = { [weak self] generation in
            self?.pushGeneration(generation)
        }
    }

    /// Re-bake the documentStart scripts so the restore snapshot reflects the mirror's
    /// current state. Call before any programmatic load/reload.
    func refreshUserScripts() {
        installUserScripts()
    }

    /// A committed navigation is a fresh page: it must say hello again before anything is
    /// pushed, and any in-flight batch bookkeeping is void.
    func pageDidNavigate() {
        helloReceived = false
        engine.resetTransport()
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame else { return }
        switch message.name {
        case Self.mirrorChannel: handleMirrorMessage(message.body)
        case Self.bridgeChannel: handleBridgeMessage(message.body)
        default: break
        }
    }

    // MARK: - native → page

    /// Nothing crosses before the page says hello (contract law) — early sends are dropped,
    /// not queued: the page re-requests everything it cares about after its own hello.
    func send(_ message: BridgeMessage) {
        guard helloReceived else { return }
        dispatch(BridgeEnvelope(message: message))
    }

    private func dispatch(_ envelope: BridgeEnvelope) {
        guard let webView,
              let data = try? encoder.encode(envelope),
              let json = String(data: data, encoding: .utf8)
        else { return }
        let js = "window.ForgeShell && window.ForgeShell._receive(\(Self.jsSafe(json)));"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    /// Mirror bookkeeping, not a bridge envelope — allowed pre-hello. Runs through the
    /// patched setItem, but the key is outside `fitforge.` so nothing echoes back.
    private func pushGeneration(_ generation: Int) {
        let js = "try { window.localStorage.setItem('\(MirrorLogic.generationKey)', '\(generation)'); } catch (e) {}"
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    // MARK: - page → native

    private func handleBridgeMessage(_ body: Any) {
        guard JSONSerialization.isValidJSONObject(body),
              let data = try? JSONSerialization.data(withJSONObject: body),
              let envelope = try? JSONDecoder().decode(BridgeEnvelope.self, from: data)
        else { return }

        guard envelope.v == 1 else {
            send(.unsupported(UnsupportedPayload(forId: envelope.id, type: envelope.message.type)))
            return
        }

        switch envelope.message {
        case .hello:
            helloReceived = true
            send(.helloAck(HelloAckPayload(
                shellVersion: shellVersion,
                bridgeVersion: Self.bridgeVersion,
                capabilities: Self.capabilities
            )))
        case .requestPermissions:
            engine.requestAuthorization()
        case .requestSync(let payload):
            engine.performSync(haveUpTo: payload.haveUpTo)
        case .ackBatch(let payload):
            engine.ackBatch(payload.batchId)
        case .unrecognized(let rawType):
            send(.unsupported(UnsupportedPayload(forId: envelope.id, type: rawType)))
        case .helloAck, .permissions, .batch, .syncComplete, .unsupported:
            // native→page types arriving inbound are a page bug; answer honestly.
            send(.unsupported(UnsupportedPayload(forId: envelope.id, type: envelope.message.type)))
        }
    }

    private func handleMirrorMessage(_ body: Any) {
        guard let dict = body as? [String: Any], let op = dict["op"] as? String else { return }
        switch op {
        case "set":
            guard let key = dict["key"] as? String, let value = dict["value"] as? String else { return }
            mirror.set(key: key, value: value)
        case "remove":
            guard let key = dict["key"] as? String else { return }
            mirror.remove(key: key)
        case "clear":
            mirror.clear()
        default:
            break
        }
    }

    // MARK: - documentStart scripts

    /// Order matters: restore runs against the UNPATCHED Storage so repopulation cannot echo
    /// back into the mirror; the ForgeShell global and the shim install after it.
    private func installUserScripts() {
        guard let controller = webView?.configuration.userContentController else { return }
        controller.removeAllUserScripts()
        for source in [restoreScriptSource(), Self.shellGlobalSource, Self.storageShimSource] {
            controller.addUserScript(WKUserScript(
                source: source,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            ))
        }
    }

    /// U+2028/U+2029 are valid JSON but illegal inside a JS literal.
    private static func jsSafe(_ json: String) -> String {
        json.replacingOccurrences(of: "\u{2028}", with: "\\u2028")
            .replacingOccurrences(of: "\u{2029}", with: "\\u2029")
    }

    /// Compares generations and repopulates localStorage from the mirror BEFORE any app JS
    /// runs (contract, "Native storage mirror"). The snapshot is baked in at script-install
    /// time — a documentStart script cannot await native asynchronously.
    private func restoreScriptSource() -> String {
        let snapshot = mirror.snapshot()
        let payload: [String: Any] = ["generation": snapshot.generation, "entries": snapshot.entries]
        var json = "{\"generation\":0,\"entries\":{}}"
        if JSONSerialization.isValidJSONObject(payload),
           let data = try? JSONSerialization.data(withJSONObject: payload),
           let encoded = String(data: data, encoding: .utf8) {
            json = Self.jsSafe(encoded)
        }
        return """
        (function () {
          try {
            var mirror = \(json);
            var raw = window.localStorage.getItem('\(MirrorLogic.generationKey)');
            var webGeneration = raw === null ? 0 : parseInt(raw, 10);
            if (!isFinite(webGeneration)) { webGeneration = 0; }
            if (mirror.generation <= webGeneration) { return; }
            var entries = mirror.entries;
            for (var key in entries) {
              if (Object.prototype.hasOwnProperty.call(entries, key)) {
                window.localStorage.setItem(key, entries[key]);
              }
            }
            window.localStorage.setItem('\(MirrorLogic.generationKey)', String(mirror.generation));
          } catch (e) {}
        })();
        """
    }

    /// `window.ForgeShell` — presence IS shell detection (never the user agent). The page
    /// replaces `_receive` before sending hello; the buffer only covers pathological orderings.
    private static let shellGlobalSource = """
    (function () {
      if (window.ForgeShell) { return; }
      window.ForgeShell = {
        _buffer: [],
        _receive: function (envelope) { window.ForgeShell._buffer.push(envelope); }
      };
    })();
    """

    /// Storage.prototype shim: forwards localStorage writes on `fitforge.*` keys to the
    /// mirror channel, debounced ≥250ms per key with the LATEST value read at fire time.
    /// removeItem/clear forward immediately — deletions must never lose a race to a debounce.
    private static let storageShimSource = """
    (function () {
      var PREFIX = '\(MirrorLogic.mirroredPrefix)';
      var DEBOUNCE_MS = 250;
      var timers = {};
      function forward(body) {
        try { window.webkit.messageHandlers.\(mirrorChannel).postMessage(body); } catch (e) {}
      }
      function mirrored(store, key) {
        return store === window.localStorage && typeof key === 'string' && key.indexOf(PREFIX) === 0;
      }
      var setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        setItem.call(this, key, value);
        if (!mirrored(this, key)) { return; }
        if (timers[key]) { clearTimeout(timers[key]); }
        timers[key] = setTimeout(function () {
          delete timers[key];
          var latest = null;
          try { latest = window.localStorage.getItem(key); } catch (e) {}
          if (latest !== null) { forward({ op: 'set', key: key, value: latest }); }
        }, DEBOUNCE_MS);
      };
      var removeItem = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (key) {
        removeItem.call(this, key);
        if (!mirrored(this, key)) { return; }
        if (timers[key]) { clearTimeout(timers[key]); delete timers[key]; }
        forward({ op: 'remove', key: key });
      };
      var clear = Storage.prototype.clear;
      Storage.prototype.clear = function () {
        var isLocal = this === window.localStorage;
        clear.call(this);
        if (!isLocal) { return; }
        for (var key in timers) { clearTimeout(timers[key]); }
        timers = {};
        forward({ op: 'clear' });
      };
    })();
    """
}
