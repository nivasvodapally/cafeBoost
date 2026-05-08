import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Shows the chef's ETA. If the order is still being prepared we render a
 * live countdown ("3 min left") based on eta_updated_at + minutes. If it is
 * already past, we render "Any moment".
 */
export function EtaBadge({
  minutes, etaUpdatedAt, status, className = "",
}: {
  minutes: number | null | undefined;
  etaUpdatedAt: string | null | undefined;
  status?: string;
  className?: string;
}) {
  const [remainingMin, setRemainingMin] = useState<number>(0);
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    if (minutes == null) return;

    const base = etaUpdatedAt ? new Date(etaUpdatedAt).getTime() : Date.now();
    const targetMs = base + minutes * 60_000;
    
    const updateRemaining = () => {
      const now = Date.now();
      const newRemaining = Math.max(0, Math.round((targetMs - now) / 60_000));
      setRemainingMin(newRemaining);
    };

    // Check if order is stale (completed, ready, or cancelled)
    const staleStatus = ["ready", "completed", "cancelled"].includes(status ?? "");
    setIsStale(staleStatus);

    // Initial update
    updateRemaining();

    // Set up interval to update every 30 seconds for live countdown
    // This is frequent enough for minute-level precision
    const intervalId = setInterval(updateRemaining, 30000);

    return () => clearInterval(intervalId);
  }, [minutes, etaUpdatedAt, status]);

  if (minutes == null) return null;

  const label = isStale
    ? `${minutes} min total`
    : remainingMin === 0
      ? "Any moment"
      : `~${remainingMin} min`;
  const tone = isStale
    ? "bg-muted text-muted-foreground"
    : remainingMin === 0
      ? "bg-success/15 text-success"
      : "bg-accent-soft text-accent-foreground";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${tone} ${className}`}>
      <Clock className="w-3 h-3" /> {label}
    </span>
  );
}