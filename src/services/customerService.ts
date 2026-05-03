import { supabase } from "@/integrations/supabase/client";

export type CustomerRow = {
  customer_user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  birthday: string | null;
  loyalty_points: number;
  total_visits: number;
  last_visit_at: string | null;
  joined_at: string;
};

/**
 * Fetch the CRM customer list for an owner's cafe.
 *
 * Bug fix (Section 1.5 — Customers not visible):
 *  Root causes that were masking customers:
 *   1. The old query selected only loyalty_memberships and rendered the raw
 *      UUID, with no profile join — so even when rows existed, the page
 *      looked broken.
 *   2. Customers who placed orders without enrolling in loyalty never
 *      appeared at all.
 *   3. The owner had no SELECT policy on customer profiles, so even joined
 *      data came back null.
 *
 *  Fixed by:
 *   - Adding the `Owners read customer profiles` RLS policy (in migration).
 *   - Building a unified customer set from BOTH loyalty_memberships AND
 *     orders (any user who has interacted with the cafe).
 *   - Joining profiles for full_name / email / phone / birthday.
 */
export async function fetchCafeCustomers(cafeId: string): Promise<CustomerRow[]> {
  // 1) All loyalty members for this cafe.
  const { data: members } = await supabase
    .from("loyalty_memberships")
    .select("customer_user_id, loyalty_points, total_visits, last_visit_at, created_at")
    .eq("cafe_id", cafeId);

  // 2) Distinct customer_user_ids from orders for this cafe (covers
  //    customers who ordered but never enrolled in loyalty).
  const { data: orderUsers } = await supabase
    .from("orders")
    .select("customer_user_id, customer_name, created_at")
    .eq("cafe_id", cafeId)
    .not("customer_user_id", "is", null);

  const ids = new Set<string>();
  (members ?? []).forEach((m) => m.customer_user_id && ids.add(m.customer_user_id));
  (orderUsers ?? []).forEach((o) => o.customer_user_id && ids.add(o.customer_user_id));

  if (ids.size === 0) return [];

  // 3) Pull profile data for those users in one batch.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name, email, phone, birthday")
    .in("user_id", Array.from(ids));

  const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  const memberMap = new Map((members ?? []).map((m) => [m.customer_user_id, m]));

  // Last activity from orders, used as fallback joined_at / last_visit_at.
  const lastOrderMap = new Map<string, string>();
  const firstOrderMap = new Map<string, string>();
  (orderUsers ?? []).forEach((o) => {
    if (!o.customer_user_id) return;
    const t = o.created_at;
    const last = lastOrderMap.get(o.customer_user_id);
    if (!last || t > last) lastOrderMap.set(o.customer_user_id, t);
    const first = firstOrderMap.get(o.customer_user_id);
    if (!first || t < first) firstOrderMap.set(o.customer_user_id, t);
  });

  const fallbackName = new Map<string, string>();
  (orderUsers ?? []).forEach((o) => {
    if (o.customer_user_id && o.customer_name && !fallbackName.has(o.customer_user_id)) {
      fallbackName.set(o.customer_user_id, o.customer_name);
    }
  });

  const rows: CustomerRow[] = Array.from(ids).map((uid) => {
    const p = profileMap.get(uid);
    const m = memberMap.get(uid);
    return {
      customer_user_id: uid,
      full_name: p?.full_name ?? fallbackName.get(uid) ?? null,
      email: p?.email ?? null,
      phone: p?.phone ?? null,
      birthday: p?.birthday ?? null,
      loyalty_points: m?.loyalty_points ?? 0,
      total_visits: m?.total_visits ?? 0,
      last_visit_at: m?.last_visit_at ?? lastOrderMap.get(uid) ?? null,
      joined_at: m?.created_at ?? firstOrderMap.get(uid) ?? new Date().toISOString(),
    };
  });

  rows.sort((a, b) => (b.last_visit_at ?? "").localeCompare(a.last_visit_at ?? ""));
  return rows;
}
