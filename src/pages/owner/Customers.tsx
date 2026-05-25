import { useEffect, useMemo, useState } from "react";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Users } from "lucide-react";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { fetchCafeCustomers, type CustomerRow } from "@/services/customerService";

/**
 * Section 1.5 ROOT CAUSE + FIX (Customers not visible)
 * ----------------------------------------------------
 * Bug: legacy page selected only loyalty_memberships and rendered raw UUIDs;
 *      customers without loyalty enrolment were invisible; profile fields
 *      were never joined; owner had no SELECT policy on profiles.
 * Fix: customerService.fetchCafeCustomers builds a UNION of loyalty members
 *      and order-bearing customers, joins profiles, and falls back to the
 *      order's `customer_name` for unnamed users. Owner profile read is
 *      enabled by the `Owners read customer profiles` RLS policy.
 */
export default function OwnerCustomers() {
  const { cafe, loading: cafeLoading } = useOwnerCafe();
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!cafe) return;
    let cancelled = false;
    setLoading(true);
    void fetchCafeCustomers(cafe.id).then((r) => { if (!cancelled) { setRows(r); setLoading(false); } })
      .catch((err) => { console.error("Failed to load customers:", err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cafe]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(r => (r.full_name ?? "").toLowerCase().includes(needle)
      || (r.email ?? "").toLowerCase().includes(needle)
      || (r.phone ?? "").toLowerCase().includes(needle));
  }, [rows, q]);

  if (cafeLoading || loading) return (
    <OwnerLayout title="Customers">
      <div className="space-y-4">
        {/* Search skeleton */}
        <Skeleton className="h-10 w-full max-w-sm rounded-lg" />
        {/* Table header skeleton */}
        <Skeleton className="h-10 w-full rounded-lg" />
        {/* Table rows skeleton */}
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </OwnerLayout>
  );

  return (
    <OwnerLayout title="Customers" subtitle={`${rows.length} total`}>
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-10" placeholder="Search name, email, phone…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {rows.length === 0 ? (
        <Card className="p-10 text-center">
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-display text-xl font-bold">No customers yet</p>
          <p className="text-sm text-muted-foreground mt-2">Share your QR codes to start growing your customer base.</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground uppercase border-b border-border">
              <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Birthday</th><th className="px-4 py-3 text-right">Visits</th><th className="px-4 py-3 text-right">Points</th><th className="px-4 py-3">Last visit</th><th className="px-4 py-3">Joined</th></tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.customer_user_id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3"><p className="font-medium">{r.full_name ?? "—"}</p>{r.email && <p className="text-xs text-muted-foreground">{r.email}</p>}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.birthday ?? "—"}</td>
                  <td className="px-4 py-3 text-right">{r.total_visits}</td>
                  <td className="px-4 py-3 text-right font-semibold">{r.loyalty_points}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.last_visit_at ? new Date(r.last_visit_at).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(r.joined_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </OwnerLayout>
  );
}
