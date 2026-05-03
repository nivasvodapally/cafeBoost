/**
 * Active-cafe context — the customer's currently selected cafe.
 *
 * Stored in localStorage so it survives reloads.
 * Exposed via useSyncExternalStore so multiple tabs/components stay in sync.
 *
 * Cleared automatically on logout (see useAuth).
 *
 * `table` is set when the customer arrived via a table-specific QR
 * (`/cafe/:slug/table/:tableNo`) and locks the table # at checkout.
 */
import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "cafeboost:active-cafe";

export type ActiveCafe = { id: string; slug: string; name: string; table?: string | null } | null;

let active: ActiveCafe = (() => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ActiveCafe) : null;
  } catch {
    return null;
  }
})();

const listeners = new Set<() => void>();

function emit() {
  try {
    if (active) localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function setActiveCafe(c: ActiveCafe) {
  active = c;
  emit();
}

/** Update only the active table number (preserves the rest of the cafe). */
export function setActiveTable(tableNo: string | null) {
  if (!active) return;
  active = { ...active, table: tableNo || null };
  emit();
}

export function getActiveCafe() {
  return active;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useActiveCafe(): ActiveCafe {
  return useSyncExternalStore(subscribe, getActiveCafe, () => null);
}

/**
 * Validate the stored active-cafe id still exists in the DB.
 * Runs once on app mount (and again whenever the stored cafe changes).
 * Clears the active cafe if the row is gone — preventing customers from
 * being stuck in a stale or spoofed cafe context.
 */
export function useValidateActiveCafe() {
  const cafe = useActiveCafe();
  useEffect(() => {
    if (!cafe) return;
    let cancel = false;
    void supabase
      .from("cafes")
      .select("id")
      .eq("id", cafe.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancel) return;
        if (!data) setActiveCafe(null);
      });
    return () => { cancel = true; };
  }, [cafe?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
