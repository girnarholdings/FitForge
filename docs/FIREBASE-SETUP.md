# Firebase — Google sign-in and cloud sync (free tier)

FitForge works with **no Firebase project at all**: that is Local Mode, and it stays the default.
Adding Firebase turns on two things:

1. **Sign in with Google**, and a copy of your training in the cloud that survives losing the device.
2. **The members-only AI model.** Signed-in users are served by FitForge's own Mistral key;
   everyone else uses the shared free Workers AI tier. That split exists for capacity: when
   anonymous traffic exhausts the free tier, signed-in users are unaffected.

Everything below fits inside the **Spark (free) plan**. No card, no Blaze upgrade.

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

**Free-tier headroom.** Spark allows 50k document reads, 20k writes and 1 GiB stored per day.
This design costs **one read per sign-in** and **one write per ~4 seconds of active editing**
(changes are debounced), so a heavy user costs a few dozen writes a day. A thousand daily active
users sit comfortably inside the free tier.

## Step 6 · Give the values to the build

Repository → **Settings → Secrets and variables → Actions → Variables** → add the six from
step 2. The Pages workflow reads them and inlines them at build time:

```
FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID,
FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID
```

Leave them unset and the app builds exactly as it does today: no sign-in UI, Local Mode only.

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

| Symptom | Cause | Fix |
| --- | --- | --- |
| Popup opens then closes instantly | Domain not authorised | Step 4 |
| `auth/operation-not-allowed` | Google provider disabled | Step 3 |
| Sync says "rules rejected the write" | Rules not published, or shape changed | Re-publish step 5 |
| Signed in but still on the free model | Worker has no `FIREBASE_PROJECT_ID` | Step 7, then redeploy |
| No sign-in button anywhere | Build variables unset | Step 6, then re-run the Pages workflow |
