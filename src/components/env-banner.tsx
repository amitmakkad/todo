import { hasFirebaseConfig } from "@/lib/env-public";

export function EnvBanner() {
  if (hasFirebaseConfig()) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      Firebase is not configured. Copy{" "}
      <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">.env.example</code> to{" "}
      <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">.env.local</code> and add your
      web keys.
    </div>
  );
}
