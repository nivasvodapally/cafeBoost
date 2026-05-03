import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type OwnerCafe = {
  id: string;
  slug: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  logo_url: string | null;
  banner_url: string | null;
  description: string | null;
  currency: string | null;
  timezone: string | null;
  opening_hours: Record<string, unknown> | null;
  seating_capacity: number | null;
  accept_online_orders: boolean;
  accept_reservations: boolean;
  loyalty_enabled: boolean;
  onboarding_completed: boolean;
  table_ordering_enabled: boolean;
  sound_alerts_enabled: boolean;
  tax_rate: number;
  slot_capacity: number;
};

/**
 * useOwnerCafe — loads the cafe owned by the current authenticated user.
 *
 * Bug fix (Section 1.1 — Owner orders not displaying):
 * The previous customer-facing routes filtered orders by `owner_user_id`, which
 * doesn't exist on the orders table. The correct relationship is:
 *   cafes.owner_user_id = auth.uid()  →  orders.cafe_id = cafes.id
 * All owner queries MUST filter by cafe_id resolved through this hook.
 */
export function useOwnerCafe() {
  const { user, loading: authLoading } = useAuth();
  const [cafe, setCafe] = useState<OwnerCafe | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("cafes")
      .select("*")
      .eq("owner_user_id", uid)
      .maybeSingle();
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[useOwnerCafe]", error);
    }
    setCafe((data as unknown as OwnerCafe) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setCafe(null); setLoading(false); return; }
    setLoading(true);
    void load(user.id);
  }, [user, authLoading, load]);

  const refresh = useCallback(async () => {
    if (!user) return;
    await load(user.id);
  }, [user, load]);

  return { cafe, loading: authLoading || loading, refresh };
}
