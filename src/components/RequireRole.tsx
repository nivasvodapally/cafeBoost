import { Navigate, useLocation } from "react-router-dom";
import { type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth, type AppRole } from "@/hooks/useAuth";

/**
 * Route guard — gates rendering on auth + role.
 *
 * Reads from AuthContext (no per-navigation RPC). The role list is fetched
 * once on session change inside AuthProvider.
 */
export function RequireRole({
  role, children,
}: { role: AppRole; children: ReactNode }) {
  const { user, loading, hasRole } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) {
    // Preserve the customer's intended destination so we don't dump them back
    // onto /discover after sign-in (which would force re-picking a cafe).
    const returnTo = encodeURIComponent(location.pathname + location.search);
    const to = role === "owner"
      ? "/for-cafes/auth"
      : `/auth?returnTo=${returnTo}`;
    return <Navigate to={to} replace />;
  }
  if (!hasRole(role)) {
    return <Navigate to={role === "owner" ? "/discover" : "/dashboard"} replace />;
  }
  return <>{children}</>;
}
