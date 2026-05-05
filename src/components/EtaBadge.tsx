import { Clock } from "lucide-react";

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
  if (minutes == null) return null;
  const base = etaUpdatedAt ? new Date(etaUpdatedAt).getTime() : Date.now();
  const targetMs = base + minutes * 60_000;
  const remainingMin = Math.max(0, Math.round((targetMs - Date.now()) / 60_000));
  const stale = ["ready", "completed", "cancelled"].includes(status ?? "");
  const label = stale
    ? `${minutes} min total`
    : remainingMin === 0
      ? "Any moment"
      : `~${remainingMin} min`;
  const tone = stale
    ? "bg-muted text-muted-foreground"
    : remainingMin === 0
      ? "bg-success/15 text-success"
      : "bg-accent-soft text-accent-foreground";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${tone} ${className}`}>
      <Clock className="w-3 h-3" /> {label}
    </span>
  );
}