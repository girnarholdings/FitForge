import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Forged Iron color tokens
//
// Mirrored from apps/web/app/globals.css — the web app OWNS the palette; this file only
// re-states it for the few native surfaces (consent, health status, offline interstitial).
// Dark values come from :root (the brand default: warm iron, never blue-black; copper is the
// only accent, ember strictly heat-state), light values from :root[data-theme='light'].
// Native follows the OS appearance because the shell cannot see the web app's data-theme
// choice; the dark values are the brand default either way.

public enum Palette {
    // Surfaces — elevation is fill separation, borders only outline.
    public static let surface = adaptive(light: 0xF7F2ED, dark: 0x131010)
    public static let surface2 = adaptive(light: 0xFFFFFF, dark: 0x1D1815)
    public static let elevated = adaptive(light: 0xFFFFFF, dark: 0x282019)

    public static let foreground = adaptive(light: 0x14171F, dark: 0xF3EDE5)
    public static let mutedForeground = adaptive(light: 0x5B6372, dark: 0xA89E93)

    public static let border = adaptive(light: 0xE6DDD3, dark: 0x2C2520)
    public static let borderStrong = adaptive(light: 0xCEC0B2, dark: 0x4A4036)

    // Copper accent (bronze on light for AA) + its pressed state and ink.
    public static let accent = adaptive(light: 0x8F5432, dark: 0xC98963)
    public static let accentPress = adaptive(light: 0x74421F, dark: 0xB0714C)
    public static let accentForeground = adaptive(light: 0xFFFFFF, dark: 0x1C0F08)
    public static let accentMuted = adaptive(light: 0xF4E3D6, dark: 0x2B1D14)

    // Ember: heat-state only (the leading edge of real progress), never ambience.
    public static let energy = adaptive(light: 0xD85F1E, dark: 0xE2703A)

    public static let danger = adaptive(light: 0xD92D33, dark: 0xFF6B70)
    public static let success = adaptive(light: 0x0F8A4C, dark: 0x3ECF8E)
    public static let info = adaptive(light: 0x2668C5, dark: 0x7CB4FF)

    private static func adaptive(light: UInt32, dark: UInt32) -> Color {
        #if canImport(UIKit)
        Color(UIColor { trait in
            trait.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light)
        })
        #else
        Color(hex: dark)
        #endif
    }
}

public extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: alpha)
    }
}

#if canImport(UIKit)
public extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(red: CGFloat((rgb >> 16) & 0xFF) / 255,
                  green: CGFloat((rgb >> 8) & 0xFF) / 255,
                  blue: CGFloat(rgb & 0xFF) / 255,
                  alpha: 1)
    }
}
#endif
