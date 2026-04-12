"use client";

import { hasFirebaseConfig } from "@/lib/env-public";
import { getFirebaseApp } from "@/lib/firebase/client";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!hasFirebaseConfig()) {
      setError("Configure Firebase in .env.local first.");
      return;
    }
    setBusy(true);
    try {
      const auth = getAuth(getFirebaseApp());
      await sendPasswordResetEmail(auth, email);
      setMessage("If an account exists for this email, a reset link was sent.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Reset password</h1>
        <form className="mt-4 space-y-3" onSubmit={(e) => void submit(e)}>
          <div>
            <label className="text-xs text-zinc-600 dark:text-zinc-400">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          {message ? <p className="text-xs text-emerald-700 dark:text-emerald-400">{message}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {busy ? "Sending…" : "Send reset email"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-zinc-500">
          <Link href="/login" className="underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
