import { useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Input } from "./ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Lets a chef (or owner) set the cooking ETA in minutes.
 * Customers and runners will all see the live countdown.
 */
export function EtaPicker({ orderId, presets, currentMinutes, label = "Set ETA" }: {
  orderId: string;
  presets: number[];
  currentMinutes?: number | null;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState("");
  const [open, setOpen] = useState(false);

  const apply = async (minutes: number) => {
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 240) {
      toast.error("Pick 0 – 240 minutes"); return;
    }
    setBusy(true);
    const { error } = await (supabase as any).rpc("set_order_eta", { _order_id: orderId, _minutes: minutes });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`ETA set to ${minutes} min`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy}>
          {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Clock className="w-3 h-3 mr-1" />}
          {currentMinutes != null ? `ETA ${currentMinutes}m` : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Cook time (minutes)</p>
        <div className="grid grid-cols-3 gap-1.5">
          {presets.map((m) => (
            <Button key={m} variant={currentMinutes === m ? "hero" : "outline"} size="sm" onClick={() => void apply(m)}>{m}</Button>
          ))}
        </div>
        <div className="flex gap-1.5 pt-1">
          <Input type="number" min={0} max={240} placeholder="Custom" value={custom} onChange={(e) => setCustom(e.target.value)} className="h-8 text-xs" />
          <Button size="sm" onClick={() => void apply(parseInt(custom || "0", 10))}>OK</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}