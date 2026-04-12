"use client";

import { useAuth } from "@/contexts/auth-context";
import { ensureWorkflowEntries } from "@/lib/ensure-entries-client";
import type { WorkflowDef } from "@/lib/entry-materialize";
import {
  workflowDefFromFirestore,
  workflowEntryVisibilityMinMs,
} from "@/lib/entry-materialize";
import type { WorkflowOutcome } from "@/lib/types";
import { OUTCOME_LABELS } from "@/lib/types";
import { getFirestoreDb } from "@/lib/firebase/client";
import { WORKFLOW_TIMEZONE } from "@/lib/workflow-timezone";
import { defaultSlotsPerDay, normalizeDayStartTime } from "@/lib/workflow-schedule";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import clsx from "clsx";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ENTRY_NOTE_MAX_LEN = 2000;

type Entry = {
  id: string;
  scheduledAtMs: number;
  dayKey: string;
  outcome: WorkflowOutcome;
  note: string;
};

type Draft = {
  name: string;
  intervalHours: number;
  dayStartTime: string;
  slotsPerDay: number;
};

function EntryNoteField(props: {
  entryId: string;
  savedNote: string;
  onSave: (id: string, note: string) => Promise<void>;
}) {
  const { entryId, savedNote, onSave } = props;
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = taRef.current;
    if (!el || document.activeElement === el) return;
    el.value = savedNote;
  }, [savedNote, entryId]);

  return (
    <label className="mt-2 block">
      <span className="sr-only">Notes for this check-in</span>
      <textarea
        ref={taRef}
        key={entryId}
        rows={3}
        maxLength={ENTRY_NOTE_MAX_LEN}
        defaultValue={savedNote}
        placeholder="Notes for this check-in…"
        className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        onBlur={() => {
          const raw = taRef.current?.value ?? "";
          const next = raw.slice(0, ENTRY_NOTE_MAX_LEN);
          if (next !== savedNote) void onSave(entryId, next);
        }}
      />
      <span className="mt-0.5 block text-right text-[10px] text-zinc-400">
        Max {ENTRY_NOTE_MAX_LEN} characters · saves when you leave this box
      </span>
    </label>
  );
}

function entryCardShellClass(outcome: WorkflowOutcome, isOverdue: boolean): string {
  if (outcome === "pending" && isOverdue) {
    return "border-amber-200 bg-amber-50/70 ring-2 ring-amber-400/60 dark:border-amber-900/60 dark:bg-amber-950/30 dark:ring-amber-500/40";
  }
  if (outcome === "green") {
    return "border-emerald-300/90 bg-emerald-50/90 dark:border-emerald-800 dark:bg-emerald-950/40";
  }
  if (outcome === "red") {
    return "border-red-300/90 bg-red-50/90 dark:border-red-900/50 dark:bg-red-950/35";
  }
  if (outcome === "grey") {
    return "border-zinc-300 bg-zinc-100/90 dark:border-zinc-600 dark:bg-zinc-900/55";
  }
  if (outcome === "discarded") {
    return "border-zinc-200 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-900/45";
  }
  return "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950";
}

