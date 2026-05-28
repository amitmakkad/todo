# Todo

Next.js app: **email/password auth** (Firebase), **Eisenhower task buckets**, and **recurring workflows** with fixed daily check-in hours (IST) you log yourself as **green / red / grey / skip**, plus a **daily results** view.

No notifications, no cron, no service worker — when you open the Workflows page, today's check-in rows for each workflow are created on the fly so you can fill them in.

## Prerequisites

1. Create a **Firebase** project (a dedicated one for this app is recommended).
2. Enable **Authentication → Sign-in method → Email/Password** only.
3. Create a **Firestore** database in production mode, then deploy rules from [`firestore.rules`](firestore.rules) and indexes from [`firestore.indexes.json`](firestore.indexes.json).

   Deploy (recommended):

   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```

   Or create them by hand in the Firebase Console (two composite indexes on `workflow_entries`: `workflowId`+`outcome` and `workflowId`+`scheduledAtMs`).

## Environment variables

Copy [`.env.example`](.env.example) to `.env.local` and fill values.

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_FIREBASE_*` | Firebase web SDK (client) — all six values from your Firebase project's web app config. |

Add your production and local URLs under **Authentication → Settings → Authorized domains**.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without Firebase env vars you will see a banner; auth and data require a configured `.env.local`.

## Workflow scheduling

A workflow stores a `checkInTimes: number[]` field — each entry is a minute-of-day in IST (0 = 00:00, 503 = 08:23, 1413 = 23:33). The UI lets you type `0, 8:23, 23:33` (bare `H` defaults to `:00`). When you open `/dashboard/workflows`, the client materializes today's rows for each enabled workflow (idempotent — already-existing rows are skipped).

Older docs that still carry the legacy `checkInHours: number[]` (hour-only ints 0–23) are read back transparently and converted to minutes-of-day on the fly; on next edit they're rewritten as `checkInTimes`.

## Firestore layout

- `users/{uid}/tasks/{taskId}`
- `users/{uid}/workflows/{workflowId}` — `name`, `checkInTimes` (array of ints 0–1439), `timezone` (`Asia/Kolkata`), `enabled`, `entryWindowStartMs`, `createdAt`, `updatedAt`
- `users/{uid}/workflow_entries/{entryId}` — stable id `workflowId_<scheduledAtMs>`; fields `workflowId`, `scheduledAt`, `scheduledAtMs`, `dayKey`, `outcome`, `note`, `createdAt`, `updatedAt`

## Next.js note

This repo follows [`AGENTS.md`](AGENTS.md): consult `node_modules/next/dist/docs/` for version-specific App Router behavior.
