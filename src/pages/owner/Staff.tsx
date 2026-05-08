import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Award, Clock, Copy, Loader2, Plus, QrCode as QrCodeIcon, Timer, TrendingUp, Users, X } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { supabase } from "@/integrations/supabase/client";

// Chef role is now a paired KDS device — only runners are real staff accounts.
type StaffRole = "runner";
type StaffCode = { id: string; code: string; token: string | null; role: StaffRole; active: boolean; used_count: number; max_uses: number | null; created_at: string };
type Performance = {
  user_id: string; role: string; name: string; email: string | null; status: string; joined_at: string;
  orders_accepted: number; orders_prepared: number; orders_served: number; orders_completed: number;
  revenue_touched: number; avg_prep_seconds: number; avg_serve_seconds: number; hours_worked: number; on_shift: boolean;
};
type ShiftEntry = { id: string; user_id: string; name: string; role: string; clock_in_at: string; clock_out_at: string | null; total_break_seconds: number };
type PerformancePayload = { staff?: Performance[] };

const makeCode = () => `RUN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const makeInviteToken = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, "");
const fmtMin = (s: number) => s ? `${Math.round(s / 60)}m` : "—";
const fmtDur = (sec: number) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m`; };

export default function OwnerStaff() {
  const { cafe, loading: cafeLoading } = useOwnerCafe();
  const { user } = useAuth();
  const [codes, setCodes] = useState<StaffCode[]>([]);
  const [perf, setPerf] = useState<Performance[]>([]);
  const [shifts, setShifts] = useState<ShiftEntry[]>([]);
  const [days, setDays] = useState(7);
  const [maxUses, setMaxUses] = useState("1");
  const [loading, setLoading] = useState(true);
  const [qrFor, setQrFor] = useState<StaffCode | null>(null);
  const [qrCanvas, setQrCanvas] = useState<HTMLCanvasElement | null>(null);
  const joinUrl = useMemo(() => `${window.location.origin}/#/staff/join`, []);
  const inviteUrl = (token: string | null, code: string) => `${joinUrl}?invite=${encodeURIComponent(token || code)}`;

  const load = useCallback(async () => {
    if (!cafe) return;
    const [codeRes, perfRes, shiftRes] = await Promise.all([
      supabase.from("cafe_staff_codes").select("id, code, token, role, active, used_count, max_uses, created_at").eq("cafe_id", cafe.id).order("created_at", { ascending: false }),
      supabase.rpc("get_staff_performance", { _cafe_id: cafe.id, _days: days }),
      supabase.rpc("get_staff_shifts", { _cafe_id: cafe.id, _days: 14 }),
    ]);
    setCodes((codeRes.data as StaffCode[]) ?? []);
    setPerf(((perfRes.data as PerformancePayload | null)?.staff) ?? []);
    setShifts((shiftRes.data as ShiftEntry[]) ?? []);
    setLoading(false);
  }, [cafe, days]);

  useEffect(() => { if (cafe) void load(); }, [cafe, load]);

  // Render QR when the dialog's canvas is mounted (callback ref handles portal timing).
  useEffect(() => {
    if (!qrFor || !qrCanvas) return;
    void QRCode.toCanvas(qrCanvas, inviteUrl(qrFor.token, qrFor.code), {
      width: 280, margin: 2, color: { dark: "#1a1a1a", light: "#ffffff" },
    }).catch((e) => console.error("[QR]", e));
  }, [qrFor, qrCanvas, inviteUrl]);

  const createCode = async () => {
    if (!cafe || !user) return;
    const { error } = await supabase.from("cafe_staff_codes").insert({
      cafe_id: cafe.id, code: makeCode(), token: makeInviteToken(), role: "runner",
      max_uses: Number(maxUses) || null, created_by: user.id,
    });
    if (error) toast.error(error.message); else { toast.success("Invite link created"); await load(); }
  };
  const copyInvite = async (row: StaffCode) => { await navigator.clipboard.writeText(inviteUrl(row.token, row.code)); toast.success("Link copied"); };
  const toggleCode = async (row: StaffCode) => { const { error } = await supabase.from("cafe_staff_codes").update({ active: !row.active }).eq("id", row.id); if (error) toast.error(error.message); else await load(); };
  const removeStaff = async (userId: string) => {
    if (!cafe || !confirm("Remove this staff member?")) return;
    const { error } = await supabase.from("cafe_staff").update({ status: "inactive" }).eq("cafe_id", cafe.id).eq("user_id", userId);
    if (error) toast.error(error.message); else { toast.success("Staff removed"); await load(); }
  };

  if (cafeLoading || loading) return <OwnerLayout title="Staff"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></OwnerLayout>;

  const totals = perf.reduce((acc, p) => ({
    orders: acc.orders + p.orders_accepted + p.orders_prepared + p.orders_served + p.orders_completed,
    revenue: acc.revenue + Number(p.revenue_touched), hours: acc.hours + Number(p.hours_worked),
  }), { orders: 0, revenue: 0, hours: 0 });

  return (
    <OwnerLayout title="Runners" subtitle="Invite runners, track performance & shifts" action={
      <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
        <option value={1}>Today</option><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
      </select>
    }>
      {/* KPI strip */}
      <div className="grid sm:grid-cols-4 gap-3 mb-6">
        <Card className="p-4"><Users className="w-4 h-4 text-muted-foreground mb-1" /><p className="text-2xl font-display font-bold">{perf.length}</p><p className="text-xs text-muted-foreground">Active staff</p></Card>
        <Card className="p-4"><TrendingUp className="w-4 h-4 text-muted-foreground mb-1" /><p className="text-2xl font-display font-bold">{totals.orders}</p><p className="text-xs text-muted-foreground">Order actions</p></Card>
        <Card className="p-4"><Award className="w-4 h-4 text-muted-foreground mb-1" /><p className="text-2xl font-display font-bold">₹{totals.revenue.toFixed(0)}</p><p className="text-xs text-muted-foreground">Revenue handled</p></Card>
        <Card className="p-4"><Clock className="w-4 h-4 text-muted-foreground mb-1" /><p className="text-2xl font-display font-bold">{totals.hours.toFixed(1)}h</p><p className="text-xs text-muted-foreground">Total hours worked</p></Card>
      </div>

      <div className="grid lg:grid-cols-[360px_1fr] gap-6">
        {/* Invite */}
        <div className="space-y-4">
          <Card className="p-5 space-y-4">
            <div>
              <h2 className="font-display text-xl font-bold">Invite a runner</h2>
              <p className="text-sm text-muted-foreground mt-1">Runners take orders, mark them ready/served, and collect cash or UPI payments. Kitchen staff use a paired KDS device instead — set that up in Settings.</p>
            </div>
            <div className="space-y-2"><Label>Max uses</Label><Input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} inputMode="numeric" /></div>
            <Button onClick={createCode} variant="hero" className="w-full gap-2"><Plus className="w-4 h-4" /> Generate invite link</Button>
          </Card>

          <Card className="p-5">
            <h3 className="font-display text-lg font-bold mb-3">Active invites</h3>
            {codes.length === 0 ? <p className="text-sm text-muted-foreground">No invites yet.</p> : (
              <div className="space-y-2">
                {codes.map((c) => (
                  <div key={c.id} className="rounded-lg border border-border p-3 space-y-2">
                    <p className="font-mono text-[10px] break-all">{inviteUrl(c.token, c.code)}</p>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="capitalize text-muted-foreground">runner · {c.used_count}/{c.max_uses ?? "∞"} · {c.active ? "active" : "off"}</span>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => setQrFor(c)} title="Show QR"><QrCodeIcon className="w-3 h-3" /></Button>
                        <Button size="sm" variant="outline" onClick={() => copyInvite(c)}><Copy className="w-3 h-3" /></Button>
                        <Button size="sm" variant="outline" onClick={() => toggleCode(c)}>{c.active ? "Disable" : "Enable"}</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Performance + shifts */}
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-display text-xl font-bold mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5" /> Team performance · last {days}d</h2>
            {perf.length === 0 ? <p className="text-sm text-muted-foreground">No team members yet. Share an invite link to get started.</p> : (
              <div className="space-y-3">
                {perf.map((p, idx) => {
                  const total = p.orders_accepted + p.orders_prepared + p.orders_served + p.orders_completed;
                  return (
                    <div key={p.user_id} className="rounded-lg border border-border p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {idx === 0 && total > 0 && <Award className="w-4 h-4 text-amber-500" />}
                            <p className="font-semibold">{p.name}</p>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground capitalize">{p.role}</span>
                            {p.on_shift && <span className="text-[10px] bg-success/15 text-success px-2 py-0.5 rounded-full font-semibold">ON SHIFT</span>}
                          </div>
                          {p.email && <p className="text-xs text-muted-foreground mt-0.5">{p.email}</p>}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => removeStaff(p.user_id)}>Remove</Button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-center">
                        <div><p className="text-xl font-display font-bold">{total}</p><p className="text-[10px] uppercase text-muted-foreground">actions</p></div>
                        <div><p className="text-xl font-display font-bold">₹{Number(p.revenue_touched).toFixed(0)}</p><p className="text-[10px] uppercase text-muted-foreground">revenue</p></div>
                        <div><p className="text-xl font-display font-bold">{Number(p.hours_worked).toFixed(1)}h</p><p className="text-[10px] uppercase text-muted-foreground">worked</p></div>
                        <div><p className="text-xl font-display font-bold">{fmtMin(p.avg_prep_seconds || p.avg_serve_seconds)}</p><p className="text-[10px] uppercase text-muted-foreground">avg time</p></div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 mt-3 text-[11px] text-muted-foreground">
                        <span>✓ Accepted: <b className="text-foreground">{p.orders_accepted}</b></span>
                        <span>👨‍🍳 Cooked: <b className="text-foreground">{p.orders_prepared}</b></span>
                        <span>🍽 Served: <b className="text-foreground">{p.orders_served}</b></span>
                        <span>✅ Done: <b className="text-foreground">{p.orders_completed}</b></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-xl font-bold mb-4 flex items-center gap-2"><Timer className="w-5 h-5" /> Recent shifts</h2>
            {shifts.length === 0 ? <p className="text-sm text-muted-foreground">No shift activity yet.</p> : (
              <div className="space-y-2">
                {shifts.slice(0, 25).map((s) => {
                  const start = new Date(s.clock_in_at); const end = s.clock_out_at ? new Date(s.clock_out_at) : null;
                  const total = end ? Math.floor((end.getTime() - start.getTime()) / 1000) - s.total_break_seconds : 0;
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{s.name} <span className="text-xs text-muted-foreground capitalize">· {s.role}</span></p>
                        <p className="text-xs text-muted-foreground">{start.toLocaleString()} → {end ? end.toLocaleTimeString() : <span className="text-success font-semibold">on shift</span>}</p>
                      </div>
                      <p className="text-sm font-bold">{end ? fmtDur(total) : "—"}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Invite QR dialog */}
      <Dialog open={!!qrFor} onOpenChange={(v) => { if (!v) setQrFor(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><QrCodeIcon className="w-4 h-4" /> Invite QR</DialogTitle>
            <DialogDescription>Have your runner scan this on their phone. It opens the join page with the invite pre-filled.</DialogDescription>
          </DialogHeader>
          {qrFor && (
            <div className="flex flex-col items-center gap-3">
              <div className="bg-white p-3 rounded-lg"><canvas ref={setQrCanvas} /></div>
              <p className="font-mono text-xs text-muted-foreground break-all text-center">{inviteUrl(qrFor.token, qrFor.code)}</p>
              <div className="flex gap-2 w-full">
                <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => copyInvite(qrFor)}><Copy className="w-3.5 h-3.5" /> Copy link</Button>
                <Button variant="ghost" size="sm" onClick={() => setQrFor(null)} className="gap-1"><X className="w-3.5 h-3.5" /> Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </OwnerLayout>
  );
}
