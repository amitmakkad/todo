import {
  buildPendingEntriesForWindow,
  entryMaterializeUtcFrom,
  workflowDefFromFirestore,
} from "@/lib/entry-materialize";
import { getAdminDb } from "@/lib/firebase/admin";
import webpush from "web-push";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const h = req.headers.get("x-cron-secret");
  if (h === secret) return true;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return false;
}

function initWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@localhost";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

type PushSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
};

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let db: ReturnType<typeof getAdminDb>;
  try {
    db = getAdminDb();
  } catch {
    return NextResponse.json(
      { error: "Admin SDK not configured (FIREBASE_SERVICE_ACCOUNT_JSON)" },
      { status: 500 },
    );
  }

  const pushOk = initWebPush();
  const now = new Date();
  const nowMs = now.getTime();
  const to = new Date(nowMs + 72 * 60 * 60 * 1000);

  try {
    const wfSnap = await db.collectionGroup("workflows").where("enabled", "==", true).get();

    let materialized = 0;
    let notified = 0;

    for (const wfDoc of wfSnap.docs) {
    const wfRef = wfDoc.ref;
    const uid = wfRef.parent.parent?.id;
    if (!uid) continue;

    const wfId = wfDoc.id;
    const data = wfDoc.data() as Record<string, unknown>;

    const wf = workflowDefFromFirestore(data);
    const displayName = typeof data.name === "string" ? data.name : "";

    const from = entryMaterializeUtcFrom(nowMs, wf);
    const writes = buildPendingEntriesForWindow(wfId, wf, from, to);

    let batch = db.batch();
    let ops = 0;
    for (const w of writes) {
      const ref = db.collection("users").doc(uid).collection("workflow_entries").doc(w.id);
      const snap = await ref.get();
      if (snap.exists) continue;
      batch.set(ref, {
        workflowId: wfId,
        scheduledAt: Timestamp.fromDate(w.data.scheduledAt),
        scheduledAtMs: w.data.scheduledAtMs,
        dayKey: w.data.dayKey,
        outcome: "pending",
        note: "",
        notifiedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      ops++;
      materialized++;
      if (ops >= 400) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0) {
      await batch.commit();
    }

    const entriesSnap = await db
      .collection("users")
      .doc(uid)
      .collection("workflow_entries")
      .where("workflowId", "==", wfId)
      .where("outcome", "==", "pending")
      .get();

    const subsSnap = await db
      .collection("users")
      .doc(uid)
      .collection("pushSubscriptions")
      .get();

    if (!subsSnap.size || !pushOk) continue;

    const subs = subsSnap.docs.map((d) => d.data() as PushSub);

    for (const ent of entriesSnap.docs) {
      const ed = ent.data();
      const scheduledAt = (ed.scheduledAt as Timestamp)?.toDate?.() ?? new Date(0);
      if (scheduledAt.getTime() > now.getTime()) continue;
      if (ed.notifiedAt) continue;

      const payload = JSON.stringify({
        title: displayName ? `Check-in: ${displayName}` : "Workflow check-in",
        body: "Tap to log this slot.",
        url: `/dashboard/workflows/${wfId}`,
      });

      let anyOk = false;
      for (const sub of subs) {
        try {
          await webpush.sendNotification(sub, payload, {
            TTL: 60 * 60,
          });
          anyOk = true;
        } catch (e) {
          console.error("webpush failed", e);
        }
      }

      if (anyOk) {
        await ent.ref.update({
          notifiedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        notified++;
      }
    }
    }

    return NextResponse.json({
      ok: true,
      workflows: wfSnap.size,
      newEntries: materialized,
      notifications: notified,
      pushConfigured: pushOk,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    const hint =
      message.includes("FAILED_PRECONDITION") || message.includes("index")
        ? "Deploy Firestore config (see firestore.indexes.json): fieldOverrides for collectionGroup workflows field enabled with queryScope COLLECTION_GROUP."
        : undefined;
    console.error(e);
    return NextResponse.json(
      { error: message, hint },
      { status: 500 },
    );
  }
}
