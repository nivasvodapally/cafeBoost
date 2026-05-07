import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Tables } from "@/integrations/supabase/types";

export type OwnerCafe = Tables<"cafes">;

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
       
      console.error("[useOwnerCafe]", error);
    }
    setCafe(data ?? null);
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
