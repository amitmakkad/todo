"use client";

import { useCallback, useState } from "react";

export function NotificationHelp() {
  const [msg, setMsg] = useState<string | null>(null);

  const testOsNotification = useCallback(async () => {
    setMsg(null);
    if (typeof window === "undefined" || !("Notification" in window)) {
      setMsg("This browser does not support notifications.");
      return;
    }
    let perm = Notification.permission;
    if (perm === "default") {
      perm = await Notification.requestPermission();
    }
    if (perm !== "granted") {
      setMsg("Permission was not granted. Check site settings or Do Not Disturb.");
      return;
    }
    try {
      new Notification("Todo — test", {
        body: "If you see this, notifications from this site are working.",
        tag: "todo-local-test",
      });
      setMsg("Sent. If you did not see a banner, check system notification settings for this browser.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not show a test notification.");
    }
  }, []);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Test notifications</p>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        Confirms your browser can show a notification for this site after you allow it.
      </p>
      <button
        type="button"
        onClick={() => void testOsNotification()}
        className="mt-3 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Test notification
      </button>
      {msg ? (
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{msg}</p>
      ) : null}
    </div>
  );
}
