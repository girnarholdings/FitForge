# Syncing steps, calories and health data

What is actually possible, per platform, and what FitForge does about it.

## The short version

**A website cannot read Apple Health or Health Connect. There is no API for it, on any browser, on
any operating system.** This is not a gap in our implementation — it is the design of both
platforms, and no amount of work on our side changes it.

| Source | Direct read from a website | Direct read from the iOS app |
|---|---|---|
| Apple Health (HealthKit) | **No** — native framework, Swift/Obj-C only | **Yes** |
| Android Health Connect | **No** — Android SDK, app-to-app permission model | n/a |
| Google Fit REST API | Deprecated; Google directs developers to Health Connect, which is on-device only | n/a |
| Fitbit / Garmin / Strava / Withings | **Yes**, via OAuth + their web APIs | Yes |
| Manual export files | **Yes** — this is the path FitForge implements | Yes |

So there are exactly three honest routes for the web app:

1. **File import.** The user exports from Health / Health Connect and hands us the file. Works on
   every browser and every platform, needs no account, and keeps the app's no-backend promise.
2. **Third-party OAuth** (Fitbit, Garmin, Strava). Real-time-ish and automatic, but each needs a
   registered app, a client secret, and therefore a server — which this app deliberately does not
   have. A Cloudflare Worker could hold the secret if this is ever wanted.
3. **The native iOS app** reading HealthKit directly, which is the only route that is both
   automatic and first-party.

Anything promising "connect your Apple Health to a website" is doing (1) or (2) underneath.

---

## Web: file import (implemented)

### Apple Health

The user exports from the Health app: **profile picture → Export All Health Data**. That produces
`export.zip`, containing `export.xml` — every record Health holds, as one XML document. It is large
(hundreds of MB for a long history) which is why the parser streams rather than loading it whole.

The records we read:

| Record type | What it becomes |
|---|---|
| `HKQuantityTypeIdentifierStepCount` | daily steps |
| `HKQuantityTypeIdentifierActiveEnergyBurned` | daily active calories |
| `HKQuantityTypeIdentifierBodyMass` | weight entries |

Records are summed per **local** day from their `startDate`, matching how Health itself reports
daily totals.

**Overlapping sources are the trap.** If the user wears a Watch *and* carries the iPhone, Health
holds a step record from each, and naively summing them double-counts. Health's own daily total
de-duplicates by preferring one source. The parser therefore groups by `sourceName` and keeps the
single highest-total source per day rather than adding them together — an undercount is recoverable,
a silent 2× overcount is not.

### Android

Health Connect (Android 14+) can export its data, and Samsung Health / Google Fit both export CSV.
The importer accepts a generic CSV with a date column and step/calorie columns, since there is no
single standard shape across those apps.

### "Force refresh"

A browser cannot re-read a file it was handed earlier — the `File` object is a one-shot snapshot.
Two behaviours, depending on the browser:

- **Chromium desktop** (File System Access API): the file *handle* is kept in IndexedDB, so
  **Refresh** re-reads the same `export.xml` in place, with no picker. This is the real force-refresh.
- **Everywhere else** (Safari, Firefox, all of iOS): **Refresh** re-opens the picker. The API simply
  does not exist there, and pretending otherwise would be a button that silently does nothing.

The UI says which of the two you are getting rather than showing an identical button that behaves
differently per browser.

---

## iOS app: HealthKit (explored, not yet built)

This is the only route that is genuinely automatic, and it is straightforward — the app already has
a Swift target under `apps/ios`.

**What is readable.** Effectively everything in Health, subject to per-type user consent:
steps, active and basal energy, distance, flights climbed, heart rate, resting and walking heart
rate, HRV, VO₂ max, sleep, body mass, body fat percentage, lean body mass, workouts with their
own energy and distance. FitForge would ask for a narrow set first — steps, active energy, body
mass, workouts — because HealthKit's permission sheet lists every type you request, and a long list
at first launch reads as overreach.

**What it requires.**

1. The **HealthKit capability** on the app target, and `com.apple.developer.healthkit` in the
   entitlements.
2. `NSHealthShareUsageDescription` in `Info.plist` — the sentence shown in the consent sheet.
   `NSHealthUpdateUsageDescription` too, if FitForge ever writes workouts back.
3. `HKHealthStore.requestAuthorization(toShare:read:)` at a point where the user understands why.

**Two behaviours worth knowing before designing around it.**

- **Read permission is invisible.** If the user denies read access, queries return *empty results*,
  not an error — HealthKit deliberately does not reveal that data was withheld, because "this app
  can tell you refused" is itself a leak. So "no data" and "denied" are indistinguishable, and the
  UI must not claim the user has zero steps.
- **Background delivery** (`enableBackgroundDelivery`) allows updates without the app being opened,
  but for step-type data iOS coalesces these to roughly hourly. An explicit refresh-on-open is still
  needed, which is the same "force refresh" the web has.

**Writing back** is possible and would let FitForge's logged workouts appear in Health's activity
rings. It needs the separate share permission, and every sample must carry an `HKSource` so the user
can attribute — and delete — what we wrote.

**Sync to the web app.** The iOS app and the web app do not currently share storage. Bridging them
means either a backend (the Supabase layer is scaffolded but not wired) or an export/import handoff
through the same file format the web importer already reads. The latter needs no server and is the
smaller step.

---

## Why not "sync everything automatically" today

It is worth being direct about the cost of each remaining option:

- **Third-party OAuth** needs a client secret, which needs a server. The Coach worker shows this is
  cheap to add — but it changes FitForge from "your data never leaves your browser" to "your data
  passes through our worker", and that promise is currently on the landing page.
- **A backend** would make everything simple and is already scaffolded under `supabase/`. It is a
  product decision, not a technical blocker.

The file importer is the option that adds real capability while keeping the current promise intact.
