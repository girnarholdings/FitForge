# iOS Shell + Apple Health — the build contract

Synthesized 2026-07-31 from a three-expert panel (iOS platform, mobile architecture, working
trainer). Every implementer builds against THIS document; the full briefs live in the session
record. Where this contract and an implementer's instinct disagree, the contract wins.

## The one-paragraph architecture

The web app at https://goforge.fit IS the product. The iOS app is a thin SwiftUI shell
(~12 Swift files, ZERO package dependencies) hosting a WKWebView of that origin, plus the only
native capabilities that matter: an Apple Health engine, a durable native mirror of the web
app's localStorage, a consent/priming surface, and a backup share-sheet. The old Supabase-era
`apps/ios` tree is retired (tagged `ios-supabase-archive`); its Theme tokens are salvaged and
re-skinned to the Forged Iron palette, its XcodeGen `project.yml` pattern and test-fixture
discipline are kept.

## Laws (violating any of these is a defect, not a choice)

1. **ORIGIN IS FOREVER.** The WKWebView loads `https://goforge.fit` with
   `WKWebsiteDataStore.default()` and `WKAppBoundDomains = [goforge.fit]`
   (`limitsNavigationsToAppBoundDomains = true`). No bundled export, no custom scheme, no
   ephemeral stores — origin identity governs localStorage, and changing it forks the user's
   entire dataset.
2. **PRIVACY.** HealthKit-derived data lands ONLY under `fitforge.health.*` (and later
   `fitforge.cycle.*`) keys — prefixes already excluded from Firestore sync by
   `SYNC_DENYLIST_PREFIXES` in `apps/web/lib/demo/store.ts`. No new prefixes for health data,
   no health data through the Cloudflare worker, no mirror files uploaded anywhere, no iCloud.
3. **LOCALSTORAGE IS A CACHE.** WebKit may evict it. The native mirror (below) is the durable
   copy; every eviction becomes a silent self-heal.
4. **THE ENGINE'S SHAPE IS FIXED.** Health data may extend `CheckIn` with OPTIONAL observed
   fields, add deductions and reason strings — never new `AdaptAction` types, never silent
   auto-applied plan edits, never replacing the manual soreness/energy/stress questions.
5. **NO VERDICTS FROM SINGLE READINGS.** RHR speaks only against a ≥14-day personal baseline,
   HRV only against ≥30 days; below those, the app stays silent about them. Red color stays
   reserved for the readiness verdict's existing red band.

## Native storage mirror (the shell's most important job)

- A `WKUserScript` at `.atDocumentStart`, `forMainFrameOnly: true`, wraps
  `Storage.prototype.setItem/removeItem/clear` and forwards writes to keys starting with
  `fitforge.` to the `storageMirror` message handler (debounced ≥250ms per key).
- Native writes each key as an atomic file under `Application Support/Mirror/` with
  `NSFileProtectionCompleteUntilFirstUserAuthentication`, plus a generation counter stored on
  both sides; the counter bumps only after the file write completes.
- On launch, a documentStart script compares generations; if the web store is missing or older
  (wiped), it repopulates all keys from the mirror BEFORE app JS runs. The web app's existing
  read-repair (store.ts invariant: normalize everything) composes with this.
- Native "Export backup" share-sheet emits the web app's existing backup-bundle format.

## ForgeBridge v1 (the message contract)

- Source of truth: `apps/web/lib/native/forgeBridge.ts` (types + guards). Swift mirror:
  `apps/ios/FitForge/Bridge/ForgeBridgeMessages.swift`. Both are exercised against the SAME
  JSON fixtures at `fixtures/forgebridge/*.json` (repo root), round-tripped in web unit tests
  and Swift `DecodingTests` — CI fails if either side drifts.
- Envelope: `{ v: 1, id: string(uuid), type: string, payload: object }`.
- Transport: page→native `window.webkit.messageHandlers.forgebridge.postMessage(envelope)`;
  native→page ONLY `evaluateJavaScript("window.ForgeShell._receive(<json>)")`. The
  `window.ForgeShell` global is injected at documentStart; **detection is the global, never the
  user agent**. Native pushes nothing before `bridge/hello`.
- Message types v1 (additive-only forever):
  - page→native: `bridge/hello {pageBridgeVersion}` · `health/requestPermissions {types}` ·
    `health/requestSync {haveUpTo: Record<metric, string|null>}` · `health/ackBatch {batchId}`
  - native→page: `bridge/helloAck {shellVersion, bridgeVersion, capabilities: string[]}` ·
    `health/permissions {perMetric: {requested, determined, yieldedData}}` ·
    `health/batch {batchId, metric, points | samples}` · `health/syncComplete {staleSince?}` ·
    `bridge/unsupported {forId, type}`
- Web treats no `helloAck` within 3s as "not in the shell" and renders the plain web app.

## Health data model (web side)

