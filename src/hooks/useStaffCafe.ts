import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "./useAuth";

export type StaffCafe = {
  id: string;
  slug: string;
  name: string;
  currency: string | null;
  sound_alerts_enabled?: boolean | null;
};

export type StaffAssignment = {
  id: string;
  cafe_id: string;
  user_id: string;
  role: Extract<AppRole, "chef" | "runner">;
  status: string;
  joined_at: string;
};

export function useStaffCafe() {
  const { user, loading: authLoading } = useAuth();
  const [assignment, setAssignment] = useState<StaffAssignment | null>(null);
  const [cafe, setCafe] = useState<StaffCafe | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (uid: string) => {
    const { data: staff, error } = await (supabase as any)
      .from("cafe_staff")
      .select("id, cafe_id, user_id, role, status, joined_at")
      .eq("user_id", uid)
      .eq("status", "active")
      .maybeSingle();

    if (error) console.error("[useStaffCafe]", error);
    setAssignment((staff as StaffAssignment) ?? null);

    if (staff?.cafe_id) {
      const { data: cafeRow } = await supabase
        .from("cafes")
        .select("id, slug, name, currency, sound_alerts_enabled")
        .eq("id", staff.cafe_id)
        .maybeSingle();
      setCafe((cafeRow as unknown as StaffCafe) ?? null);
    } else {
      setCafe(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setAssignment(null); setCafe(null); setLoading(false); return; }
    setLoading(true);
    void load(user.id);
  }, [user, authLoading, load]);

  const refresh = useCallback(async () => {
    if (!user) return;
    await load(user.id);
  }, [user, load]);

  return { assignment, cafe, loading: authLoading || loading, refresh };
}
