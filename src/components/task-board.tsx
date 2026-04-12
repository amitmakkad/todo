"use client";

import type { TaskBucket } from "@/lib/types";
import { TASK_BUCKET_LABELS } from "@/lib/types";
import { getFirestoreDb } from "@/lib/firebase/client";
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
import { useEffect, useMemo, useState } from "react";

const SELECT_CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`;

const CONTROL =
  "h-11 w-full rounded-xl border border-zinc-300 bg-white px-3.5 text-sm text-zinc-900 shadow-sm outline-none transition " +
  "placeholder:text-zinc-400 " +
  "focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25 " +
  "dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 " +
  "dark:focus:border-indigo-400 dark:focus:ring-indigo-400/20";

type Task = {
  id: string;
  title: string;
  bucket: TaskBucket;
  completedAt: { toDate: () => Date } | null;
};

const BUCKETS: TaskBucket[] = [
  "urgent_important",
  "urgent_not_important",
  "important_not_urgent",
  "neither",
];

const BUCKET_ACCENT: Record<TaskBucket, string> = {
  urgent_important: "border-t-4 border-t-rose-500 dark:border-t-rose-400",
  urgent_not_important: "border-t-4 border-t-amber-500 dark:border-t-amber-400",
  important_not_urgent: "border-t-4 border-t-sky-500 dark:border-t-sky-400",
  neither: "border-t-4 border-t-zinc-400 dark:border-t-zinc-500",
};

export function TaskBoard({ uid }: { uid: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [bucket, setBucket] = useState<TaskBucket>("urgent_important");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const db = getFirestoreDb();
    const q = query(
      collection(db, "users", uid, "tasks"),
      orderBy("createdAt", "desc"),
    );
    return onSnapshot(q, (snap) => {
      setTasks(
        snap.docs.map((d) => {
          const data = d.data() as Omit<Task, "id">;
          return { id: d.id, ...data };
        }),
      );
    });
  }, [uid]);

  const byBucket = useMemo(() => {
    const m = new Map<TaskBucket, Task[]>();
    for (const b of BUCKETS) m.set(b, []);
    for (const t of tasks) {
      if (t.completedAt) continue;
      const list = m.get(t.bucket) ?? [];
      list.push(t);
      m.set(t.bucket, list);
    }
    return m;
  }, [tasks]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const db = getFirestoreDb();
      await addDoc(collection(db, "users", uid, "tasks"), {
        title: title.trim(),
        bucket,
        createdAt: serverTimestamp(),
        completedAt: null,
      });
      setTitle("");
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone(t: Task) {
    const db = getFirestoreDb();
    const ref = doc(db, "users", uid, "tasks", t.id);
    await updateDoc(ref, {
      completedAt: t.completedAt ? null : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async function removeTask(id: string) {
    const db = getFirestoreDb();
    await deleteDoc(doc(db, "users", uid, "tasks", id));
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={(e) => void addTask(e)}
        className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-700/90 dark:bg-zinc-900/95"
      >
        <div className="space-y-4">
          <div>
            <label
              htmlFor="task-title"
              className="block text-sm font-medium text-zinc-800 dark:text-zinc-100"
            >
              New task
            </label>
            <input
              id="task-title"
              className={`${CONTROL} mt-2`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 sm:max-w-sm">
              <label
                htmlFor="task-bucket"
                className="block text-sm font-medium text-zinc-800 dark:text-zinc-100"
              >
                Quadrant
              </label>
              <select
                id="task-bucket"
                className={`input-plain ${CONTROL} mt-2 cursor-pointer bg-no-repeat pr-10 sm:w-full`}
                style={{ backgroundImage: SELECT_CHEVRON, backgroundPosition: "right 0.65rem center", backgroundSize: "1.25rem" }}
                value={bucket}
                onChange={(e) => setBucket(e.target.value as TaskBucket)}
              >
                {BUCKETS.map((b) => (
                  <option key={b} value={b}>
                    {TASK_BUCKET_LABELS[b]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-8 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {saving ? "Adding…" : "Add task"}
            </button>
          </div>
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        {BUCKETS.map((b) => (
          <section
            key={b}
            className={`flex min-h-[11rem] flex-col rounded-2xl border border-zinc-200/90 bg-white p-4 pt-3 shadow-sm ring-1 ring-black/[0.03] dark:border-zinc-800 dark:bg-zinc-900/80 dark:ring-white/[0.04] ${BUCKET_ACCENT[b]}`}
          >
            <h2 className="text-[0.8125rem] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {TASK_BUCKET_LABELS[b]}
            </h2>
            <ul className="mt-3 flex flex-1 flex-col gap-2">
              {(byBucket.get(b) ?? []).map((t) => (
                <li
                  key={t.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-zinc-100 bg-zinc-50/90 px-3.5 py-2.5 text-sm dark:border-zinc-800/80 dark:bg-zinc-950/50"
                >
                  <span className="min-w-0 leading-snug text-zinc-800 dark:text-zinc-100">
                    {t.title}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-600/10 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-600/20 dark:text-emerald-300 dark:hover:bg-emerald-500/15"
                      onClick={() => void toggleDone(t)}
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-200/80 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      onClick={() => void removeTask(t.id)}
                    >
                      Delete
                    </button>
                  </span>
                </li>
              ))}
              {(byBucket.get(b) ?? []).length === 0 ? (
                <li className="rounded-xl border border-dashed border-zinc-200/80 py-6 text-center text-xs text-zinc-400 dark:border-zinc-700/80 dark:text-zinc-500">
                  No tasks here yet.
                </li>
              ) : null}
            </ul>
          </section>
        ))}
      </div>

      <section className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Completed</h2>
        <ul className="mt-3 space-y-2">
          {tasks
            .filter((t) => t.completedAt)
            .map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50/60 px-3.5 py-2.5 text-sm text-zinc-500 line-through dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-500"
              >
                <span className="min-w-0">
                  {t.title}{" "}
                  <span className="text-xs font-normal text-zinc-400 no-underline dark:text-zinc-500">
                    ({TASK_BUCKET_LABELS[t.bucket]})
                  </span>
                </span>
                <button
                  type="button"
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 no-underline hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
                  onClick={() => void toggleDone(t)}
                >
                  Undo
                </button>
              </li>
            ))}
          {tasks.every((t) => !t.completedAt) ? (
            <p className="py-2 text-xs text-zinc-400 dark:text-zinc-500">Nothing completed yet.</p>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