- Store: `fitforge.health.v1` — day-grained `DailyMetricPoint { date: 'YYYY-MM-DD' (user's
  local calendar), value: number, unit: string }` per metric for quantities; sleep sessions and
  external workouts cross as discrete `hkUuid`-keyed samples (dedupe key). Ingestion is
  idempotent: same date/uuid replaces, never duplicates.
- Metrics v1 (trainer-ranked, read-only): `sleep` (asleep time, NOT in-bed),
  `restingHeartRate`, `hrvSdnn`, `bodyMass` (+`bodyFatPercentage` optional), `steps`,
  `activeEnergy`, `workouts` (external). Killed for v1: VO2max, respiratory rate, stand/ring
  anything, sleep-stage scores. `menstrualFlow` deferred to a separate later opt-in.
- Native aggregation: `HKStatisticsCollectionQuery` 1-day buckets for quantities (source-level
  dedupe of Watch+iPhone); `HKAnchoredObjectQuery` with persisted anchors for sleep/bodyMass/
  workouts; `HKObserverQuery` + background delivery (hourly; sleep daily). Backfill 90 days on
  first sync.
- Selector layer `apps/web/lib/health/selectors.ts` is the ONLY way dashboards read health
  data: `overnight(date)` → `{sleepHours, sleepSource, rhr, rhrBaseline, hrvPct?} | null`,
  `weightFor(date)`, `weeklyActivity(weekStart)`, `baselines()`. Baselines: RHR = trailing
  14-day median (min 14 points), HRV = trailing 30-day median (min 30 points).

## How health data meets the product (trainer's rules)

- **Check-in**: the sleep chip row arrives PRE-SELECTED from Apple Health with a small
  "from Apple Health" tag, still tappable to correct. Soreness/energy/stress stay manual
  forever. Observed extras ride `CheckIn` as optional fields
  (`observedSleepHours?`, `rhrDeltaBpm?`, `hrvDeltaPct?`, `externalWorkoutYesterday?`);
  user-entered values always override observed ones. Deviations add deductions + a reason
  sentence in the existing voice ("resting HR is up 6 over your usual — want a lighter day?");
  the verdict still goes through the same accept/reject OfferPanel.
- **Body weight merge**: one entry per ISO date (existing law). A manual in-app entry WINS over
  a Health import for the same day; among multiple Health samples in a day take the EARLIEST
  (morning weigh-in); imports write through the existing `logWeight` path.
- **Surfaces** (exactly these, in the existing ledger/card grammar — no new card stack):
  1. TODAY: one hairline "Overnight" ledger row under the check-in row, only on days with data:
     "Slept 6:12 · resting HR 54 (usual 51)". Disappears without data — never dashes.
  2. PROGRESS→Trends: sleep + RHR trend lines join the existing TrendLine grammar.
  3. PROFILE: an "Apple Health" card (shell only): connection status, per-metric yielded/quiet,
     last sync, "open Health settings" deep-link note — plus the web-side toggle to disconnect
     (stop ingesting; keep already-imported data).
- **Bans** (product law): no acting on single readings; no red over natural variance; no guilt
  copy; no streaks/rings/badges from health data; missing data is silence, not zeroes; no
  "your recovery score" invented numbers — the readiness verdict is the one score.

## App Review posture

- Read-only HealthKit; entitlements `com.apple.developer.healthkit` (+ `background-delivery`);
  `NSHealthShareUsageDescription` written per-purpose. Privacy label: Health & Fitness,
  collected, not linked, no tracking. Privacy policy page required on goforge.fit.
- 4.2 defense = native surfaces: consent/priming flow, native Health status screen, native
  backup export, storage mirror. (A WidgetKit readiness widget is the designated v2 addition.)
- HealthKit never reveals read-denial: `yieldedData` (did any data arrive) is the only honest
  per-metric signal; empty states must offer the Settings → Health → Data Access path.

## Project + CI

- `apps/ios/project.yml` (XcodeGen) is the reviewable project source; `.xcodeproj` stays
  uncommitted and is generated on the Mac (`xcodegen generate`) and in CI. Zero SPM deps.
- `.github/workflows/ios.yml`: macOS runner, path-filtered to `apps/ios/**` +
  `fixtures/forgebridge/**`; installs XcodeGen (brew), generates, `xcodebuild build` for a
  simulator destination with `CODE_SIGNING_ALLOWED=NO`, then runs the unit-test bundle
  (DecodingTests round-trips the shared fixtures).
- Web CI already runs the web-side fixture round-trip via the normal unit-test suite.
- `apps/ios/README.md` documents the Mac build path (xcodegen → open → set team → run on
  device; HealthKit needs a real device for meaningful data).

## v1 scope fence

IN: everything above. OUT (documented, deliberate): WidgetKit widget (v2), HealthKit writes
(workout export), menstrual cycle ingestion, push notifications, App Store screenshots/copy.
