import { Coffee } from "lucide-react";

export function Logo({ variant = "default" }: { variant?: "default" | "light" }) {
  const textClass = variant === "light" ? "text-primary-foreground" : "text-foreground";
  return (
    <div className={`flex items-center gap-2 ${textClass}`}>
      <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center">
        <Coffee className="w-4 h-4 text-accent-foreground" />
      </div>
      <span className="font-display text-xl font-bold tracking-tight">CafeBoost</span>
    </div>
  );
}
