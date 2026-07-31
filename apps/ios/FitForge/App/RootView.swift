import SwiftUI
import WebKit

/// Owns the WKWebView and every native service for the app's single scene. Created once by
/// FitForgeApp; all use is main-thread (SwiftUI + WebKit both demand it).
final class ShellModel: NSObject, ObservableObject, WKNavigationDelegate {
    static let homeURL = URL(string: "https://goforge.fit")!

    @Published var initialLoadFailed = false
    @Published var healthSheetPresented = false

    let mirror: StorageMirror
    let engine: HealthKitEngine
    let bridge: ForgeBridge
    let webView: WKWebView

    private var hasCommittedLoad = false

    override init() {
        mirror = StorageMirror()
        engine = HealthKitEngine()

        let configuration = WKWebViewConfiguration()
        // ORIGIN IS FOREVER (contract law 1): the default persistent store + app-bound
        // domains. No bundled export, no custom scheme, no ephemeral stores.
        configuration.websiteDataStore = .default()
        configuration.limitsNavigationsToAppBoundDomains = true
        configuration.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        // Brand surface behind the page kills the white flash before first paint.
        webView.isOpaque = false
        webView.backgroundColor = UIColor(rgb: 0x131010)
        webView.scrollView.backgroundColor = UIColor(rgb: 0x131010)
        self.webView = webView

        bridge = ForgeBridge(mirror: mirror, engine: engine)
        super.init()

        engine.output = bridge
        bridge.attach(to: webView)
        webView.navigationDelegate = self
        engine.startObserversIfAuthorized()
        loadHome()
    }

    func loadHome() {
        initialLoadFailed = false
        // Re-bake documentStart scripts so the restore snapshot is current for this load.
        bridge.refreshUserScripts()
        webView.load(URLRequest(url: Self.homeURL))
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        hasCommittedLoad = true
        bridge.pageDidNavigate()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        initialLoadFailed = false
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleLoadFailure(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleLoadFailure(error)
    }

    /// The interstitial covers only the empty webview; a failed sub-navigation on a loaded
    /// app is the web app's problem to surface.
    private func handleLoadFailure(_ error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        if !hasCommittedLoad {
            initialLoadFailed = true
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var shell: ShellModel

    var body: some View {
        ZStack {
            Palette.surface.ignoresSafeArea()
            WebViewContainer(shell: shell)
                .ignoresSafeArea()
            if shell.initialLoadFailed {
                OfflineView { shell.loadHome() }
            }
        }
        .overlay(alignment: .topTrailing) {
            if !shell.initialLoadFailed {
                healthButton
            }
        }
        .sheet(isPresented: $shell.healthSheetPresented) {
            HealthSheetView(engine: shell.engine, mirror: shell.mirror)
        }
    }

    /// The one native affordance over the webview — deliberately quiet: the web app is the
    /// product, this only opens the native Health/backup sheet.
    private var healthButton: some View {
        Button {
            Haptics.selection()
            shell.healthSheetPresented = true
        } label: {
            Image(systemName: "heart.text.square")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Palette.mutedForeground)
                .padding(Spacing.s)
                .background(.ultraThinMaterial, in: Circle())
        }
        .opacity(0.55)
        .padding(.trailing, Spacing.m)
        .accessibilityLabel("Apple Health and backup")
    }
}

/// Hosts the long-lived WKWebView (owned by ShellModel — SwiftUI must never recreate it,
/// or localStorage-in-flight and bridge state would be lost with it).
private struct WebViewContainer: UIViewRepresentable {
    let shell: ShellModel

    func makeCoordinator() -> Coordinator {
        Coordinator(shell: shell)
    }

    func makeUIView(context: Context) -> WKWebView {
        let webView = shell.webView
        if webView.scrollView.refreshControl == nil {
            let refresh = UIRefreshControl()
            refresh.addTarget(context.coordinator, action: #selector(Coordinator.refresh(_:)), for: .valueChanged)
            webView.scrollView.refreshControl = refresh
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject {
        private let shell: ShellModel

        init(shell: ShellModel) {
            self.shell = shell
        }

        @objc func refresh(_ sender: UIRefreshControl) {
            shell.webView.reload()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                sender.endRefreshing()
            }
        }
    }
}

/// Native interstitial for a failed INITIAL load — the one moment there is no web app to
/// speak for itself.
struct OfflineView: View {
    let retry: () -> Void

    var body: some View {
        VStack(spacing: Spacing.xl) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 40, weight: .medium))
                .foregroundStyle(Palette.mutedForeground)
            VStack(spacing: Spacing.s) {
                Text("Can't reach FitForge")
                    .font(.ffTitle2)
                    .foregroundStyle(Palette.foreground)
                Text("Your data is safe on this device. Everything will be right where you left it once you're back online.")
                    .font(.ffSubheadline)
                    .foregroundStyle(Palette.mutedForeground)
                    .multilineTextAlignment(.center)
            }
            Button(action: retry) {
                Text("Try again")
                    .font(.ffHeadline)
                    .foregroundStyle(Palette.accentForeground)
                    .padding(.vertical, Spacing.m)
                    .padding(.horizontal, Spacing.xxl)
                    .background(Palette.accent, in: RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
            }
        }
        .padding(Spacing.xxl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.surface.ignoresSafeArea())
    }
}

#Preview("Offline") {
    OfflineView {}
}
