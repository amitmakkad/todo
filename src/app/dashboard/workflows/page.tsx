"use client";

import { useAuth } from "@/contexts/auth-context";
import { getFirestoreDb } from "@/lib/firebase/client";
import { WORKFLOW_TIMEZONE } from "@/lib/workflow-timezone";
import { defaultSlotsPerDay, normalizeDayStartTime } from "@/lib/workflow-schedule";
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
import { useEffect, useState } from "react";

type Workflow = {
  id: string;
  name: string;
  intervalHours: number;
  enabled: boolean;
  dayStartTime: string;
  slotsPerDay: number;
};

export default function WorkflowsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Workflow[]>([]);
  const [name, setName] = useState("");
  const [intervalHours, setIntervalHours] = useState(4);
  const [dayStartTime, setDayStartTime] = useState("08:00");
  const [slotsPerDay, setSlotsPerDay] = useState(() => defaultSlotsPerDay(4));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSlotsPerDay((prev) => {
      const cap = defaultSlotsPerDay(intervalHours);
      return Math.min(prev, cap);
    });
  }, [intervalHours]);

  useEffect(() => {
    if (!user) return;
    const db = getFirestoreDb();
    const q = query(
      collection(db, "users", user.uid, "workflows"),
      orderBy("createdAt", "desc"),
    );
    return onSnapshot(q, (snap) => {
      setItems(
        snap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>;
          const ih = Math.min(24, Math.max(1, Math.round(Number(x.intervalHours) || 4)));
          let spd = Math.round(Number(x.slotsPerDay));
          if (!Number.isFinite(spd) || spd < 1) spd = defaultSlotsPerDay(ih);
          spd = Math.min(48, Math.max(1, spd));
          return {
            id: d.id,
            name: String(x.name || ""),
            intervalHours: ih,
            enabled: x.enabled !== false,
            dayStartTime: normalizeDayStartTime(
              typeof x.dayStartTime === "string" ? x.dayStartTime : undefined,
            ),
            slotsPerDay: spd,
          };
        }),
      );
    });
  }, [user]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !name.trim()) return;
    setSaving(true);
    try {
      const db = getFirestoreDb();
      const ih = Math.min(24, Math.max(1, Math.round(intervalHours)));
      await addDoc(collection(db, "users", user.uid, "workflows"), {
        name: name.trim(),
        intervalHours: ih,
        timezone: WORKFLOW_TIMEZONE,
        dayStartTime: normalizeDayStartTime(dayStartTime),
        slotsPerDay: Math.min(48, Math.max(1, Math.round(slotsPerDay))),
        enabled: true,
        entryWindowStartMs: Date.now(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setName("");
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

  const suggested = defaultSlotsPerDay(intervalHours);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Workflows</h1>
        <p className="text-sm text-zinc-500">
          Times use <strong className="font-medium text-zinc-700 dark:text-zinc-300">India (IST)</strong>{" "}
          ({WORKFLOW_TIMEZONE}). Set first check-in, interval, and max per day. Enable push in
          Settings.
        </p>
      </div>

      <form
        onSubmit={(e) => void create(e)}
        className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 md:grid-cols-2"
      >
        <div className="md:col-span-2">
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
            Every (hours)
          </label>
          <input
            type="number"
            min={1}
            max={24}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={intervalHours}
            onChange={(e) => setIntervalHours(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            First check-in (IST)
          </label>
          <input
            type="time"
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={dayStartTime}
            onChange={(e) => setDayStartTime(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Max per day
          </label>
          <input
            type="number"
            min={1}
            max={48}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={slotsPerDay}
            onChange={(e) => setSlotsPerDay(Number(e.target.value))}
          />
          <p className="mt-1 text-xs text-zinc-400">Suggested cap: {suggested}</p>
        </div>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Create workflow
          </button>
        </div>
      </form>

      <ul className="space-y-2">
        {items.map((w) => (
          <li
            key={w.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div>
              <Link
                href={`/dashboard/workflows/${w.id}`}
                className="font-medium text-zinc-900 hover:underline dark:text-zinc-50"
              >
                {w.name}
              </Link>
              <p className="text-xs text-zinc-500">
                From {w.dayStartTime} IST · up to {w.slotsPerDay}/day · every {w.intervalHours}h ·{" "}
                {w.enabled ? "On" : "Off"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void toggleEnabled(w)}
                className="rounded-lg border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
              >
                {w.enabled ? "Disable" : "Enable"}
              </button>
              <button
                type="button"
                onClick={() => void remove(w.id)}
                className="rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
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
