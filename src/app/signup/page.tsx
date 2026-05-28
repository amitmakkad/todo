"use client";

import { hasFirebaseConfig } from "@/lib/env-public";
import { getFirebaseApp } from "@/lib/firebase/client";
import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!hasFirebaseConfig()) {
      setError("Configure Firebase in .env.local first.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      const auth = getAuth(getFirebaseApp());
      await createUserWithEmailAndPassword(auth, email, password);
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(signupErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Create account</h1>
        <p className="mt-1 text-xs text-zinc-500">Email and password only.</p>
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
          <div>
            <label className="text-xs text-zinc-600 dark:text-zinc-400">Password</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {busy ? "Creating…" : "Sign up"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-zinc-500">
          <Link href="/login" className="text-indigo-600 underline hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
            Already have an account? Sign in
          </Link>
          {" · "}
          <Link href="/forgot-password" className="text-indigo-600 underline hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
            Forgot password
          </Link>
        </p>
      </div>
    </div>
  );
}

function signupErrorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "auth/email-already-in-use":
        return "This email is already registered. Use Sign in below, or Forgot password if you lost access.";
      case "auth/invalid-email":
        return "That email address is not valid.";
      case "auth/weak-password":
        return "Password is too weak. Use a stronger password (6+ characters).";
      case "auth/operation-not-allowed":
        return "Email/password sign-up is disabled in Firebase Console.";
      default:
        return err.message;
    }
  }
  if (err instanceof Error) return err.message;
  return "Sign-up failed";
}
