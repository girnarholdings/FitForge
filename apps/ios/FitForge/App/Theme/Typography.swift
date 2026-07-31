import SwiftUI

// MARK: - Typography scale
//
// System font with Dynamic Type. The web app sets the brand's type (Archivo body, Big
// Shoulders display); bundling those here would be weight the shell's three native screens
// cannot justify (zero-dependency law), so the system face at the same scale stands in.
// Use these instead of ad-hoc `.font(...)` so the native screens stay consistent.

public extension Font {
    static let ffLargeTitle = Font.system(.largeTitle).weight(.bold)
    static let ffTitle = Font.system(.title).weight(.bold)
    static let ffTitle2 = Font.system(.title2).weight(.semibold)
    static let ffTitle3 = Font.system(.title3).weight(.semibold)
    static let ffHeadline = Font.system(.headline)
    static let ffBody = Font.system(.body)
    static let ffCallout = Font.system(.callout)
    static let ffSubheadline = Font.system(.subheadline)
    static let ffFootnote = Font.system(.footnote)
    static let ffCaption = Font.system(.caption)
    /// Tabular monospaced digits for anything numeric that updates in place.
    static let ffMono = Font.system(.body).monospacedDigit()
}

public extension Text {
    func ffSectionHeader() -> some View {
        self.font(.ffFootnote.weight(.semibold))
            .foregroundStyle(Palette.mutedForeground)
            .textCase(.uppercase)
            .kerning(0.5)
    }
}
