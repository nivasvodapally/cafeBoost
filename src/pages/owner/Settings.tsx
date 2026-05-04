import { useEffect, useMemo, useState } from "react";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Copy, FlaskConical, Loader2, Monitor, RefreshCw, ShieldCheck } from "lucide-react";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { clearCafePaymentModeCache } from "@/lib/cafePaymentMode";
import type { Tables } from "@/integrations/supabase/types";

const makePairingCode = () => {
  // 6-char human-friendly pairing code (no ambiguous chars).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
};

export default function OwnerSettings() {
  const { cafe, loading, refresh } = useOwnerCafe();
  const [form, setForm] = useState<{ name: string; email: string; phone: string; address: string; city: string; description: string; accept_online_orders: boolean; accept_reservations: boolean; loyalty_enabled: boolean; table_ordering_enabled: boolean; sound_alerts_enabled: boolean; stuck_unaccepted_minutes: number; stuck_kitchen_minutes: number; stuck_ready_minutes: number; eta_presets: string; gstin: string; tax_rate: number; }>({
    name: "", email: "", phone: "", address: "", city: "", description: "",
    accept_online_orders: true, accept_reservations: true, loyalty_enabled: true,
    table_ordering_enabled: false, sound_alerts_enabled: true,
    stuck_unaccepted_minutes: 2, stuck_kitchen_minutes: 10, stuck_ready_minutes: 5,
    eta_presets: "5,10,15,20,30",
    gstin: "",
    tax_rate: 0,
  });
  const [saving, setSaving] = useState(false);
  // KDS device management
  type KdsDevice = Pick<Tables<"kds_devices">, "id" | "label" | "paired_at" | "last_seen_at" | "active">;
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [genCodeBusy, setGenCodeBusy] = useState(false);
  const [devices, setDevices] = useState<KdsDevice[]>([]);
  // Payment mode
  const [paymentMode, setPaymentMode] = useState<"test" | "live">("test");
  const [allowSimulation, setAllowSimulation] = useState(true);
  const [savingPayment, setSavingPayment] = useState(false);
  const kdsUrl = useMemo(() => `${window.location.origin}/#/kds`, []);

  useEffect(() => {
    if (!cafe) return;
    setForm({
      name: cafe.name, email: cafe.email ?? "", phone: cafe.phone ?? "",
      address: cafe.address ?? "", city: cafe.city ?? "", description: cafe.description ?? "",
      // These columns are nullable in the DB; default to true so a fresh cafe
      // is open for business until the owner explicitly opts out.
      accept_online_orders: cafe.accept_online_orders ?? true,
      accept_reservations: cafe.accept_reservations ?? true,
      loyalty_enabled: cafe.loyalty_enabled ?? true,
      table_ordering_enabled: cafe.table_ordering_enabled ?? false,
      sound_alerts_enabled: cafe.sound_alerts_enabled ?? true,
      stuck_unaccepted_minutes: cafe.stuck_unaccepted_minutes ?? 2,
      stuck_kitchen_minutes: cafe.stuck_kitchen_minutes ?? 10,
      stuck_ready_minutes: cafe.stuck_ready_minutes ?? 5,
      eta_presets: (cafe.eta_presets ?? [5, 10, 15, 20, 30]).join(","),
      gstin: (cafe as { gstin?: string | null }).gstin ?? "",
      tax_rate: (cafe as { tax_rate?: number | null }).tax_rate ?? 0,
    });
    setPairingCode(cafe.kds_pairing_code ?? null);
    setPaymentMode(cafe.razorpay_mode === "live" ? "live" : "test");
    setAllowSimulation(cafe.allow_payment_simulation ?? true);
  }, [cafe]);

  // Load paired KDS devices for this cafe.
  useEffect(() => {
    if (!cafe) return;
    let cancel = false;
    void supabase
      .from("kds_devices")
      .select("id, label, paired_at, last_seen_at, active")
      .eq("cafe_id", cafe.id)
      .order("paired_at", { ascending: false })
      .then(({ data }: { data: KdsDevice[] | null }) => {
        if (!cancel) setDevices(data ?? []);
      });
    return () => { cancel = true; };
  }, [cafe, savingPin, genCodeBusy]);

  const generateNewPairingCode = async () => {
    if (!cafe) return;
    setGenCodeBusy(true);
    const code = makePairingCode();
    const { error } = await supabase.from("cafes").update({
      kds_pairing_code: code,
      kds_pairing_code_set_at: new Date().toISOString(),
    }).eq("id", cafe.id);
    setGenCodeBusy(false);
    if (error) { toast.error(error.message); return; }
    setPairingCode(code);
    toast.success("New pairing code generated");
  };

  const setKdsPin = async () => {
    if (!cafe) return;
    if (!/^\d{4,8}$/.test(pin)) { toast.error("PIN must be 4–8 digits"); return; }
    if (pin !== confirmPin) { toast.error("PINs don't match"); return; }
    setSavingPin(true);
    // Hash the PIN client-side using SHA-256 so the raw PIN never leaves the device.
    // The kds_pair_device RPC accepts both code and pin, comparing this hash.
    const enc = new TextEncoder().encode(`${cafe.id}:${pin}`);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    const hashed = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await supabase.from("cafes").update({ kds_pin_hash: hashed }).eq("id", cafe.id);
    setSavingPin(false);
    if (error) { toast.error(error.message); return; }
    setPin(""); setConfirmPin("");
    toast.success("KDS PIN set — kitchen can pair using this PIN");
  };

  const revokeDevice = async (id: string) => {
    if (!confirm("Sign this kitchen device out? It will need to pair again.")) return;
    const { error } = await supabase.from("kds_devices").update({ active: false }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setDevices((d) => d.map((x) => x.id === id ? { ...x, active: false } : x));
    toast.success("Device revoked");
  };

  const savePaymentSettings = async () => {
    if (!cafe) return;
    setSavingPayment(true);
    const { error } = await supabase.from("cafes").update({
      razorpay_mode: paymentMode,
      allow_payment_simulation: allowSimulation,
    }).eq("id", cafe.id);
    setSavingPayment(false);
    if (error) { toast.error(error.message); return; }
    clearCafePaymentModeCache(cafe.id);
    toast.success("Payment settings updated");
  };

  const copy = async (text: string, what = "Copied") => {
    try { await navigator.clipboard.writeText(text); toast.success(what); } catch { toast.error("Copy failed"); }
  };

  const save = async () => {
    if (!cafe) return;
    setSaving(true);
    const presets = form.eta_presets.split(",").map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n >= 0 && n <= 240);
    const { error } = await supabase.from("cafes").update({
      name: form.name, email: form.email || null, phone: form.phone || null,
      address: form.address || null, city: form.city || null, description: form.description || null,
      accept_online_orders: form.accept_online_orders, accept_reservations: form.accept_reservations, loyalty_enabled: form.loyalty_enabled,
      table_ordering_enabled: form.table_ordering_enabled, sound_alerts_enabled: form.sound_alerts_enabled,
      stuck_unaccepted_minutes: form.stuck_unaccepted_minutes,
      stuck_kitchen_minutes: form.stuck_kitchen_minutes,
      stuck_ready_minutes: form.stuck_ready_minutes,
      eta_presets: presets.length ? presets : [5, 10, 15, 20, 30],
      gstin: form.gstin.trim() || null,
      tax_rate: Number(form.tax_rate),
    }).eq("id", cafe.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Settings saved");
    void refresh();
  };

  if (loading) return <OwnerLayout title="Settings"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div></OwnerLayout>;

  return (
    <OwnerLayout title="Cafe Settings">
      <Card className="p-6 space-y-4 max-w-2xl">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div className="space-y-2"><Label>City</Label><Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
          {/* GST Rate */}
          <div className="space-y-1.5">
            <Label htmlFor="tax_rate">GST Rate (%)</Label>
            <Input
              id="tax_rate"
              type="number"
              min={0}
              max={28}
              step={0.5}
              placeholder="0"
              value={form.tax_rate}
              onChange={e => setForm(f => ({ ...f, tax_rate: Number(e.target.value) }))}
            />
            <p className="text-xs text-muted-foreground">
              Standard rates: 5% (small cafes) or 18% (with ITC). Set to 0 if you don't charge GST.
              This splits equally as CGST + SGST on invoices.
            </p>
          </div>

          {/* GSTIN */}
          <div className="space-y-1.5">
            <Label htmlFor="gstin">GSTIN <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="gstin"
              placeholder="e.g. 33AAAAA0000A1Z5"
              value={form.gstin}
              onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))}
              maxLength={15}
            />
            <p className="text-xs text-muted-foreground">
              Your 15-digit GST Identification Number. Only needed if your cafe is GST registered
              (annual turnover above ₹20 lakhs). Adding this converts receipts into proper Tax Invoices.
            </p>
          </div>
          <div className="space-y-2 sm:col-span-2"><Label>Address</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
          <div className="space-y-2 sm:col-span-2"><Label>Description</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
        </div>
        <div className="space-y-3 pt-4 border-t border-border">
          <div className="flex items-center justify-between"><div><Label>Accept online orders</Label><p className="text-xs text-muted-foreground">Customers can place orders from the menu.</p></div><Switch checked={form.accept_online_orders} onCheckedChange={v => setForm(f => ({ ...f, accept_online_orders: v }))} /></div>
          <div className="flex items-center justify-between"><div><Label>Accept reservations</Label><p className="text-xs text-muted-foreground">Allow table bookings via the customer app.</p></div><Switch checked={form.accept_reservations} onCheckedChange={v => setForm(f => ({ ...f, accept_reservations: v }))} /></div>
          <div className="flex items-center justify-between"><div><Label>Loyalty program enabled</Label><p className="text-xs text-muted-foreground">Earn points, rewards and birthday perks.</p></div><Switch checked={form.loyalty_enabled} onCheckedChange={v => setForm(f => ({ ...f, loyalty_enabled: v }))} /></div>
          <div className="flex items-center justify-between"><div><Label>Table ordering QR</Label><p className="text-xs text-muted-foreground">Show per-table QR generator on the QR page.</p></div><Switch checked={form.table_ordering_enabled} onCheckedChange={v => setForm(f => ({ ...f, table_ordering_enabled: v }))} /></div>
          <div className="flex items-center justify-between"><div><Label>Sound alerts</Label><p className="text-xs text-muted-foreground">Play a chime when new orders arrive.</p></div><Switch checked={form.sound_alerts_enabled} onCheckedChange={v => setForm(f => ({ ...f, sound_alerts_enabled: v }))} /></div>
        </div>
        <div className="space-y-3 pt-4 border-t border-border">
          <div>
            <Label className="text-base font-semibold">Workflow monitoring</Label>
            <p className="text-xs text-muted-foreground">When orders sit longer than these limits, the owner gets a stuck-order alert in the Payments dashboard activity feed.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1"><Label className="text-xs">Unaccepted (min)</Label><Input type="number" min={1} max={60} value={form.stuck_unaccepted_minutes} onChange={e => setForm(f => ({ ...f, stuck_unaccepted_minutes: parseInt(e.target.value || "0", 10) }))} /></div>
            <div className="space-y-1"><Label className="text-xs">In kitchen (min)</Label><Input type="number" min={1} max={120} value={form.stuck_kitchen_minutes} onChange={e => setForm(f => ({ ...f, stuck_kitchen_minutes: parseInt(e.target.value || "0", 10) }))} /></div>
            <div className="space-y-1"><Label className="text-xs">Ready not served (min)</Label><Input type="number" min={1} max={60} value={form.stuck_ready_minutes} onChange={e => setForm(f => ({ ...f, stuck_ready_minutes: parseInt(e.target.value || "0", 10) }))} /></div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Chef ETA presets (comma separated minutes)</Label>
            <Input value={form.eta_presets} onChange={e => setForm(f => ({ ...f, eta_presets: e.target.value }))} placeholder="5,10,15,20,30" />
            <p className="text-xs text-muted-foreground">Quick-pick buttons chef sees when setting cooking ETA.</p>
          </div>
        </div>
        <Button variant="hero" onClick={save} disabled={saving}>{saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : "Save changes"}</Button>
      </Card>

      {/* Payments */}
      <Card className="p-6 space-y-4 max-w-2xl mt-6">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Payments</h2>
          <p className="text-sm text-muted-foreground mt-1">Switch between Razorpay test mode (no real money) and live mode.</p>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Razorpay mode</Label>
            <p className="text-xs text-muted-foreground">Live mode requires a verified Razorpay account.</p>
          </div>
          <div className="inline-flex rounded-lg border border-border p-1">
            <button
              type="button"
              onClick={() => setPaymentMode("test")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-smooth ${paymentMode === "test" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}
            >TEST</button>
            <button
              type="button"
              onClick={() => setPaymentMode("live")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-smooth ${paymentMode === "live" ? "bg-success/15 text-success" : "text-muted-foreground"}`}
            >LIVE</button>
          </div>
        </div>
        {paymentMode === "test" && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs flex items-start gap-2">
            <FlaskConical className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-700 dark:text-amber-300">Currently in test mode</p>
              <p className="text-muted-foreground">Customers will see a test-mode banner. No real money will move. Use simulate buttons to validate the end-to-end flow.</p>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <Label>Allow payment simulation</Label>
            <p className="text-xs text-muted-foreground">Show "Simulate Success / Failure" buttons in the payment dialog (test mode only).</p>
          </div>
          <Switch checked={allowSimulation} onCheckedChange={setAllowSimulation} />
        </div>
        <Button variant="hero" onClick={savePaymentSettings} disabled={savingPayment}>{savingPayment ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : "Save payment settings"}</Button>
      </Card>

      {/* KDS Pairing */}
      <Card className="p-6 space-y-5 max-w-2xl mt-6">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2"><Monitor className="w-5 h-5" /> Kitchen Display (KDS)</h2>
          <p className="text-sm text-muted-foreground mt-1">Pair a tablet inside the kitchen. Once paired, it stays signed in and shows live tickets without a user login.</p>
        </div>

        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">KDS URL</p>
              <p className="font-mono text-sm break-all">{kdsUrl}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => copy(kdsUrl, "KDS URL copied")}><Copy className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
            <div>
              <Label className="text-xs">Pairing code</Label>
              <p className="font-mono text-2xl font-bold tracking-widest">{pairingCode ?? "—"}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Enter this code on the KDS tablet to pair it.</p>
            </div>
            {pairingCode && (
              <Button variant="outline" size="sm" onClick={() => copy(pairingCode!, "Code copied")}><Copy className="w-3.5 h-3.5" /></Button>
            )}
            <Button variant="outline" size="sm" onClick={generateNewPairingCode} disabled={genCodeBusy} className="gap-1">
              <RefreshCw className={`w-3.5 h-3.5 ${genCodeBusy ? "animate-spin" : ""}`} /> New code
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border p-4 space-y-3">
          <div>
            <Label>PIN fallback</Label>
            <p className="text-xs text-muted-foreground">Set a 4–8 digit PIN as a backup pairing method. Useful if pairing-code rotation locks staff out.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">PIN</Label><Input type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" /></div>
            <div className="space-y-1"><Label className="text-xs">Confirm PIN</Label><Input type="password" inputMode="numeric" maxLength={8} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" /></div>
          </div>
          <Button variant="outline" size="sm" onClick={setKdsPin} disabled={savingPin || !pin}>{savingPin ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update PIN"}</Button>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Paired devices</p>
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No devices paired yet. Open the KDS URL on a kitchen tablet and enter the pairing code.</p>
          ) : (
            <div className="space-y-2">
              {devices.map((d) => (
                <div key={d.id} className={`flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 ${!d.active ? "opacity-60" : ""}`}>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{d.label || "Kitchen tablet"} {!d.active && <span className="text-[10px] uppercase text-muted-foreground ml-1">(revoked)</span>}</p>
                    <p className="text-[11px] text-muted-foreground">Paired {new Date(d.paired_at).toLocaleString()} · last seen {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "never"}</p>
                  </div>
                  {d.active && <Button variant="ghost" size="sm" onClick={() => revokeDevice(d.id)}>Revoke</Button>}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </OwnerLayout>
  );
}
