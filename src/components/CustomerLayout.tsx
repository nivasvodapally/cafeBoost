import { Link, NavLink, useNavigate } from "react-router-dom";
import { Home, UtensilsCrossed, Calendar, Gift, ClipboardList, User, LogOut, Coffee, ChevronDown, Sparkles, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "./Logo";
import { Button } from "./ui/button";
import { signOut, useAuth } from "@/hooks/useAuth";
import { useActiveCafe, setActiveCafe } from "@/lib/cafeContext";

const nav = [
  { to: "/app", label: "Home", icon: Home, end: true },
  { to: "/app/menu", label: "Menu", icon: UtensilsCrossed },
  { to: "/app/book", label: "Book", icon: Calendar },
  { to: "/app/rewards", label: "Rewards", icon: Gift },
  { to: "/app/orders", label: "Orders", icon: ClipboardList },
  { to: "/app/profile", label: "Profile", icon: User },
];

const GUEST_BANNER_DISMISS_KEY = "cafeboost:guest-banner-dismissed";

export function CustomerLayout({
  children, title, subtitle, action,
}: { children: ReactNode; title?: string; subtitle?: string; action?: ReactNode }) {
  const { profile, isGuest } = useAuth();
  const cafe = useActiveCafe();
  const navigate = useNavigate();
  const [bannerDismissed, setBannerDismissed] = useState(true);

  useEffect(() => {
    // Persisted in localStorage so once the guest dismisses, it stays dismissed
    // across browser sessions (not just this tab).
    setBannerDismissed(typeof window !== "undefined" && localStorage.getItem(GUEST_BANNER_DISMISS_KEY) === "1");
  }, []);

  const dismissBanner = () => {
    localStorage.setItem(GUEST_BANNER_DISMISS_KEY, "1");
    setBannerDismissed(true);
  };

  const onLogout = async () => { await signOut(); navigate("/auth"); };
  const switchCafe = () => { setActiveCafe(null); navigate("/discover"); };

  const showGuestBanner = isGuest && !bannerDismissed;

  return (
    <div className="min-h-screen bg-gradient-hero pb-24 lg:pb-8">
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link to="/app"><Logo /></Link>
          <button
            type="button"
            onClick={switchCafe}
            className="ml-1 inline-flex items-center gap-1 text-xs font-semibold text-accent-foreground bg-accent-soft px-2.5 py-1 rounded-full hover:opacity-80 transition-smooth"
            title="Switch cafe"
          >
            <Coffee className="w-3 h-3" />
            <span className="max-w-[140px] truncate">{cafe?.name ?? "Pick a cafe"}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {cafe?.table && (
            <span className="text-[11px] font-semibold bg-foreground text-background px-2 py-1 rounded-full" title="Ordering for table">
              Table {cafe.table}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              Hi, {profile?.full_name?.split(" ")[0] ?? (isGuest ? "guest" : "there")}
            </span>
            <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Sign out">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {showGuestBanner && (
        <div className="bg-accent-soft border-b border-accent/20">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-accent shrink-0" />
            <p className="text-sm text-accent-foreground flex-1 min-w-0">
              You're browsing as a guest. <Link to="/claim-account" className="font-semibold underline">Save your rewards →</Link>
            </p>
            <button onClick={dismissBanner} aria-label="Dismiss" className="text-accent-foreground/60 hover:text-accent-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6">
        {(title || action) && (
          <div className="flex items-end justify-between gap-3 mb-5">
            <div className="min-w-0">
              {title && <h1 className="font-display text-2xl sm:text-3xl font-bold truncate">{title}</h1>}
              {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
            </div>
            {action}
          </div>
        )}
        {children}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-md border-t border-border lg:hidden">
        <div className="grid grid-cols-6 max-w-3xl mx-auto">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-smooth ${
                  isActive ? "text-accent" : "text-muted-foreground"
                }`
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
