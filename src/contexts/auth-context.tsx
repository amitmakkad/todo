"use client";

import { hasFirebaseConfig } from "@/lib/env-public";
import { getFirebaseApp } from "@/lib/firebase/client";
import type { User } from "firebase/auth";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => hasFirebaseConfig());

  useEffect(() => {
    if (!hasFirebaseConfig()) return;
    let unsub: (() => void) | undefined;
    try {
      const app = getFirebaseApp();
      const auth = getAuth(app);
      unsub = onAuthStateChanged(auth, (u) => {
        setUser(u);
        startTransition(() => setLoading(false));
      });
    } catch {
      startTransition(() => setLoading(false));
    }
    return () => unsub?.();
  }, []);

  const signOutUser = useCallback(async () => {
    if (!hasFirebaseConfig()) return;
    const auth = getAuth(getFirebaseApp());
    await signOut(auth);
  }, []);

  const value = useMemo(
    () => ({ user, loading, signOutUser }),
    [user, loading, signOutUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
