import { Navigate, useLocation } from "react-router-dom";
import { type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth, type AppRole } from "@/hooks/useAuth";

/**
 * Route guard — gates rendering on auth + role.
 *
 * - Customer routes: always pass through. No blocking, no redirects.
 *   Users browse freely. Auth check happens at action time (order placement).
 * - Owner/staff routes: wait for auth to resolve, require hasRole(role).
 */
export function RequireRole({
  role, children,
}: { role: AppRole; children: ReactNode }) {
  const { user, loading, hasRole } = useAuth();
  const location = useLocation();

  // Customer routes: pass through immediately — no auth gate for browsing.
  if (role === "customer") {
    return <>{children}</>;
  }

  // Owner/staff routes: must wait for auth to resolve.
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/for-cafes/auth" replace />;
  }
  if (!hasRole(role)) {
    return <Navigate to={role === "owner" ? "/discover" : "/dashboard"} replace />;
  }
  return <>{children}</>;
}
