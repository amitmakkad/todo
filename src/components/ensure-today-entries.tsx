"use client";

import { useAuth } from "@/contexts/auth-context";
import { ensureWorkflowEntries } from "@/lib/ensure-entries-client";
import { workflowDefFromFirestore } from "@/lib/entry-materialize";
import { getFirestoreDb } from "@/lib/firebase/client";
import { collection, onSnapshot, query } from "firebase/firestore";
import { useEffect } from "react";

/**
 * Mounted once per signed-in dashboard visit. Subscribes to the user's workflows and
 * materializes today's check-in rows for every enabled workflow. Idempotent: existing
 * rows are skipped. Renders nothing.
 */
export function EnsureTodayEntries() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const db = getFirestoreDb();
    const q = query(collection(db, "users", user.uid, "workflows"));
    const unsub = onSnapshot(q, (snap) => {
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        void ensureWorkflowEntries(user.uid, d.id, workflowDefFromFirestore(data));
      }
    });
    return unsub;
  }, [user]);
  return null;
}
