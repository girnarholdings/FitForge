import SwiftUI

@main
struct FitForgeApp: App {
    @StateObject private var shell = ShellModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(shell)
        }
        .onChange(of: scenePhase) { _, phase in
            // Backgrounding is the last reliable moment to persist — the mirror's debounce
            // window must not survive a suspension kill.
            if phase == .background {
                shell.mirror.flush()
            }
        }
    }
}
