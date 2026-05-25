import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ShoppingBag, CalendarCheck, Users, Gift, UtensilsCrossed, QrCode, Settings, LogOut, Menu, X, UserRoundCog, Wallet, Activity, Monitor, Table,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui/button";
import { signOut, useAuth } from "@/hooks/useAuth";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { NotificationsBell } from "./NotificationsBell";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/owner/orders", label: "Orders", icon: ShoppingBag },
  { to: "/owner/bookings", label: "Bookings", icon: CalendarCheck },
  { to: "/owner/customers", label: "Customers", icon: Users },
  { to: "/owner/loyalty", label: "Loyalty", icon: Gift },
  { to: "/owner/menu", label: "Menu", icon: UtensilsCrossed },
  { to: "/owner/qr", label: "QR Codes", icon: QrCode },
  { to: "/owner/staff", label: "Staff", icon: UserRoundCog },
  { to: "/owner/payments", label: "Payments", icon: Wallet },
  { to: "/owner/settings", label: "Settings", icon: Settings },
];

export function OwnerLayout({
  children, title, subtitle, action,
}: { children: ReactNode; title: string; subtitle?: string; action?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { cafe } = useOwnerCafe();

  // Unlock the AudioContext on the first user interaction so notification
  // beeps can play. Browsers block audio until a real user gesture occurs.
  useEffect(() => {
    const unlock = () => {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        if (ctx.state === "suspended") void ctx.resume();
        // Stash on window so OwnerOrders' playBeep can reuse it.
        window.__cafeboost_audio_ctx = ctx;
      } catch { /* ignore */ }
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  const onLogout = async () => { await signOut(); navigate("/auth"); };

  const name = profile?.full_name ?? profile?.email ?? "Owner";
  const initials = (name.match(/\b(\w)/g) ?? ["C"]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen flex bg-background">
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transition-transform ${
          open ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="h-16 px-6 flex items-center border-b border-sidebar-border">
          <Link to="/dashboard" onClick={() => setOpen(false)}><Logo variant="light" /></Link>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-smooth ${
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-soft"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-3">
            <div className="w-10 h-10 rounded-full bg-gradient-accent flex items-center justify-center font-semibold text-accent-foreground">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{name}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">{cafe?.name ?? "—"}</p>
            </div>
            <button onClick={onLogout} className="p-2 rounded-lg hover:bg-sidebar-accent transition-smooth" aria-label="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
          <div className="flex items-center gap-4 px-4 sm:px-8 py-4">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(!open)}>
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground truncate">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
            </div>
            <NotificationsBell />
            <ThemeToggle />
            {action}
          </div>
        </header>
        <main className="p-4 sm:p-8 max-w-7xl">{children}</main>
      </div>
    </div>
  );
}
