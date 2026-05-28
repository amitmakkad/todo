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
import { formatCheckInTimes, parseCheckInTimes } from "@/lib/workflow-schedule";
import { formatInTimeZone } from "date-fns-tz";
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
  timesText: string;
};

function EntryNoteField(props: {
  entryId: string;
  savedNote: string;
  locked: boolean;
  onSave: (id: string, note: string) => Promise<void>;
}) {
  const { entryId, savedNote, locked, onSave } = props;
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Latest values read inside imperative paths (refs avoid stale-closure bugs
  // when the parent flips `locked` between keystroke and click handlers).
  const savedNoteRef = useRef(savedNote);
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    savedNoteRef.current = savedNote;
  }, [savedNote]);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Only re-sync the textarea when the saved value (or the entry) actually
  // changes. Crucially do NOT include `locked` here — flipping locked must
  // not clobber the user's in-flight typed text before Firestore echoes the
  // save back. The previous version cleared just-typed text the moment the
  // outcome was clicked.
  useEffect(() => {
    const el = taRef.current;
    if (!el || document.activeElement === el) return;
    if (el.value !== savedNote) el.value = savedNote;
  }, [savedNote, entryId]);

  const flush = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    const next = el.value.slice(0, ENTRY_NOTE_MAX_LEN);
    if (next !== savedNoteRef.current) {
      savedNoteRef.current = next;
      void onSaveRef.current(entryId, next);
    }
  }, [entryId]);

  // When the entry transitions into a locked (logged) state, flush any
  // unsaved edit *first*, then drop focus. This guards against the rare case
  // where the natural blur on click didn't fire (or fired after the lock).
  useEffect(() => {
    if (!locked) return;
    flush();
    const el = taRef.current;
    if (el && document.activeElement === el) el.blur();
  }, [locked, flush]);

  return (
    <label className="mt-2 block">
      <span className="sr-only">Notes for this check-in</span>
      <textarea
        ref={taRef}
        key={entryId}
        rows={3}
        maxLength={ENTRY_NOTE_MAX_LEN}
        defaultValue={savedNote}
        readOnly={locked}
        aria-readonly={locked}
        placeholder={locked ? "" : "Notes for this check-in…"}
        className={clsx(
          "w-full resize-y rounded-lg border px-3 py-2 text-sm placeholder:text-zinc-400",
          locked
            ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400"
            : "border-zinc-300 bg-white text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100",
        )}
        onBlur={flush}
      />
      <span className="mt-0.5 block text-right text-[10px] text-zinc-400">
        {locked
          ? "Locked once logged — click Reset to edit"
          : `Max ${ENTRY_NOTE_MAX_LEN} characters · saves when you leave this box`}
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
    return "border-rose-300/90 bg-rose-50/90 dark:border-rose-900/50 dark:bg-rose-950/35";
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
          <EntryNoteField
            entryId={e.id}
            savedNote={e.note}
            locked={o !== "pending"}
            onSave={onSaveNote}
          />
        </div>
        <div className="flex shrink-0 flex-wrap gap-1 sm:justify-end">
        {o === "pending" ? (
          <>
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white shadow-sm hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
              onClick={() => void onOutcome(e.id, "green")}
            >
              Green
            </button>
            <button
              type="button"
              className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-medium text-white shadow-sm hover:bg-rose-500 dark:bg-rose-500 dark:hover:bg-rose-400"
              onClick={() => void onOutcome(e.id, "red")}
            >
              Red
            </button>
            <button
              type="button"
              className="rounded-lg bg-zinc-500 px-2 py-1 text-xs font-medium text-white shadow-sm hover:bg-zinc-600 dark:bg-zinc-600 dark:hover:bg-zinc-500"
              onClick={() => void onOutcome(e.id, "grey")}
            >
              Grey
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              onClick={() => void onOutcome(e.id, "discarded")}
            >
              Skip
            </button>
          </>
        ) : (
          <button
            type="button"
            className="text-xs text-indigo-600 underline hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
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
  const [entriesError, setEntriesError] = useState<string | null>(null);

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
        timesText: formatCheckInTimes(def.checkInTimes),
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
        setEntriesError(null);
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
      (err) => {
        console.error("workflow_entries snapshot", err);
        setEntriesError(err.message);
      },
    );
  }, [user, workflowId]);

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !workflowId || !draft) return;
    const times = parseCheckInTimes(draft.timesText);
    if (times.length === 0) return;
    setSaving(true);
    try {
      const db = getFirestoreDb();
      await updateDoc(doc(db, "users", user.uid, "workflows", workflowId), {
        name: draft.name.trim(),
        checkInTimes: times,
        timezone: WORKFLOW_TIMEZONE,
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

  const todayKey = useMemo(
    () => formatInTimeZone(new Date(nowMs), WORKFLOW_TIMEZONE, "yyyy-MM-dd"),
    [nowMs],
  );

  const { overduePending, loggedPast } = useMemo(() => {
    const overdue: Entry[] = [];
    const logged: Entry[] = [];
    for (const e of visibleEntries) {
      if (e.outcome === "pending") {
        overdue.push(e);
      } else if (e.dayKey === todayKey) {
        logged.push(e);
      }
    }
    overdue.sort((a, b) => a.scheduledAtMs - b.scheduledAtMs);
    logged.sort((a, b) => b.scheduledAtMs - a.scheduledAtMs);
    return { overduePending: overdue, loggedPast: logged };
  }, [visibleEntries, todayKey]);

  const parsedDraftTimes = useMemo(
    () => (draft ? parseCheckInTimes(draft.timesText) : []),
    [draft],
  );

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
            className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Name</label>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                value={draft.name}
                onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Check-in times (IST, {WORKFLOW_TIMEZONE})
              </label>
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                value={draft.timesText}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, timesText: e.target.value } : d))
                }
                placeholder="0, 8:23, 10"
              />
              <p className="mt-1 text-xs text-zinc-500">
                24-hour <code>H</code> or <code>H:MM</code>, comma separated. e.g.{" "}
                <code>0, 8:23, 23:33</code>.{" "}
                {parsedDraftTimes.length > 0 ? (
                  <>
                    Will check in at <strong>{formatCheckInTimes(parsedDraftTimes)}</strong> (
                    {parsedDraftTimes.length}/day).
                  </>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">
                    Enter at least one valid time.
                  </span>
                )}
              </p>
            </div>
            <div>
              <button
                type="submit"
                disabled={saving || parsedDraftTimes.length === 0}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
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
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    Logged today
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Showing entries from {todayKey} (IST). Older days roll up in Results.
                  </p>
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
