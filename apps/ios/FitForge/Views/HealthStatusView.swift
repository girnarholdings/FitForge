import SwiftUI

/// The sheet the toolbar heart button summons: consent first, status once connected.
struct HealthSheetView: View {
    @ObservedObject var engine: HealthKitEngine
    let mirror: StorageMirror
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if engine.consentRequested {
                    HealthStatusView(engine: engine, mirror: mirror)
                } else {
                    ConsentView(engine: engine)
                }
            }
            .navigationTitle("Apple Health")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Palette.accent)
                }
            }
            .toolbarBackground(Palette.surface, for: .navigationBar)
        }
    }
}

/// Per-metric receiving/quiet, last sync, the honest Settings→Health note, and the backup
/// share-sheet. `yieldedData` is the ONLY per-metric signal shown — HealthKit never reveals
/// read-denial, and pretending otherwise would lie.
struct HealthStatusView: View {
    @ObservedObject var engine: HealthKitEngine
    let mirror: StorageMirror
    @State private var backupURL: URL?

    private static let metricRows: [(metric: HealthMetric, label: String)] = [
        (.sleep, "Sleep"),
        (.restingHeartRate, "Resting heart rate"),
        (.hrvSdnn, "Heart rate variability"),
        (.bodyMass, "Body weight"),
        (.steps, "Steps"),
        (.activeEnergy, "Active energy"),
        (.workouts, "Workouts"),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.l) {
                connectionCard
                metricsCard
                Text("iOS never tells apps which Health permissions were denied. If a metric stays quiet and you expect data, check Settings → Health → Data Access & Devices → FitForge.")
                    .font(.ffFootnote)
                    .foregroundStyle(Palette.mutedForeground)
                backupCard
            }
            .padding(Spacing.screenH)
        }
        .background(Palette.surface.ignoresSafeArea())
        .onAppear(perform: prepareBackup)
    }

    private var connectionCard: some View {
        HStack(spacing: Spacing.m) {
            Circle()
                .fill(Palette.success)
                .frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 2) {
                Text("Connected")
                    .font(.ffHeadline)
                    .foregroundStyle(Palette.foreground)
                Text(lastSyncLine)
                    .font(.ffFootnote)
                    .foregroundStyle(Palette.mutedForeground)
            }
            Spacer(minLength: 0)
        }
        .ffCard()
    }

    private var lastSyncLine: String {
        guard let date = engine.lastSyncDate else { return "No sync yet — open the app's Today screen to pull data." }
        return "Last sync \(date.formatted(.relative(presentation: .named)))"
    }

    private var metricsCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(Self.metricRows.enumerated()), id: \.offset) { index, row in
                if index > 0 {
                    Divider().overlay(Palette.border)
                }
                metricRow(row.metric, label: row.label)
            }
        }
        .ffCard(padding: Spacing.m)
    }

    private func metricRow(_ metric: HealthMetric, label: String) -> some View {
        let yielded = engine.yieldedData[metric.rawValue] ?? false
        return HStack(spacing: Spacing.m) {
            Circle()
                .fill(yielded ? Palette.success : Palette.borderStrong)
                .frame(width: 6, height: 6)
            Text(label)
                .font(.ffSubheadline)
                .foregroundStyle(Palette.foreground)
            Spacer(minLength: 0)
            Text(yielded ? "receiving data" : "quiet")
                .font(.ffFootnote)
                .foregroundStyle(yielded ? Palette.success : Palette.mutedForeground)
        }
        .padding(.vertical, Spacing.s)
    }

    private var backupCard: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            Text("Backup")
                .ffSectionHeader()
            Text("Everything the app stores on this device, as one file you keep. Health data included — it still never leaves the device unless you share this file.")
                .font(.ffFootnote)
                .foregroundStyle(Palette.mutedForeground)
            if let backupURL {
                ShareLink(item: backupURL) {
                    Label("Export backup", systemImage: "square.and.arrow.up")
                        .font(.ffHeadline)
                        .foregroundStyle(Palette.accentForeground)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: Spacing.tapTarget)
                        .background(Palette.accent, in: RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
                }
            } else {
                Text("Nothing to export yet — the backup appears once the app has data.")
                    .font(.ffFootnote)
                    .foregroundStyle(Palette.mutedForeground)
            }
        }
        .ffCard()
    }

    /// Built on appear, not on tap: ShareLink needs its item up front, and the bundle is a
    /// small local read.
    private func prepareBackup() {
        guard let data = mirror.exportBackupData() else {
            backupURL = nil
            return
        }
        let name = "FitForge-backup-\(HealthKitEngine.dayString(Date())).json"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        do {
            try data.write(to: url, options: .atomic)
            backupURL = url
        } catch {
            backupURL = nil
        }
    }
}

#Preview("Status") {
    HealthSheetView(engine: HealthKitEngine(), mirror: StorageMirror())
}
