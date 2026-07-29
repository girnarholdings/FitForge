# Architecture · Readiness + AI adapt loop (dynamic split, phase 3)

How the morning check-in, the rules engine, the AI trainer and the plan-editing machinery
interconnect. One graph per element, then the composite. Every box names a real file.

## 1 · The morning check-in (rules path — works fully offline)

```mermaid
flowchart TD
    U([User taps sleep / soreness /\nenergy / stress / unwell]) --> MC[MorningCheckIn.tsx\nToday, training days only]
    MC -->|CheckIn| ENG[lib/readiness/engine.ts\nassessReadiness — transparent\ndeduction table, no model]
    ENG -->|ReadinessVerdict\nband · score · action · why| MC
    ENG -. "unwell=true bypasses scoring:\nalways rest + safety flag" .-> ENG
    MC -->|save entry| RST[(fitforge.readiness.v1\nlib/readiness/store.ts\ndevice-local by denylist)]
    MC -->|OfferPanel:\nONE accept/reject edit| U
```

## 2 · Accept: recommendation → runnable session (shared by both paths)

```mermaid
flowchart TD
    OFFER[Accepted offer\naction + optional swaps] --> DE[lib/readiness/dayEdits.ts\nbuildAdaptedDay]
    DE -->|reduce: sets halved, floor 2\ntechnique: ≤2 sets @ RPE 6\nrest: null| DAY[edited RoutineDay\nreal shape, new id/name]
    DAY --> QS[setQuickSession\nlib/demo/store.ts]
    QS --> PLAYER[/workout/quick\nWorkoutPlayer — unchanged/]
    PLAYER --> LOG[(fitforge.workoutlog.v1)]
    LOG --> HEAT[Progress heat map,\nvolume math — unchanged]
    OFFER -->|either way| DEC[recordDecision\naccepted / rejected]
    DEC --> RST[(fitforge.readiness.v1)]
```

## 3 · The AI path: describe it in your own words

```mermaid
sequenceDiagram
    participant U as User
    participant MC as MorningCheckIn
    participant CTX as lib/readiness/context.ts
    participant KB as lib/kb/client.ts askAdapt
    participant W as coach worker /adapt
    participant M as Model (Mistral / Workers AI / DeepSeek-Pro)
    U->>MC: "slept 5h, shoulder achy, gym packed"
    MC->>CTX: buildAdaptContext(routine, today, checkIn)
    Note over CTX: split name · today's exercises\n(slug/sets/muscles) · per-exercise swap\ncandidates from the app's OWN\nsubstitution engine (~1KB)
    CTX-->>MC: AdaptContext
    MC->>KB: askAdapt(feeling, context)
    KB->>W: POST task=adapt + idToken
    W->>W: parseAdaptContext — clamp,\nrebuild trusted wire object
    W->>M: ADAPT_SYSTEM + feeling + context
    M-->>W: JSON {action, swaps, reason, confidence}
    W->>W: validateAdapt — action whitelist,\nswaps ∩ sent candidates, clamp prose
    W->>W: illness gate IN CODE:\nunwell ⇒ action:=rest, swaps:=[]
    W-->>KB: validated AdaptResult
    KB-->>MC: offer
    MC->>MC: resolveSwaps — client re-checks\nagainst its own candidates (last line)
    MC-->>U: one-tap Apply / Dismiss
```

## 4 · How the trainer "knows" the app's entities

```mermaid
flowchart LR
    SL[SPLIT_LIBRARY\npackages/shared/rules/splits.ts\n31 programs] --> RT[active Routine\nlib/demo/store]
    CAT[exercise catalog\n_mock/data.ts] --> RT
    RT --> CTX[buildAdaptContext]
    CAT -->|mockSuggestSubstitutes\nscored substitution engine| CTX
    CTX -->|the ONLY vocabulary\nthe model may answer in| W[worker adapt task]
    W -->|every slug in the reply\nprovably exists here| APPLY[one-click apply]
```

The model never free-generates an exercise: the request carries the allowed vocabulary, the
worker discards anything outside it, and the client re-validates against the exact candidates it
sent. Three independent layers must all fail before an invented exercise could reach the plan.

## 5 · Model tiers in the worker (phase 2)

```mermaid
flowchart TD
    REQ[POST + optional idToken] --> V{verifyFirebaseToken}
    V -->|guest| WAI[Workers AI free chain]
    V -->|signed in| MIS[Mistral company key]
    V -->|uid ∈ PRO_USERS\n+ picked the Pro entry| DS[DeepSeek v4\nDEEPSEEK_API_KEY]
    DS -->|incident| MIS
    MIS -->|incident| WAI
```

## 6 · Where HealthKit lands later

`assessReadiness(CheckIn)` is a pure function over an input object. The iOS shell (prewalk
phase 6) adds a provider that fills the same `CheckIn` from HealthKit daily aggregates instead
of sliders — engine, day edits, store, worker task and UI are all already built for it. Nothing
in this document changes.

## Safety invariants (tested)

- `unwell` can only ever produce `rest`: enforced in the client engine (`engine.test.ts`), AND
  independently in the worker after the model answers (`worker.test.ts`), AND pinned e2e
  (`readiness.spec.ts`).
- Actions are whitelisted at three layers; swaps must be client-proposed at two.
- Rules path (check-in → offer → apply) works with no network at all; the AI path is additive.
- `fitforge.readiness.v1` never rides the cloud sweep (`SYNC_DENYLIST_PREFIXES`), is included in
  deliberate file exports, and dies with erase-everything.
