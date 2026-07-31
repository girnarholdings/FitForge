import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// Lightweight haptic helper: `.selection` on taps, `.success` on completed flows.
/// No-ops on platforms without UIKit so previews stay pure.
public enum Haptics {
    public static func selection() {
        #if canImport(UIKit)
        UISelectionFeedbackGenerator().selectionChanged()
        #endif
    }

    public static func impact(_ style: ImpactStyle = .light) {
        #if canImport(UIKit)
        UIImpactFeedbackGenerator(style: style.uiStyle).impactOccurred()
        #endif
    }

    public static func notify(_ type: NotificationType) {
        #if canImport(UIKit)
        UINotificationFeedbackGenerator().notificationOccurred(type.uiType)
        #endif
    }

    public enum ImpactStyle {
        case light, medium, heavy, rigid, soft
        #if canImport(UIKit)
        var uiStyle: UIImpactFeedbackGenerator.FeedbackStyle {
            switch self {
            case .light: return .light
            case .medium: return .medium
            case .heavy: return .heavy
            case .rigid: return .rigid
            case .soft: return .soft
            }
        }
        #endif
    }

    public enum NotificationType {
        case success, warning, error
        #if canImport(UIKit)
        var uiType: UINotificationFeedbackGenerator.FeedbackType {
            switch self {
            case .success: return .success
            case .warning: return .warning
            case .error: return .error
            }
        }
        #endif
    }
}