function EntryCard(props: {
  entry: Entry;
  variant: "overdue" | "default";
  onOutcome: (id: string, outcome: WorkflowOutcome) => void;
  onSaveNote: (id: string, note: string) => Promise<void>;
}) {
  const { entry: e, variant, onOutcome, onSaveNote } = props;
  const isOverdue = variant === "overdue";
  const o = e.outcome;
  const timeClass = isOverdue
    ? "text-base font-black tracking-tight text-zinc-950 dark:text-zinc-50"
    : o === "pending"
      ? "text-sm font-bold text-zinc-900 dark:text-zinc-50"
      : "text-sm font-medium text-zinc-600 dark:text-zinc-400";

  return (
    <li
      className={clsx(
        "rounded-xl border p-4 transition-[color,background-color,border-color,box-shadow] duration-100 ease-out",
        entryCardShellClass(o, isOverdue),
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className={timeClass}>
            {new Date(e.scheduledAtMs).toLocaleString(undefined, {
              timeZone: WORKFLOW_TIMEZONE,
            })}
          </p>
          <p className="text-xs text-zinc-500">
            Day {e.dayKey} ·{" "}
            {o === "pending"
              ? "Pending"
              : OUTCOME_LABELS[o as keyof typeof OUTCOME_LABELS] ?? o}
          </p>
          <EntryNoteField entryId={e.id} savedNote={e.note} onSave={onSaveNote} />
        </div>
        <div className="flex shrink-0 flex-wrap gap-1 sm:justify-end">
        {o === "pending" ? (
          <>
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-2 py-1 text-xs text-white"
              onClick={() => void onOutcome(e.id, "green")}
            >
              Green
            </button>
            <button
              type="button"
              className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white"
              onClick={() => void onOutcome(e.id, "red")}
            >
              Red
            </button>
            <button
              type="button"
              className="rounded-lg bg-zinc-500 px-2 py-1 text-xs text-white"
              onClick={() => void onOutcome(e.id, "grey")}
            >
              Grey
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
              onClick={() => void onOutcome(e.id, "discarded")}
            >
              Skip
            </button>
          </>
        ) : (
          <button
            type="button"
            className="text-xs text-zinc-500 underline"
            onClick={() => void onOutcome(e.id, "pending")}
          >
            Reset
          </button>
        )}
        </div>
      </div>
    </li>
  );
}

export default function WorkflowDetailPage() {
  const params = useParams<{ workflowId: string }>();
  const workflowId = params.workflowId;
  const { user } = useAuth();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [wfDef, setWfDef] = useState<WorkflowDef | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [outcomeOptimistic, setOutcomeOptimistic] = useState<
    Record<string, WorkflowOutcome>
  >({});

  useEffect(() => {
    setOutcomeOptimistic({});
  }, [workflowId]);

  useEffect(() => {
    setOutcomeOptimistic((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        const row = entries.find((x) => x.id === id);
        if (row && row.outcome === next[id]) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [entries]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user || !workflowId) return;
    const db = getFirestoreDb();
    const ref = doc(db, "users", user.uid, "workflows", workflowId);
    return onSnapshot(ref, (snap) => {
      setReady(true);
      if (!snap.exists()) {
        setDraft(null);
        setWfDef(null);
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      const def = workflowDefFromFirestore(data);
      setWfDef(def);
      setDraft({
        name: String(data.name || ""),
        intervalHours: def.intervalHours,
        dayStartTime: def.dayStartTime,
        slotsPerDay: def.slotsPerDay,
      });
      void ensureWorkflowEntries(user.uid, workflowId, def);
    });
  }, [user, workflowId]);

  useEffect(() => {
    if (!user || !workflowId) return;
    const db = getFirestoreDb();
    const q = query(
      collection(db, "users", user.uid, "workflow_entries"),
      where("workflowId", "==", workflowId),
      orderBy("scheduledAtMs", "desc"),
      limit(400),
    );
    return onSnapshot(
      q,
      (snap) => {
        setEntries(
          snap.docs.map((d) => {
            const x = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              scheduledAtMs: Number(x.scheduledAtMs) || 0,
              dayKey: String(x.dayKey ?? ""),
              outcome: x.outcome as WorkflowOutcome,
              note: typeof x.note === "string" ? x.note : "",
            };
          }),
        );
      },
      () => {},
    );
  }, [user, workflowId]);

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !workflowId || !draft) return;
    setSaving(true);
    try {
      const db = getFirestoreDb();
      await updateDoc(doc(db, "users", user.uid, "workflows", workflowId), {
        name: draft.name.trim(),
        intervalHours: Math.min(24, Math.max(1, Math.round(draft.intervalHours))),
        timezone: WORKFLOW_TIMEZONE,
        dayStartTime: normalizeDayStartTime(draft.dayStartTime),
        slotsPerDay: Math.min(48, Math.max(1, Math.round(draft.slotsPerDay))),
        updatedAt: serverTimestamp(),
      });
    } finally {
      setSaving(false);
    }
  }

  async function setOutcome(id: string, outcome: WorkflowOutcome) {
    setOutcomeOptimistic((p) => ({ ...p, [id]: outcome }));
    if (!user) return;
    try {
      const db = getFirestoreDb();
      await updateDoc(doc(db, "users", user.uid, "workflow_entries", id), {
        outcome,
        updatedAt: serverTimestamp(),
      });
    } catch {
      setOutcomeOptimistic((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }
  }

  const saveNote = useCallback(
    async (id: string, note: string) => {
      if (!user) return;
      const text = note.slice(0, ENTRY_NOTE_MAX_LEN);
      const db = getFirestoreDb();
      await updateDoc(doc(db, "users", user.uid, "workflow_entries", id), {
        note: text,
        updatedAt: serverTimestamp(),
      });
    },
    [user],
  );

  const scopedEntries = useMemo(() => {
    if (!wfDef) return entries;
    const minMs = workflowEntryVisibilityMinMs(wfDef);
    if (minMs <= 0) return entries;
    return entries.filter((e) => e.scheduledAtMs >= minMs);
  }, [entries, wfDef]);

  const scopedWithDisplayOutcome = useMemo(
    () =>
      scopedEntries.map((e) => ({
        ...e,
        outcome: outcomeOptimistic[e.id] ?? e.outcome,
      })),
    [scopedEntries, outcomeOptimistic],
  );

  const visibleEntries = useMemo(
    () => scopedWithDisplayOutcome.filter((e) => e.scheduledAtMs <= nowMs),
    [scopedWithDisplayOutcome, nowMs],
  );

  const { overduePending, loggedPast } = useMemo(() => {
    const overdue: Entry[] = [];
    const logged: Entry[] = [];
    for (const e of visibleEntries) {
      if (e.outcome === "pending") overdue.push(e);
      else logged.push(e);
    }
    overdue.sort((a, b) => a.scheduledAtMs - b.scheduledAtMs);
    logged.sort((a, b) => b.scheduledAtMs - a.scheduledAtMs);
    return { overduePending: overdue, loggedPast: logged };
  }, [visibleEntries]);

  const suggestedSlots = draft ? defaultSlotsPerDay(draft.intervalHours) : 6;

  if (!user) return null;

  if (ready && !draft) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/workflows" className="text-xs text-zinc-500 hover:underline">
          ← Workflows
        </Link>
        <p className="text-sm text-zinc-500">This workflow was not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/dashboard/workflows" className="text-xs text-zinc-500 hover:underline">
        ← Workflows
      </Link>

      {!ready || !draft ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {draft.name || "Workflow"}
          </h1>

          <form
            onSubmit={(e) => void saveSchedule(e)}
            className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 md:grid-cols-2"
          >
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Name</label>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                value={draft.name}
                onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Every (hours)
              </label>
              <input
                type="number"
                min={1}
                max={24}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                value={draft.intervalHours}
                onChange={(e) =>
                  setDraft((d) =>
                    d ? { ...d, intervalHours: Number(e.target.value) } : d,
                  )
                }
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                First check-in (IST, {WORKFLOW_TIMEZONE})
              </label>
              <input
                type="time"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                value={draft.dayStartTime}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, dayStartTime: e.target.value } : d))
                }
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Max check-ins per day
              </label>
              <input
                type="number"
                min={1}
                max={48}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                value={draft.slotsPerDay}
                onChange={(e) =>
                  setDraft((d) =>
                    d ? { ...d, slotsPerDay: Number(e.target.value) } : d,
                  )
                }
              />
              <p className="mt-1 text-xs text-zinc-400">
                At most this many check-ins per local calendar day (first at “First check-in”, then
                every {draft.intervalHours}h until the cap or midnight). Suggested: {suggestedSlots}.
              </p>
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {saving ? "Saving…" : "Save schedule"}
              </button>
            </div>
          </form>

          <p className="text-sm text-zinc-500">
            Green = good · Red = bad · Grey = fine · Skip = no entry. Only check-ins on or after
            this workflow was created are listed. A row appears after its scheduled time; add notes
            per check-in (saved when you leave the box). Use Reset to change an outcome later.
          </p>

          {visibleEntries.length === 0 ? (
            <p className="text-sm text-zinc-400">
              {scopedEntries.length === 0
                ? entries.length === 0
                  ? "No entries in range yet."
                  : "No entries for this workflow yet (slots from before it was created are hidden)."
                : "No check-ins to show yet. Each slot appears here only after its scheduled time."}
            </p>
          ) : (
            <>
              {overduePending.length > 0 ? (
                <section className="space-y-2">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    Needs a log (still pending)
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Pick Green, Red, Grey, or Skip. Bold time = waiting on you.
                  </p>
                  <ul className="space-y-2">
                    {overduePending.map((e) => (
                      <EntryCard
                        key={e.id}
                        entry={e}
                        variant="overdue"
                        onOutcome={setOutcome}
                        onSaveNote={saveNote}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}

              {loggedPast.length > 0 ? (
                <section className="space-y-2">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Logged</h2>
                  <ul className="space-y-2">
                    {loggedPast.map((e) => (
                      <EntryCard
                        key={e.id}
                        entry={e}
                        variant="default"
                        onOutcome={setOutcome}
                        onSaveNote={saveNote}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
