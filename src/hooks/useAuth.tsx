import { useContext, useEffect, useRef, useState, createContext, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setActiveCafe } from "@/lib/cafeContext";

export type AppRole = "owner" | "customer" | "chef" | "runner";

export type Profile = {
  id: string;
  user_id: string;
  role: AppRole;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  birthday: string | null;
  cafe_id: string | null;
  favorite_cafes: string[] | null;
  recent_cafes: Array<{ cafe_id: string; cafe_name: string; last_visited_at: string }> | null;
  is_guest?: boolean;
  claimed_at?: string | null;
  tags?: string[];
  notes?: string | null;
};

const PROFILE_COLS =
  "id, user_id, role, full_name, email, phone, birthday, cafe_id, favorite_cafes, recent_cafes, is_guest, claimed_at, tags, notes";

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  isGuest: boolean;
  refreshProfile: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * AuthProvider — single source of truth for session, user, profile, and roles.
 * Lifted into App.tsx so RequireRole reads from context instead of firing
 * a fresh RPC on every navigation.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    const fetchProfileAndRoles = async (userId: string) => {
      const [{ data: prof }, { data: roleRows }] = await Promise.all([
        supabase.from("profiles").select(PROFILE_COLS).eq("user_id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      if (!mounted.current) return;
      setProfile((prof as unknown as Profile) ?? null);
      setRoles(((roleRows ?? []) as { role: AppRole }[]).map((r) => r.role));
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) {
        setProfile(null);
        setRoles([]);
        setActiveCafe(null);
        setLoading(false);
      } else {
        // Defer to avoid Supabase auth deadlocks during the initial token exchange.
        setTimeout(() => { void fetchProfileAndRoles(s.user.id); }, 0);
      }
    });

    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        void fetchProfileAndRoles(s.user.id).finally(() => { if (mounted.current) setLoading(false); });
      } else {
        setLoading(false);
      }
    });

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    const currentUser = user ?? (await supabase.auth.getSession()).data.session?.user ?? null;
    if (!currentUser) return;
    const [{ data: prof }, { data: roleRows }] = await Promise.all([
      supabase.from("profiles").select(PROFILE_COLS).eq("user_id", currentUser.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", currentUser.id),
    ]);
    setUser(currentUser);
    setProfile((prof as unknown as Profile) ?? null);
    setRoles(((roleRows ?? []) as { role: AppRole }[]).map((r) => r.role));
  };

  const isGuest = Boolean(
    (user as User & { is_anonymous?: boolean } | null)?.is_anonymous ?? profile?.is_guest ?? false
  );

  const value: AuthState = {
    session, user, profile, roles, loading, isGuest, refreshProfile,
    hasRole: (role) => roles.includes(role),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export async function signOut() {
  await supabase.auth.signOut();
  setActiveCafe(null);
}

/** Start (or reuse) a guest session. Captures optional name/phone into metadata. */
export async function signInAsGuest(opts?: { fullName?: string; phone?: string }) {
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session?.user) return { user: existing.session.user, error: null };
  const meta: Record<string, string> = { role: "customer" };
  if (opts?.fullName) meta.full_name = opts.fullName;
  if (opts?.phone) meta.phone = opts.phone;
  const { data, error } = await supabase.auth.signInAnonymously({ options: { data: meta } });
  return { user: data.user, error };
}

/**
 * Upgrade a guest (anonymous) user to a full account, preserving their user_id
 * and therefore all their orders, bookings and loyalty points.
 *
 * After updating auth, this also explicitly upserts the profiles row so that
 * full_name / claimed_at / is_guest reflect immediately (the trigger only sets
 * is_guest=false when email/phone get added; full_name needs an explicit write).
 */
export async function claimGuestAccount(args: {
  email: string;
  password: string;
  fullName?: string;
}) {
  const updates: Parameters<typeof supabase.auth.updateUser>[0] = {
    email: args.email.trim(),
    password: args.password,
    data: args.fullName ? { full_name: args.fullName } : undefined,
  };
  const { data, error } = await supabase.auth.updateUser(updates);
  if (error || !data.user) return { user: data.user, error };

  // Force-refresh the session so the new email/password are immediately
  // usable on this device (no need for the user to sign in again).
  await supabase.auth.refreshSession();

  // Explicit profile write: the auth trigger doesn't update full_name on its own.
  const profileUpdates = {
    is_guest: false,
    claimed_at: new Date().toISOString(),
    email: args.email.trim(),
    ...(args.fullName?.trim() ? { full_name: args.fullName.trim() } : {}),
  };
  const { error: pErr } = await supabase.from("profiles").update(profileUpdates).eq("user_id", data.user.id);
  if (pErr) console.warn("Profile update after claim failed:", pErr);
  return { user: data.user, error: null };
}
