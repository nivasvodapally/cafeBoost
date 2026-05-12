import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChefHat, CheckCircle2, Clock, Flame, Loader2, LogOut, RefreshCw, Settings as SettingsIcon, Tablet, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { kdsDevice } from "@/lib/kdsDevice";

type KdsItem = { name: string; quantity: number; price: number };
type KdsOrder = {
  id: string; customer_name: string; table_no: string | null; source: string; status: "accepted"|"preparing"|"ready";
  payment_status: string; total_amount: number; notes: string | null; created_at: string;
  accepted_at: string | null; preparing_at: string | null; ready_at: string | null;
  wait_eta_minutes: number | null; eta_updated_at: string | null;
  items: KdsItem[] | null;
};
type KdsBoard = {
  cafe: { id: string; name: string; currency: string | null; eta_presets: number[] };
  orders: KdsOrder[];
  device: { id: string; label: string | null };
};

const ageMin = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

function PairingScreen({ onPaired }: { onPaired: (token: string, label: string | null) => void }) {
  const [mode, setMode] = useState<"code" | "pin">("code");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("Kitchen tablet");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (mode === "code") {
      if (!code.trim()) { toast.error("Enter the pairing code"); return; }
    } else {
      if (!slug.trim()) { toast.error("Enter the cafe shortcode"); return; }
      if (!pin.trim()) { toast.error("Enter the PIN"); return; }
    }
    setBusy(true);
    
    // Stable browser identifier for server-side rate limiting
    let pairingId = localStorage.getItem("cafeboost:kds:pairingId");
    if (!pairingId) {
      pairingId = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
      localStorage.setItem("cafeboost:kds:pairingId", pairingId);
    }

    const { data, error } = await supabase.rpc("kds_pair_device_v3", {
        _code: mode === "code" ? code.trim() : null,
        _pin: mode === "pin" ? pin.trim() : null,
        _slug: mode === "pin" ? slug.trim().toLowerCase() : null,
        _label: label,
        _identifier: pairingId,
      });
    setBusy(false);
    const paired = data as { token: string } | null;
    if (error || !paired?.token) { toast.error(error?.message ?? "Pairing failed"); return; }
    onPaired(paired.token, label);
  };

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-hero p-6">
      <Card className="w-full max-w-md p-8 shadow-elegant">
        <div className="flex justify-between items-center mb-6">
          <Logo />
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-accent-soft text-accent-foreground">
            <Tablet className="w-3 h-3" /> KDS
          </span>
        </div>
        <h1 className="font-display text-3xl font-bold">Pair this kitchen display</h1>
        <p className="mt-2 text-sm text-muted-foreground">Owner generates a one-time pairing code from <strong>Settings → Kitchen Display</strong>. After pairing, this tablet stays connected.</p>

        <div className="mt-6 flex gap-1 rounded-lg bg-muted p-1">
          <button type="button" onClick={() => setMode("code")} className={`flex-1 text-sm font-semibold py-1.5 rounded-md transition ${mode === "code" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Pairing code</button>
          <button type="button" onClick={() => setMode("pin")} className={`flex-1 text-sm font-semibold py-1.5 rounded-md transition ${mode === "pin" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>PIN fallback</button>
        </div>

        <div className="mt-4 space-y-4">
          {mode === "code" ? (
            <div className="space-y-2">
              <Label>Pairing code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. A3K9PQ" autoCapitalize="characters" autoFocus />
              <p className="text-xs text-muted-foreground">No need to enter the cafe — the code identifies your cafe automatically.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Cafe shortcode</Label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="e.g. aurora-coffee" autoCapitalize="none" />
              </div>
              <div className="space-y-2">
                <Label>PIN</Label>
                <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" type="password" inputMode="numeric" maxLength={8} />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label>Device label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Kitchen tablet" />
          </div>
          <Button onClick={submit} variant="hero" size="lg" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Pair device"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function KDSPage() {
  const [token, setToken] = useState<string | null>(() => kdsDevice.getToken());
  const [board, setBoard] = useState<KdsBoard | null>(null);
  const [cafeId, setCafeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showEta, setShowEta] = useState<string | null>(null);
  const tickRef = useRef<number | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => { document.title = "KDS — Kitchen Display"; }, []);

  const fetchBoard = useCallback(async (tok: string) => {
    const { data, error } = await supabase.rpc("kds_get_orders", { _token: tok });
    if (error) {
      if (/Invalid KDS device/i.test(error.message)) {
        kdsDevice.clear(); setToken(null); setCafeId(null); toast.error("Device unpaired — please pair again");
      } else {
        toast.error(error.message);
      }
      return;
    }
    const boardData = data as KdsBoard | null;
    setBoard(boardData);
    // Extract cafe_id from board data for filtered subscriptions
    if (boardData?.cafe?.id) {
      setCafeId(boardData.cafe.id);
    } else {
      setCafeId(null);
    }
  }, []);

  // Effect 1: Initial fetch when token changes
  useEffect(() => {
    if (!token) { setLoading(false); setCafeId(null); return; }
    setLoading(true);
    void fetchBoard(token).finally(() => setLoading(false));
  }, [token, fetchBoard]);

  // Effect 2: Set up realtime subscription and polling when cafeId is available
  useEffect(() => {
    if (!token || !cafeId) return;

    // Clean up any existing subscription
    if (channelRef.current) void supabase.removeChannel(channelRef.current);
    
    // Create filtered subscription for orders in this specific cafe only
    const ch = supabase.channel(`kds:${token.slice(0, 8)}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `cafe_id=eq.${cafeId}`  // CRITICAL: Filter by cafe_id to avoid unnecessary notifications
      }, () => void fetchBoard(token))
      .subscribe();
    channelRef.current = ch;

    // Tick every 15s — refresh board (realtime backup) AND age display.
    tickRef.current = window.setInterval(() => {
      void fetchBoard(token);
    }, 15_000);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (channelRef.current) void supabase.removeChannel(channelRef.current);
    };
  }, [token, cafeId, fetchBoard]);

  const act = async (orderId: string, action: "prepare"|"ready"|"set_eta", etaMinutes?: number) => {
    if (!token) return;
    setBusyId(orderId);
    const { error } = await supabase.rpc("kds_act_on_order", { _token: token, _order_id: orderId, _action: action, _eta_minutes: etaMinutes ?? null });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    setShowEta(null);
    void fetchBoard(token);
  };

  const groups = useMemo(() => {
    const g: Record<"accepted" | "preparing" | "ready", KdsOrder[]> = { accepted: [], preparing: [], ready: [] };
    (board?.orders ?? []).forEach((o) => {
      if (o.status in g) {
        g[o.status as keyof typeof g].push(o);
      }
    });
    return g;
  }, [board]);

  if (!token) return <PairingScreen onPaired={(t, l) => { kdsDevice.save(t, l); setToken(t); }} />;
  if (loading) return <div className="min-h-screen grid place-items-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  const unpair = () => { if (!confirm("Unpair this device?")) return; kdsDevice.clear(); setToken(null); setBoard(null); setCafeId(null); };
  const presets = board?.cafe.eta_presets ?? [5, 10, 15, 20, 30];

  const renderOrder = (o: KdsOrder) => {
    const ageRef = o.preparing_at ?? o.accepted_at ?? o.created_at;
    const minutes = ageMin(ageRef);
    const hot = minutes >= 8;
    return (
      <Card key={o.id} className={`p-4 space-y-3 ${hot && o.status !== "ready" ? "border-destructive bg-destructive/5" : ""}`}>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p className="font-display text-lg font-bold leading-tight">#{o.id.slice(0, 6).toUpperCase()}</p>
            <p className="text-xs text-muted-foreground">{o.customer_name}{o.table_no ? ` · Table ${o.table_no}` : ""}</p>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <Clock className="w-3 h-3" />
            <span className={hot ? "font-bold text-destructive" : "font-semibold"}>{minutes}m</span>
            {o.payment_status === "paid" && <span className="ml-2 text-xs bg-success/15 text-success px-2 py-1 rounded font-bold">PAID</span>}
            {o.payment_status === "pending" && <span className="ml-2 text-xs bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-1 rounded font-bold">UNPAID</span>}
          </div>
        </div>
        <div className="space-y-1 pt-2 border-t border-border">
          {(o.items ?? []).map((it, i) => (
            <div key={i} className="flex justify-between text-sm font-medium">
              <span><span className="text-accent font-bold">{it.quantity}×</span> {it.name}</span>
            </div>
          ))}
        </div>
        {o.notes && <p className="text-xs italic bg-muted/50 px-2 py-1.5 rounded">📝 {o.notes}</p>}
        {o.wait_eta_minutes != null && (
          <p className="text-xs text-accent-foreground bg-accent-soft inline-flex items-center gap-1 px-2 py-1 rounded font-semibold">
            <Timer className="w-3 h-3" /> ETA {o.wait_eta_minutes}m
          </p>
        )}

        {showEta === o.id ? (
          <div className="flex gap-1.5 flex-wrap">
            {presets.map((p) => (
              <Button key={p} size="sm" variant="outline" onClick={() => act(o.id, "set_eta", p)} disabled={busyId === o.id}>{p}m</Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setShowEta(null)}>Cancel</Button>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setShowEta(o.id)} disabled={busyId === o.id}><Timer className="w-3 h-3 mr-1" /> ETA</Button>
            {o.status === "accepted" && (
              <Button size="sm" variant="hero" onClick={() => act(o.id, "prepare")} disabled={busyId === o.id}>
                {busyId === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Flame className="w-3 h-3 mr-1" /> Start prep</>}
              </Button>
            )}
            {o.status === "preparing" && (
              <Button size="sm" variant="hero" onClick={() => act(o.id, "ready")} disabled={busyId === o.id}>
                {busyId === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle2 className="w-3 h-3 mr-1" /> Ready for runner</>}
              </Button>
            )}
          </div>
        )}
      </Card>
    );
  };

  const Column = ({ title, list, icon: Icon, accent }: { title: string; list: KdsOrder[]; icon: typeof ChefHat; accent: string }) => (
    <div className="flex-1 min-w-[280px] flex flex-col">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="font-display text-lg font-bold flex items-center gap-2">
          <Icon className={`w-4 h-4 ${accent}`} /> {title}
        </h2>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted">{list.length}</span>
      </div>
      <div className="space-y-3">
        {list.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground/70 py-6 border-2 border-dashed border-border rounded-lg">No orders</div>
        ) : list.map(renderOrder)}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-4 px-4 py-3">
          <Logo />
          <div className="flex-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kitchen Display</p>
            <h1 className="font-display text-xl font-bold">{board?.cafe.name}</h1>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground"><Tablet className="w-3 h-3" /> {board?.device.label ?? "Device"}</span>
          <Button variant="ghost" size="sm" onClick={() => token && void fetchBoard(token)}><RefreshCw className="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" onClick={unpair}><LogOut className="w-4 h-4 mr-1" /> Unpair</Button>
        </div>
      </header>
      <main className="p-4">
        <div className="flex gap-4 overflow-x-auto pb-4">
          <Column title="New tickets" list={groups.accepted} icon={ChefHat} accent="text-blue-500" />
          <Column title="Cooking" list={groups.preparing} icon={Flame} accent="text-orange-500" />
          <Column title="Ready for runner" list={groups.ready} icon={CheckCircle2} accent="text-green-500" />
        </div>
      </main>
    </div>
  );
}
