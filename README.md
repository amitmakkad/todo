# Todo PWA

Installable Next.js app: **email/password auth** (Firebase), **Eisenhower task buckets**, **recurring workflows** with timed check-ins, **green / red / grey / skip** outcomes, **daily results**, and **Web Push** reminders driven by a secured cron HTTP endpoint.

## Prerequisites

1. Create a **Firebase** project (separate from other apps is recommended).
2. Enable **Authentication → Sign-in method → Email/Password** only.
3. Create a **Firestore** database in production mode, then deploy rules from [`firestore.rules`](firestore.rules) and indexes from [`firestore.indexes.json`](firestore.indexes.json). The `fieldOverrides` block configures **single-field** indexing for `workflows.enabled` with **collection group** scope (no composite index on `workflows`).

   Deploy (recommended):

   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```

   **Or configure only in the console** (same effect as `fieldOverrides`): use **automatic index** controls (Google calls this “Add exemption” — it overrides default single-field indexing per field). Do **not** use a composite “Manual” index for this case.

   ### Console: single-field + collection group scope for `workflows.enabled`

   Default automatic indexes cover **collection** scope; a `collectionGroup("workflows")` query needs **collection group** scope on `enabled`. Configure that under **Automatic** indexes, not **Manual** composite.

   **Google Cloud Console** (same project as Firebase; [official steps](https://cloud.google.com/firestore/docs/query-data/indexing#add_an_automatic_index_exemption)):

   1. Open [Google Cloud Console](https://console.cloud.google.com) → **Firestore** → **Databases**.
   2. Select your database (usually **`(default)`**).
   3. In the left menu under that database, open **Indexes**.
   4. Open the **Automatic** tab (single-field / automatic index settings; not **Manual**).
   5. Click **Add exemption** (wording may be **Add indexing exemption**).
   6. **Collection ID:** `workflows` (the subcollection name under `users/{uid}/workflows`).
   7. **Field path:** `enabled`.
   8. In the indexing options for this field, **enable** an **Ascending** single-field index for **Collection group** queries (turn on collection-group scope for ascending; wording varies — look for **Collection group** vs **Collection** columns or toggles). Equality filters do not depend on ascending vs descending; either is fine if the UI requires one.
   9. Save and wait until the change is active.

   **Firebase Console:** **Build → Firestore Database → Indexes** → if your UI shows **Automatic** (or “Single-field”) vs **Composite** / **Manual**, use **Automatic** → **Add exemption** with the same **Collection ID** `workflows`, **Field path** `enabled`, and **collection group** ascending enabled. If you only see composite index creation, use the **Google Cloud** path above for the Automatic tab.

   Still create the **Manual** composite indexes for `workflow_entries` (two indexes: `workflowId`+`outcome`, `workflowId`+`scheduledAtMs`) as separate rows in the Manual tab, or deploy them from [`firestore.indexes.json`](firestore.indexes.json).

4. **Service account** (for cron + push subscription API): Project settings → Service accounts → Generate new private key. Minify the JSON to **one line** for `FIREBASE_SERVICE_ACCOUNT_JSON`.

## Environment variables

Copy [`.env.example`](.env.example) to `.env.local` and fill values.

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_FIREBASE_*` | Firebase web SDK (client). |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push public key (safe in client). |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Same pair; server uses both for sending pushes. |
| `VAPID_SUBJECT` | Usually `mailto:you@example.com` (Web Push convention). |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Service account JSON string for Admin SDK (cron + subscribe route). |
| `CRON_SECRET` | Shared secret; send as header `x-cron-secret` or `Authorization: Bearer …` when calling the cron URL. |

Generate VAPID keys:

```bash
npx web-push generate-vapid-keys
```

Use the **public** key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PUBLIC_KEY`; the **private** key only in `VAPID_PRIVATE_KEY` (never expose to the client).

Add your production and local URLs under **Authentication → Settings → Authorized domains**.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without Firebase env vars you will see a banner; auth and data require a configured `.env.local`.

## Cron (free-tier friendly)

The route [`src/app/api/cron/workflows/route.ts`](src/app/api/cron/workflows/route.ts) materializes pending workflow slots and sends Web Push notifications for due pending entries.

- **Vercel Hobby**: [`vercel.json`](vercel.json) runs `GET /api/cron/workflows` **once per day** at **06:00 UTC** (`0 6 * * *`). Hobby only allows daily crons. Set `CRON_SECRET` in Vercel; Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` ([docs](https://vercel.com/docs/cron-jobs)).
- **Vercel Pro** (or any host): you can use a tighter schedule (e.g. every 15 minutes) in `vercel.json` if your plan allows it.
- **Elsewhere (free)**: use [cron-job.org](https://cron-job.org) or similar to `GET` your deployed URL as often as you like, with header `x-cron-secret: <CRON_SECRET>`.

Local manual test (with env loaded):

```bash
curl -sS -H "x-cron-secret: YOUR_SECRET" "http://localhost:3000/api/cron/workflows"
```

## PWA

- [`src/app/manifest.ts`](src/app/manifest.ts) defines the web app manifest.
- [`public/sw.js`](public/sw.js) handles push and notification clicks.

Install from the browser “Add to Home Screen” / install prompt after you deploy over **HTTPS**.

## Firestore layout

- `users/{uid}/tasks/{taskId}`
- `users/{uid}/workflows/{workflowId}` — `name`, `intervalHours`, **`timezone`** (always `Asia/Kolkata` / IST in the app UI), `enabled`, **`dayStartTime`** (`HH:mm` in that zone), **`slotsPerDay`** (max check-ins per local day)
- `users/{uid}/workflow_entries/{entryId}` — stable id `workflowId_<scheduledAtMs>`
- `users/{uid}/pushSubscriptions/{subId}`

## Next.js note

This repo follows [`AGENTS.md`](AGENTS.md): consult `node_modules/next/dist/docs/` for version-specific App Router behavior.
