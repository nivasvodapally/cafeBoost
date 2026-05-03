import { Navigate, useLocation } from "react-router-dom";
import { type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

// Chef role is deprecated — kitchen access is now a paired KDS device (no login).
// Only runners need a real staff session for the in-cafe portal.
const staffRoles = ["runner"];

export function RequireStaff({ children }: { children: ReactNode }) {
  const { user, loading, roles } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen grid place-items-center bg-background"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!user) return <Navigate to={`/staff/join?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!roles.some((role) => staffRoles.includes(role))) return <Navigate to="/staff/join" replace />;
  return <>{children}</>;
}
