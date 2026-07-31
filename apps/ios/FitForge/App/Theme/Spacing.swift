import SwiftUI

// MARK: - Spacing, radius & layout tokens
//
// 4-pt base scale. Radius follows the web's ONE RADIUS FAMILY (globals.css): 12 / 16 / 20 /
// 24 — small tiles / fields+buttons / large tiles / cards+sheets.

public enum Spacing {
    public static let xs: CGFloat = 4
    public static let s: CGFloat = 8
    public static let m: CGFloat = 12
    public static let l: CGFloat = 16
    public static let xl: CGFloat = 24
    public static let xxl: CGFloat = 32
    public static let xxxl: CGFloat = 48

    /// Standard screen horizontal inset.
    public static let screenH: CGFloat = 20
    /// Minimum tap target.
    public static let tapTarget: CGFloat = 44
}

public enum Radius {
    public static let sm: CGFloat = 12
    public static let field: CGFloat = 16
    public static let lg: CGFloat = 20
    public static let card: CGFloat = 24
    public static let pill: CGFloat = 999
}

public extension View {
    /// Standard card container: lifted fill (elevation is fill separation), whisper border.
    func ffCard(padding: CGFloat = Spacing.l) -> some View {
        self.padding(padding)
            .background(Palette.surface2, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                    .strokeBorder(Palette.border, lineWidth: 1)
            )
    }

    /// Screen horizontal padding.
    func ffScreenPadding() -> some View { self.padding(.horizontal, Spacing.screenH) }
}
