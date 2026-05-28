"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  workflowDefFromFirestore,
  workflowEntryVisibilityMinMs,
} from "@/lib/entry-materialize";
import type { WorkflowOutcome } from "@/lib/types";
import { OUTCOME_LABELS } from "@/lib/types";
import { getFirestoreDb } from "@/lib/firebase/client";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { startTransition, useEffect, useMemo, useState } from "react";

const RESULTS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

type Workflow = { id: string; name: string };

type Entry = {
  id: string;
  workflowId: string;
  dayKey: string;
  scheduledAtMs: number;
  outcome: WorkflowOutcome;
};

function coerceOutcome(raw: unknown): WorkflowOutcome {
  if (raw === "green" || raw === "red" || raw === "grey" || raw === "discarded" || raw === "pending") {
    return raw;
  }
  return "pending";
}

export default function ResultsPage() {
  const { user } = useAuth();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [wfVisibilityMinMs, setWfVisibilityMinMs] = useState(0);
  const [entriesError, setEntriesError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const db = getFirestoreDb();
    const q = query(
      collection(db, "users", user.uid, "workflows"),
      orderBy("createdAt", "desc"),
    );
    return onSnapshot(q, (snap) => {
      const wfs = snap.docs.map((d) => ({
        id: d.id,
        name: (d.data() as { name?: string }).name ?? "Untitled",
      }));
      setWorkflows(wfs);
      setSelectedId((prev) => {
        if (prev && wfs.some((w) => w.id === prev)) return prev;
        return wfs[0]?.id ?? "";
      });
    });
  }, [user]);

  useEffect(() => {
    if (!user || !selectedId) {
      startTransition(() => setWfVisibilityMinMs(0));
      return;
    }
    const db = getFirestoreDb();
    const ref = doc(db, "users", user.uid, "workflows", selectedId);
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setWfVisibilityMinMs(0);
        return;
      }
      const def = workflowDefFromFirestore(snap.data() as Record<string, unknown>);
      setWfVisibilityMinMs(workflowEntryVisibilityMinMs(def));
    });
  }, [user, selectedId]);

  useEffect(() => {
    if (!user || !selectedId) {
      startTransition(() => setEntries([]));
      return;
    }
    const db = getFirestoreDb();
    const q = query(
      collection(db, "users", user.uid, "workflow_entries"),
      where("workflowId", "==", selectedId),
      orderBy("scheduledAtMs", "desc"),
      limit(500),
    );
    return onSnapshot(
      q,
      (snap) => {
        setEntriesError(null);
        const cutoff = Date.now() - RESULTS_WINDOW_MS;
        const rows = snap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            workflowId: String(x.workflowId ?? ""),
            dayKey: String(x.dayKey ?? ""),
            scheduledAtMs: Number(x.scheduledAtMs) || 0,
            outcome: coerceOutcome(x.outcome),
          };
        });
        setEntries(rows.filter((e) => e.scheduledAtMs >= cutoff));
      },
      (err) => {
        console.error("workflow_entries snapshot", err);
        setEntriesError(err.message);
      },
    );
  }, [user, selectedId]);

  const entriesForRollup = useMemo(() => {
    if (wfVisibilityMinMs <= 0) return entries;
    return entries.filter((e) => e.scheduledAtMs >= wfVisibilityMinMs);
  }, [entries, wfVisibilityMinMs]);

  const rollup = useMemo(() => {
    const byDay = new Map<
      string,
      { green: number; red: number; grey: number; discarded: number; pending: number }
    >();
    for (const e of entriesForRollup) {
      const row = byDay.get(e.dayKey) ?? {
        green: 0,
        red: 0,
        grey: 0,
        discarded: 0,
        pending: 0,
      };
      if (e.outcome === "green") row.green++;
      else if (e.outcome === "red") row.red++;
      else if (e.outcome === "grey") row.grey++;
      else if (e.outcome === "discarded") row.discarded++;
      else if (e.outcome === "pending") row.pending++;
      byDay.set(e.dayKey, row);
    }
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [entriesForRollup]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Results</h1>
        <p className="text-sm text-zinc-500">
          Daily counts for the last ~14 days by outcome (per workflow).
        </p>
      </div>

      <div>
        <div className="flex items-center gap-3">
          <label
            htmlFor="results-workflow-select"
            className="shrink-0 text-xs font-medium text-zinc-600 dark:text-zinc-400"
          >
            Workflow
          </label>
          <select
            id="results-workflow-select"
            className="w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        {workflows.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-400">Create a workflow first.</p>
        ) : null}
      </div>

      {entriesError ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <p className="font-semibold">Couldn&apos;t load entries — your data is safe in Firestore.</p>
          <p className="mt-1 break-words">
            {(() => {
              const m = entriesError.match(/https:\/\/console\.firebase\.google\.com\S+/);
              if (!m) return entriesError;
              const url = m[0];
              return (
                <>
                  {entriesError.replace(url, "")}
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-indigo-700 underline hover:text-indigo-600"
                  >
                    Open one-click create-index link
                  </a>
                  .
                </>
              );
            })()}
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">Day</th>
              <th className="px-3 py-2 font-medium">{OUTCOME_LABELS.green}</th>
              <th className="px-3 py-2 font-medium">{OUTCOME_LABELS.red}</th>
              <th className="px-3 py-2 font-medium">{OUTCOME_LABELS.grey}</th>
              <th className="px-3 py-2 font-medium">{OUTCOME_LABELS.discarded}</th>
              <th className="px-3 py-2 font-medium">Pending</th>
            </tr>
          </thead>
          <tbody>
            {rollup.map(([day, c]) => (
              <tr
                key={day}
                className="border-b border-zinc-100 dark:border-zinc-800/80"
              >
                <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">{day}</td>
                <td className="px-3 py-2 font-medium text-emerald-700 dark:text-emerald-400">{c.green}</td>
                <td className="px-3 py-2 font-medium text-rose-600 dark:text-rose-400">{c.red}</td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{c.grey}</td>
                <td className="px-3 py-2 text-zinc-500">{c.discarded}</td>
                <td className="px-3 py-2 text-amber-600 dark:text-amber-400">{c.pending}</td>
              </tr>
            ))}
            {rollup.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-xs text-zinc-400">
                  No entries in this window. Open the workflow once to materialize slots.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
