import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "./useAuth";
import type { Tables } from "@/integrations/supabase/types";

export type StaffCafe = Pick<Tables<"cafes">, "id" | "slug" | "name" | "currency" | "sound_alerts_enabled" | "eta_presets">;

export type StaffAssignment = {
  id: string;
  cafe_id: string;
  user_id: string;
  role: Extract<AppRole, "chef" | "runner">;
  status: string;
  on_break: boolean;
  joined_at: string;
  has_open_shift: boolean;
};

export function useStaffCafe() {
  const { user, loading: authLoading } = useAuth();
  const [assignment, setAssignment] = useState<StaffAssignment | null>(null);
  const [cafe, setCafe] = useState<StaffCafe | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (uid: string) => {
    const { data: staff, error } = await supabase
      .from("cafe_staff")
      .select("id, cafe_id, user_id, role, status, on_break, joined_at")
      .eq("user_id", uid)
      .eq("status", "active")
      .maybeSingle();

    if (error) console.error("[useStaffCafe]", error);

    // Check for open shift
    let hasOpenShift = false;
    if (staff) {
      const { data: openShift } = await supabase
        .from("staff_shifts")
        .select("id")
        .eq("user_id", uid)
        .is("clock_out_at", null)
        .maybeSingle();
      hasOpenShift = !!openShift;
    }

    const enriched = staff ? { ...(staff as StaffAssignment), has_open_shift: hasOpenShift } : null;
    setAssignment(enriched as StaffAssignment | null);

    if (staff?.cafe_id) {
      const { data: cafeRow } = await supabase
        .from("cafes")
        .select("id, slug, name, currency, sound_alerts_enabled, eta_presets")
        .eq("id", staff.cafe_id)
        .maybeSingle();
      setCafe(cafeRow ?? null);
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
