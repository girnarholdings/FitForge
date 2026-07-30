# Firebase — Google sign-in and cloud sync (free tier)

FitForge works with **no Firebase project at all**: that is Local Mode, and it stays the default.
Adding Firebase turns on two things:

1. **Sign in with Google**, and a copy of your training in the cloud that survives losing the device.
2. **The members-only AI model.** Signed-in users are served by FitForge's own Mistral key;
   everyone else uses the shared free Workers AI tier. That split exists for capacity: when
   anonymous traffic exhausts the free tier, signed-in users are unaffected.

Everything below fits inside the **Spark (free) plan**. No card, no Blaze upgrade.

> ## Status for this repository
>
> The project **`fitforge-007`** is already wired in: its web config is committed as the default
> in `.github/workflows/pages.yml`, and `workers/coach/wrangler.toml` carries
> `FIREBASE_PROJECT_ID = "fitforge-007"`. **Steps 1, 2, 6 and 7 are done.**
>
> What still has to happen in the Firebase console, because no API can do it for you:
>
> - **Step 3** — enable the Google sign-in provider
> - **Step 4** — add `goforge.fit`, `girnarholdings.github.io` and `localhost` to authorised
>   domains, **in lower case** (see the note in step 4 — a capitalised entry passes the check you
>   can see and fails the one you cannot)
> - **Step 5** — create Firestore and publish the security rules
>
> Until those three are done, the Sign in button appears and the popup fails. And run
> `cd workers/coach && npx wrangler deploy` once to arm the members-only model gate.

---

## Step 1 · Create the project

1. <https://console.firebase.google.com> → **Create a project**.
2. Name it (e.g. `fitforge`). Google Analytics is optional — **off** is fine and one less consent
   banner to reason about.
3. Wait for provisioning, then open the project.

## Step 2 · Register the web app

1. Project overview → the **`</>`** (Web) icon.
2. Nickname `fitforge-web`. **Do not** tick "Firebase Hosting" — the app is deployed to GitHub
   Pages at `goforge.fit`.
3. Copy the `firebaseConfig` values it shows you. You need six of them:

   | Console field       | Repository variable                        |
   | ------------------- | ------------------------------------------ |
   | `apiKey`            | `FIREBASE_API_KEY`                         |
   | `authDomain`        | `FIREBASE_AUTH_DOMAIN`                     |
   | `projectId`         | `FIREBASE_PROJECT_ID`                      |
   | `storageBucket`     | `FIREBASE_STORAGE_BUCKET`                  |
   | `messagingSenderId` | `FIREBASE_MESSAGING_SENDER_ID`             |
   | `appId`             | `FIREBASE_APP_ID`                          |

> **This config is meant to be public.** It identifies the project; it authorises nothing. What
> protects the data is the security rules in step 5 plus the authorised domains in step 4. (The
> Mistral key is the opposite — a real credential — which is why it lives only on the Cloudflare
> worker and never in the app bundle.)

## Step 3 · Turn on Google sign-in

**Authentication** → **Get started** → **Sign-in method** → **Google** → Enable.
Set a support email, then **Save**.

## Step 4 · Authorise the domains

**Authentication → Settings → Authorized domains**. Add every origin the app is served from:

```
goforge.fit
girnarholdings.github.io
localhost
```

Missing this is the single most common cause of "the popup opens and immediately closes".

**Type them in lower case.** The client-side check the SDK runs is case-insensitive, so a
`GoForge.fit` entry gets past it — but the entry is also used server-side by the
`/__/auth/handler` page that the popup lands on, and that check is not documented as
case-folding. An entry with capitals therefore fails in the one place you cannot see, after the
account chooser, which reads as "I picked my account and nothing happened". If an entry already
has capitals, delete it and re-add it lower case; there is no cost to doing so and it removes a
suspect that is otherwise very hard to rule out.

You can read back what the project currently has, without any credential beyond the public web
API key, which is faster than trusting the console UI:

```sh
curl -s "https://identitytoolkit.googleapis.com/v1/projects?key=$NEXT_PUBLIC_FIREBASE_API_KEY"
```

