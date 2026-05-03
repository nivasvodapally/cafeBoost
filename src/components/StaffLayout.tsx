import { Link, NavLink, useNavigate } from "react-router-dom";
import { BarChart3, ClipboardList, History, LogOut, Menu, Store, Timer, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Logo } from "./Logo";
import { Button } from "./ui/button";
import { signOut, useAuth } from "@/hooks/useAuth";
import { useStaffCafe } from "@/hooks/useStaffCafe";

const baseNav = [
  { to: "/staff", label: "My queue", icon: ClipboardList, end: true },
  { to: "/staff/history", label: "My history", icon: History, end: true },
  { to: "/staff/me", label: "My stats", icon: BarChart3, end: true },
  { to: "/staff/shift", label: "Shift", icon: Timer, end: true },
];

export function StaffLayout({ children, title, subtitle, action }: { children: ReactNode; title: string; subtitle?: string; action?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { profile, roles } = useAuth();
  const { cafe, assignment } = useStaffCafe();
  const role = assignment?.role ?? roles.find((r) => ["chef", "runner"].includes(r));
  const nav = baseNav;
  const name = profile?.full_name ?? profile?.email ?? "Staff";
  const initials = (name.match(/\b(\w)/g) ?? ["S"]).slice(0, 2).join("").toUpperCase();
  const onLogout = async () => { await signOut(); navigate("/staff/join"); };

  return (
    <div className="min-h-screen flex bg-background">
      <aside className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transition-transform ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        <div className="h-16 px-6 flex items-center border-b border-sidebar-border">
          <Link to="/staff" onClick={() => setOpen(false)}><Logo variant="light" /></Link>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-smooth ${isActive ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-soft" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"}`}>
              <Icon className="w-5 h-5" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-3">
            <div className="w-10 h-10 rounded-full bg-gradient-accent flex items-center justify-center font-semibold text-accent-foreground">{initials}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{name}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate capitalize">{role ?? "staff"} · {cafe?.name ?? "—"}</p>
            </div>
            <button onClick={onLogout} className="p-2 rounded-lg hover:bg-sidebar-accent transition-smooth" aria-label="Sign out"><LogOut className="w-4 h-4" /></button>
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
          <div className="flex items-center gap-4 px-4 sm:px-8 py-4">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(!open)}>{open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider"><Store className="w-3.5 h-3.5" /> Staff Portal</div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground truncate">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
            </div>
            {action}
          </div>
        </header>
        <main className="p-4 sm:p-8 max-w-7xl">{children}</main>
      </div>
    </div>
  );
}
