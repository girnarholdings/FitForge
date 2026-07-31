import SwiftUI

/// Pre-permission priming: WHAT FEEDS WHAT, before the system sheet asks. The single
/// `requestAuthorization` call happens here (or via `health/requestPermissions` from the
/// page — the same engine call; iOS shows the sheet only once either way).
struct ConsentView: View {
    @ObservedObject var engine: HealthKitEngine
    @State private var requesting = false

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xl) {
            VStack(alignment: .leading, spacing: Spacing.s) {
                Text("Connect Apple Health")
                    .font(.ffTitle2)
                    .foregroundStyle(Palette.foreground)
                Text("Read-only. Everything stays on this device — nothing is uploaded, ever.")
                    .font(.ffSubheadline)
                    .foregroundStyle(Palette.mutedForeground)
            }

            VStack(alignment: .leading, spacing: Spacing.l) {
                feedRow(icon: "bed.double.fill", title: "Sleep",
                        feeds: "sets your morning readiness")
                feedRow(icon: "heart.fill", title: "Resting heart rate & HRV",
                        feeds: "gauges recovery against your own baseline")
                feedRow(icon: "scalemass.fill", title: "Body weight",
                        feeds: "draws your long-term trends")
                feedRow(icon: "figure.walk", title: "Steps, energy & workouts",
                        feeds: "adds weekly training context")
            }
            .ffCard()

            Text("You choose exactly what to allow on the next screen, and you can change it any time in Settings → Health.")
                .font(.ffFootnote)
                .foregroundStyle(Palette.mutedForeground)

            Spacer(minLength: 0)

            connectButton

            if !engine.isHealthDataAvailable {
                Text("Health data isn't available on this device.")
                    .font(.ffFootnote)
                    .foregroundStyle(Palette.mutedForeground)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(Spacing.screenH)
        .background(Palette.surface.ignoresSafeArea())
    }

    private func feedRow(icon: String, title: String, feeds: String) -> some View {
        HStack(alignment: .top, spacing: Spacing.m) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Palette.accent)
                .frame(width: 36, height: 36)
                .background(Palette.accentMuted, in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.ffHeadline)
                    .foregroundStyle(Palette.foreground)
                Text(feeds)
                    .font(.ffSubheadline)
                    .foregroundStyle(Palette.mutedForeground)
            }
        }
    }

    private var connectButton: some View {
        Button {
            requesting = true
            Haptics.impact(.light)
            engine.requestAuthorization {
                requesting = false
                Haptics.notify(.success)
            }
        } label: {
            Text(requesting ? "Connecting…" : "Connect Apple Health")
                .font(.ffHeadline)
                .foregroundStyle(Palette.accentForeground)
                .frame(maxWidth: .infinity)
                .frame(minHeight: Spacing.tapTarget)
                .background(Palette.accent, in: RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
        }
        .disabled(requesting || !engine.isHealthDataAvailable)
    }
}

#Preview("Consent") {
    ConsentView(engine: HealthKitEngine())
}
