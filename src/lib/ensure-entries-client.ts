"use client";

import type { WorkflowDef } from "@/lib/entry-materialize";
import { buildPendingEntriesForWindow } from "@/lib/entry-materialize";
import { getFirestoreDb } from "@/lib/firebase/client";
import { WORKFLOW_TIMEZONE } from "@/lib/workflow-timezone";
import { formatInTimeZone, toDate } from "date-fns-tz";
import { addDays } from "date-fns";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";

/**
 * Materialize today's check-in rows for one workflow (in IST). Idempotent: skips slots
 * that already exist. Designed to run on dashboard load — there is no server cron.
 */
export async function ensureWorkflowEntries(
  uid: string,
  workflowId: string,
  wf: WorkflowDef,
): Promise<void> {
  if (!wf.enabled || wf.checkInTimes.length === 0) return;
  const db = getFirestoreDb();
  const todayKey = formatInTimeZone(new Date(), WORKFLOW_TIMEZONE, "yyyy-MM-dd");
  const from = toDate(`${todayKey}T00:00:00`, { timeZone: WORKFLOW_TIMEZONE });
  const to = addDays(from, 1);
  const writes = buildPendingEntriesForWindow(workflowId, wf, from, to);
  for (const w of writes) {
    const ref = doc(db, "users", uid, "workflow_entries", w.id);
    const snap = await getDoc(ref);
    if (snap.exists()) continue;
    await setDoc(ref, {
      workflowId,
      scheduledAt: Timestamp.fromDate(w.data.scheduledAt),
      scheduledAtMs: w.data.scheduledAtMs,
      dayKey: w.data.dayKey,
      outcome: "pending",
      note: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}
