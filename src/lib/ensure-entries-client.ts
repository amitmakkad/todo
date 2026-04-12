"use client";

import type { WorkflowDef } from "@/lib/entry-materialize";
import {
  buildPendingEntriesForWindow,
  entryMaterializeUtcFrom,
} from "@/lib/entry-materialize";
import { getFirestoreDb } from "@/lib/firebase/client";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";

export async function ensureWorkflowEntries(
  uid: string,
  workflowId: string,
  wf: WorkflowDef,
): Promise<void> {
  const db = getFirestoreDb();
  const now = Date.now();
  const from = entryMaterializeUtcFrom(now, wf);
  const to = new Date(now + 72 * 60 * 60 * 1000);
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
      notifiedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}
