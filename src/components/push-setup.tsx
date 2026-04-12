"use client";

import { getFirebaseApp } from "@/lib/firebase/client";
import { getAuth } from "firebase/auth";
import { useCallback, useState } from "react";

export function PushSetup() {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enable = useCallback(async () => {
    setMsg(null);
    setBusy(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setMsg("Push is not supported in this browser.");
        return;
      }
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapid) {
        setMsg("Push is not available in this build.");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMsg("Notifications were blocked.");
        return;
      }
      const reg =
        (await navigator.serviceWorker.getRegistration()) ||
        (await navigator.serviceWorker.register("/sw.js"));
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
      const auth = getAuth(getFirebaseApp());
      const user = auth.currentUser;
      if (!user) {
        setMsg("Sign in first.");
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg((j as { error?: string }).error || "Could not save subscription.");
        return;
      }
      setMsg("Notifications enabled.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
        Workflow reminders
      </p>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        Allow notifications when prompted. You can turn them off anytime in system settings.
      </p>
      <button
        type="button"
        onClick={() => void enable()}
        disabled={busy}
        className="mt-3 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {busy ? "Working…" : "Enable push"}
      </button>
      {msg ? <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{msg}</p> : null}
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}