The same endpoint is the quickest way to confirm the Google provider is on — a bogus token comes
back as `INVALID_IDP_RESPONSE` when the provider is enabled and `OPERATION_NOT_ALLOWED` when it
is not:

```sh
curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=$NEXT_PUBLIC_FIREBASE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"postBody":"id_token=bogus&providerId=google.com","requestUri":"https://goforge.fit","returnSecureToken":true}'
```

## Step 5 · Create Firestore and lock it down

1. **Firestore Database** → **Create database** → **Production mode** (never test mode: it is
   world-readable and expires) → pick a region near your users (e.g. `eur3` or `nam5`).
2. **Rules** tab → replace everything with this, then **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // One document per user, readable and writable only by that user.
    //
    // `request.auth.uid == uid` is the whole security model: a signed-in user can reach exactly
    // their own document and nothing else, and a signed-out request can reach nothing at all.
    match /users/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;

      // Writes are additionally shape-checked, so a compromised or buggy client cannot turn a
      // user document into arbitrary storage: one string field, one number, one schema marker,
      // and a hard size ceiling well under Firestore's 1 MiB document limit.
      allow write: if request.auth != null
                   && request.auth.uid == uid
                   && request.resource.data.keys().hasOnly(['bundle', 'updatedAt', 'schema'])
                   && request.resource.data.bundle is string
                   && request.resource.data.bundle.size() < 900000
                   && request.resource.data.updatedAt is int
                   && request.resource.data.schema == 2;
    }

    // Everything else is closed. New collections must be opened deliberately, never by default.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**No composite indexes are needed.** The app reads and writes exactly one document by id
(`users/{uid}`) and never queries a collection, so Firestore's automatic single-field indexes
cover it. If you later add a query, the console will offer the index it needs with a direct link.

### What is actually stored

One document per user:

```jsonc
users/<uid> = {
  "bundle":    "{…}",   // the same JSON that Settings → Export data produces
  "updatedAt": 1785292000000,
  "schema":    2
}
```

The bundle is the whole Local Mode state — plan, workout log, meals, preferences — as one string.
It is written back through the same validator that guards file imports, so a corrupt or hostile
document is rejected rather than partially applied.

### What happens when the device and the account disagree

Sign-in reconciles once, and the rule lives in one pure function — `apps/web/lib/auth/reconcileRule.ts`
— so it can be read and tested without standing up a fake Firestore:

| this browser | the account | what happens |
| --- | --- | --- |
| anything | no document yet | **push** — this device becomes the account's copy |
| no finished onboarding | has a copy | **pull** — the new-device case |
| has training, has pushed to *this* uid before | newer than our last push | **pull**, silently — a sibling device moved our shared history forward |
| has training, has pushed to *this* uid before | not newer | **push** |
| has training, has **never** pushed to this uid | has a readable copy | **ask** — two unrelated histories, so nothing is written on either side until the athlete chooses |

That last row is the one worth knowing about. It covers a second athlete signing in on a shared
laptop, and signing in on a device restored from somebody else's export. The app shows both copies
side by side (workouts, food days, food entries, weigh-ins, plan) and offers three verbs: **merge**
(a union — nothing is deleted), **use my account's copy**, or **keep this device's data**. While the
question is open the debounced mirror is latched off, so the account copy cannot be overwritten by
the very device that is still being asked about it.

"Has this device pushed to this uid before" is remembered in two `fitforge.cloudPushed*` keys, which
are excluded from both the cloud bundle and file exports — they describe the device, not the
training, and an imported copy of them would let a device inherit sync history it never had.

**Settings → Import data** asks the same merge-or-overwrite question, for the same reason.

**Free-tier headroom.** Spark allows 50k document reads, 20k writes and 1 GiB stored per day.
This design costs **one read per sign-in** and **one write per ~4 seconds of active editing**
(changes are debounced), so a heavy user costs a few dozen writes a day. A thousand daily active
users sit comfortably inside the free tier.

## Step 6 · Give the values to the build

`fitforge-007`'s config is **committed as the default** in `.github/workflows/pages.yml`, so the
build already has it and nothing needs setting for this repository.

