# FitForge — iOS shell

A thin SwiftUI shell (iOS 17+, Swift 5.9, **zero package dependencies**) around the product:
the web app at `https://goforge.fit`. The shell adds only what a webview cannot do itself:

- **WKWebView of the real origin** — `WKWebsiteDataStore.default()` +
  `WKAppBoundDomains = [goforge.fit]`. Origin identity governs the user's localStorage
  dataset, so it never changes (contract law: *origin is forever*).
- **Native storage mirror** — every `fitforge.*` localStorage write is mirrored to atomic
  per-key files under Application Support/Mirror (file protection: complete until first
  unlock). If WebKit ever evicts localStorage, a documentStart script silently restores it
  from the mirror before any app JS runs.
- **Apple Health engine** — read-only, 7 v1 metrics (sleep, resting HR, HRV, body weight,
  steps, active energy, workouts), 90-day backfill, hourly background delivery (sleep
  daily), delivered to the page over ForgeBridge v1. Health data lands only under
  `fitforge.health.*` keys, which are excluded from cloud sync by the web app.
- **Native surfaces** — consent/priming screen, per-metric Health status, offline
  interstitial, and an "Export backup" share-sheet emitting the web app's backup-bundle
  format.

**The build contract lives at [`docs/IOS-SHELL-CONTRACT.md`](../../docs/IOS-SHELL-CONTRACT.md)
(repo root). Where anything here disagrees with it, the contract wins.**

## Build (Mac required)

```bash
brew install xcodegen          # once
cd apps/ios
xcodegen generate              # writes FitForge.xcodeproj (never committed)
open FitForge.xcodeproj
```

Then, in Xcode:

1. **Set your team** — Signing & Capabilities → Team (or `DEVELOPMENT_TEAM` in
   `project.yml`).
2. **Change the bundle id** — `com.fitforge.app` is a placeholder; set your own
   identifier in `project.yml` (`PRODUCT_BUNDLE_IDENTIFIER`, plus `bundleIdPrefix`) and
   regenerate. HealthKit + app-bound domains require no server-side setup, but the
   HealthKit entitlement must be enabled for your App ID.
3. **Run on a real device.** HealthKit returns nothing meaningful on the simulator; the
   consent sheet, background delivery, and every yielded/quiet signal only mean something
   with a phone (and ideally a watch) that has data.

`Info.plist` and `FitForge.entitlements` are **generated** by XcodeGen from the `info:` /
`entitlements:` blocks in `project.yml` — edit the yml, not the generated files (both are
gitignored).

## Targets & schemes (CI: use these exact names)

| Thing | Name |
| --- | --- |
| Project | `FitForge.xcodeproj` (generated) |
| App target | `FitForge` |
| Unit-test target | `FitForgeTests` |
| Scheme | `FitForge` (its test action runs `FitForgeTests`) |

```bash
# what CI runs, roughly:
cd apps/ios && xcodegen generate
xcodebuild -project FitForge.xcodeproj -scheme FitForge \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  CODE_SIGNING_ALLOWED=NO build test
```

## Tests

`FitForge/Tests/DecodingTests.swift` decodes **every** fixture in
`fixtures/forgebridge/*.json` (copied into the test bundle by `project.yml` straight from
the repo root — the same files the web unit tests round-trip) and asserts a decode →
re-encode round trip preserves every field. `StorageMirrorTests.swift` covers the mirror's
generation counter, debounce/flush behaviour, filename encoding, and the backup-bundle
shape.

## Structure

```
FitForge/
├── App/
│   ├── FitForgeApp.swift      @main; flushes the mirror on backgrounding
│   ├── RootView.swift         ShellModel (webview owner), offline interstitial, toolbar
│   └── Theme/                 Forged Iron tokens (mirrors apps/web/app/globals.css)
├── Bridge/
│   ├── ForgeBridge.swift          message handlers + documentStart scripts + native→page
│   └── ForgeBridgeMessages.swift  Codable envelope/payloads (mirror of forgeBridge.ts)
├── Storage/
│   └── StorageMirror.swift    atomic per-key mirror, generation counter, backup bundle
├── Health/
│   └── HealthKitEngine.swift  read-only queries, anchors, background delivery, batching
├── Views/
│   ├── ConsentView.swift      "what feeds what" priming + the one requestAuthorization
│   └── HealthStatusView.swift per-metric yielded/quiet, last sync, export backup
└── Tests/                     DecodingTests + StorageMirrorTests (fixtures via resources)
```
