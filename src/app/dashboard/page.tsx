"use client";

import { TaskBoard } from "@/components/task-board";
import { useAuth } from "@/contexts/auth-context";

export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="space-y-1 pb-2">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Eisenhower board
      </h1>
      <p className="max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Add a task, choose a quadrant, then mark it done. Completed tasks move to the list below.
      </p>
      <TaskBoard uid={user.uid} />
    </div>
  );
}