To point a build at a *different* project, add repository variables under
**Settings → Secrets and variables → Actions → Variables** — they take precedence over the
committed defaults:

```
FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID,
FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID
```

Clear the defaults in the workflow and set no variables, and the app builds exactly as it did
before accounts existed: no sign-in UI, Local Mode only.

### Why committing this config is not a leak

Every value in a Firebase **web** config is inlined into the JavaScript bundle that each visitor
downloads — there is no way to ship browser-side Firebase without publishing them, and Google
documents them as safe to expose. They identify the project; they authorise nothing. Access is
decided by the security rules in step 5 and the authorised-domain list in step 4.

The contrast worth holding onto: `MISTRAL_API_KEY` **is** a real credential, which is exactly why
it lives only as a Cloudflare secret on the worker and never in this repository or the bundle.

## Step 7 · Tell the worker which project to trust

The worker verifies Firebase ID tokens before unlocking the members-only model. It needs the
project id — a plain variable, not a secret:

```bash
cd workers/coach
npx wrangler deploy   # ships FIREBASE_PROJECT_ID from wrangler.toml
```

Set it in `workers/coach/wrangler.toml` under `[vars]` first:

```toml
FIREBASE_PROJECT_ID = "your-project-id"
```

Until this is set, **no token can be verified**, so every request is served by the free tier —
the safe direction to fail. Confirm with the health check:

```bash
curl https://fitforge-coach.<subdomain>.workers.dev
# {"ok":true,…,"auth":"firebase",…}     ← "none" means the project id is not set
```

---

## Verifying the whole path

| Check | Where | Expected |
| --- | --- | --- |
| Sign-in works | app → Settings → Account | Your Google name and email appear |
| Sync works | sign in on a second browser | Your plan and history appear |
| Rules hold | Firebase console → Firestore → Usage | No `permission-denied` spikes |
| Gate holds | `curl` the worker with `{"model":"mistral-small-latest"}` and no token | Response says `"provider":"workers-ai"` |

The last row is the one worth re-running after any worker change: it is the check that anonymous
traffic cannot spend the company's model allowance.

## Troubleshooting

The app now prints the actual Firebase error code under the button rather than a single generic
sentence, so start by reading what it says — most of these are identifiable at a glance.

| Symptom | Cause | Fix |
| --- | --- | --- |
| Popup opens then closes instantly | Domain not authorised | Step 4 |
| Account chooser appears, then nothing | Authorised-domain entry has capitals | Step 4 — re-add it lower case |
| `auth/operation-not-allowed` | Google provider disabled | Step 3 |
| "Could not load Google's sign-in script" | Content blocker or network filter is blocking `apis.google.com` | Disable the blocker for this site |
| Nothing happens at all on a phone | The popup was blocked | The app now retries as a full-page redirect by itself; if that also fails, allow pop-ups |
| Sync says "rules rejected the write" | Rules not published, or shape changed | Re-publish step 5 |
| Signed in but still on the free model | Worker has no `FIREBASE_PROJECT_ID` | Step 7, then redeploy |
| No sign-in button anywhere | Build variables unset | Step 6, then re-run the Pages workflow |

### Why sign-in is built the way it is

Worth knowing before anyone "simplifies" it back. `signInWithPopup` does not open the window
first — it loads Google's iframe script, opens an iframe on the auth domain and fetches the
project config, and only then calls `window.open`. Browsers only honour `window.open` while the
click's user activation is still live, so on a phone those round trips are enough to get the popup
blocked. Firebase hides this by pre-loading that machinery when the popup resolver is registered
at construction — but only on mobile, Safari and iOS, which is exactly where it matters.

This app cannot register that resolver on its main Auth client, because doing so pulls
`apis.google.com/js/api.js` into every page load for every visitor, including people who never
sign in — which contradicts what the app tells them about their data. So sign-in runs on a
*second*, in-memory Auth client that does carry the resolver and is created only on the screens
that actually offer sign-in. The credential it produces is handed to the main client with
`signInWithCredential`. `/coach` still contacts nobody, and the popup is warm before anyone
presses the button.
