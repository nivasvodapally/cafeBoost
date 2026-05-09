import { useContext, useEffect, useRef, useState, createContext, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setActiveCafe } from "@/lib/cafeContext";
import type { Tables } from "@/integrations/supabase/types";

export type AppRole = "owner" | "customer" | "chef" | "runner";

export type Profile = Omit<Tables<"profiles">, "role" | "recent_cafes"> & {
  role: AppRole;
  recent_cafes: Array<{ cafe_id: string; cafe_name: string; last_visited_at: string }> | null;
};

const PROFILE_COLS =
  "id, user_id, role, full_name, email, phone, birthday, cafe_id, favorite_cafes, recent_cafes, is_guest, claimed_at, tags, notes";

function isAppRole(role: string): role is AppRole {
  return role === "owner" || role === "customer" || role === "chef" || role === "runner";
}

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  isGuest: boolean;
  loginSession: string;
  refreshProfile: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * AuthProvider — single source of truth for session, user, profile, and roles.
 *
 * Tab isolation is handled by the Supabase client storage adapter (client.ts).
 * Each tab has its own session bucket keyed by a UUID in sessionStorage.
 * Sign-in/sign-out/refresh in one tab never touches another.
 *
 * Auth state machine:
 *  - loading=true: initial load, no user known yet.
 *  - loading=false, user=null: signed out.
 *  - loading=false, user=anon: guest browsing (can access customer routes).
 *  - loading=false, user!=null: signed in. roles may still be loading.
 *  - roles updated async after user is set.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [loginSession] = useState<string>(() => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    const fetchProfileAndRoles = async (userId: string) => {
      const [{ data: prof }, { data: roleRows }] = await Promise.all([
        supabase.from("profiles").select(PROFILE_COLS).eq("user_id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      if (!mounted.current) return;
      setProfile((prof as Profile | null) ?? null);
      const nextRoles = (roleRows ?? []).map((r) => r.role).filter(isAppRole);
      setRoles(nextRoles);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted.current) return;
      if (!s?.user) {
        // Signed out: clear everything.
        setSession(null);
        setUser(null);
        setProfile(null);
        setRoles([]);
        setActiveCafe(null);
        setLoading(false);
      } else {
        setSession(s);
        setUser(s.user);
        // Defer loading=false until AFTER roles are set. This prevents RequireRole
        // from flickering (roles=[] → correct roles) and redirecting owner/staff
        // to /discover before roles arrive.
        fetchProfileAndRoles(s.user.id).then(() => {
          if (mounted.current) setLoading(false);
        });
      }
    });

    void supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (!mounted.current) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        await fetchProfileAndRoles(s.user.id);
      }
      if (mounted.current) setLoading(false);
    });

    return () => {
      mounted.current = false;
      sub.unsubscribe();
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
    setProfile((prof as Profile | null) ?? null);
    setRoles((roleRows ?? []).map((r) => r.role).filter(isAppRole));
  };

  const value: AuthState = {
    session, user, profile, roles, loading,
    isGuest: false,
    loginSession, refreshProfile,
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