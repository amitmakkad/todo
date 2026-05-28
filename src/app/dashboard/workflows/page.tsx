"use client";

import { useAuth } from "@/contexts/auth-context";
import { workflowDefFromFirestore } from "@/lib/entry-materialize";
import { getFirestoreDb } from "@/lib/firebase/client";
import { WORKFLOW_TIMEZONE } from "@/lib/workflow-timezone";
import {
  formatCheckInTimes,
  parseCheckInTimes,
} from "@/lib/workflow-schedule";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Workflow = {
  id: string;
  name: string;
  enabled: boolean;
  checkInTimes: number[];
};

const DEFAULT_TIMES_TEXT = "8:00";

export default function WorkflowsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Workflow[]>([]);
  const [name, setName] = useState("");
  const [timesText, setTimesText] = useState(DEFAULT_TIMES_TEXT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const db = getFirestoreDb();
    const q = query(
      collection(db, "users", user.uid, "workflows"),
      orderBy("createdAt", "desc"),
    );
    return onSnapshot(q, (snap) => {
      const rows: Workflow[] = [];
      for (const d of snap.docs) {
        const x = d.data() as Record<string, unknown>;
        const def = workflowDefFromFirestore(x);
        rows.push({
          id: d.id,
          name: String(x.name || ""),
          enabled: def.enabled,
          checkInTimes: def.checkInTimes,
        });
      }
      setItems(rows);
    });
  }, [user]);

  const parsedTimes = useMemo(() => parseCheckInTimes(timesText), [timesText]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !name.trim() || parsedTimes.length === 0) return;
    setSaving(true);
    try {
      const db = getFirestoreDb();
      await addDoc(collection(db, "users", user.uid, "workflows"), {
        name: name.trim(),
        checkInTimes: parsedTimes,
        timezone: WORKFLOW_TIMEZONE,
        enabled: true,
        entryWindowStartMs: Date.now(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setName("");
      setTimesText(DEFAULT_TIMES_TEXT);
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(w: Workflow) {
    if (!user) return;
    const db = getFirestoreDb();
    await updateDoc(doc(db, "users", user.uid, "workflows", w.id), {
      enabled: !w.enabled,
      timezone: WORKFLOW_TIMEZONE,
      updatedAt: serverTimestamp(),
    });
  }

  async function remove(id: string) {
    if (!user) return;
    const db = getFirestoreDb();
    await deleteDoc(doc(db, "users", user.uid, "workflows", id));
  }

  if (!user) return null;

  const canSubmit = name.trim().length > 0 && parsedTimes.length > 0 && !saving;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Workflows</h1>
        <p className="text-sm text-zinc-500">
          Times use <strong className="font-medium text-zinc-700 dark:text-zinc-300">India (IST)</strong>{" "}
          ({WORKFLOW_TIMEZONE}). List the times you want check-ins on (e.g. <code>0, 8:23, 10</code>),
          comma separated.
        </p>
      </div>

      <form
        onSubmit={(e) => void create(e)}
        className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
      >
        <div>
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Name</label>
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Water intake check-ins"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Check-in times (IST)
          </label>
          <input
            type="text"
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={timesText}
            onChange={(e) => setTimesText(e.target.value)}
            placeholder="0, 8:23, 10"
          />
          <p className="mt-1 text-xs text-zinc-500">
            24-hour <code>H</code> or <code>H:MM</code>, comma separated. Bare numbers default to{" "}
            <code>:00</code>. e.g. <code>0, 8:23, 23:33</code>.{" "}
            {parsedTimes.length > 0 ? (
              <>
                Will check in at <strong>{formatCheckInTimes(parsedTimes)}</strong> ({parsedTimes.length}
                /day).
              </>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">Enter at least one valid time.</span>
            )}
          </p>
        </div>
        <div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            Create workflow
          </button>
        </div>
      </form>

      <ul className="space-y-2">
        {items.map((w) => (
          <li
            key={w.id}
            className="group relative flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
          >
            <Link
              href={`/dashboard/workflows/${w.id}`}
              aria-label={`Open ${w.name || "workflow"}`}
              className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 dark:focus-visible:ring-indigo-400/40"
            />
            <div className="min-w-0">
              <p className="font-medium text-zinc-900 group-hover:underline dark:text-zinc-50">
                {w.name}
              </p>
              <p className="text-xs text-zinc-500">
                {w.checkInTimes.length > 0
                  ? `At ${formatCheckInTimes(w.checkInTimes)} IST · ${w.checkInTimes.length}/day`
                  : "No check-in times set"}{" "}
                · {w.enabled ? "On" : "Off"}
              </p>
            </div>
            <div className="relative z-10 flex gap-2">
              <button
                type="button"
                onClick={() => void toggleEnabled(w)}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-800"
              >
                {w.enabled ? "Disable" : "Enable"}
              </button>
              <button
                type="button"
                onClick={() => void remove(w.id)}
                className="rounded-lg bg-white px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:bg-zinc-950 dark:text-rose-400 dark:hover:bg-rose-950/40"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
        {items.length === 0 ? (
          <p className="text-sm text-zinc-400">No workflows yet.</p>
        ) : null}
      </ul>
    </div>
  );
}
