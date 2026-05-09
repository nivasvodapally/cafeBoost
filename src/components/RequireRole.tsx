import { Navigate, useLocation } from "react-router-dom";
import { type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth, type AppRole } from "@/hooks/useAuth";

/**
 * Route guard — gates rendering on auth + role.
 *
 * - loading=true: show spinner (waiting for auth state to resolve).
 * - loading=false + no user: redirect to appropriate auth page.
 * - loading=false + customer role: ALWAYS pass through immediately.
 *   Customer/guest browsing must NEVER be blocked by loading/roles.
 *   Profile fetch is async; Menu.tsx handles is_guest check inline.
 * - loading=false + owner/staff: require hasRole(role) to be true.
 */
export function RequireRole({
  role, children,
}: { role: AppRole; children: ReactNode }) {
  const { user, loading, hasRole } = useAuth();
  const location = useLocation();

  // Customer routes: never block on loading or roles. Pass through immediately.
  if (role === "customer") {
    if (!user) {
      // No user at all — redirect to sign in.
      const returnTo = encodeURIComponent(location.pathname + location.search);
      return <Navigate to={`/auth?returnTo=${returnTo}`} replace />;
    }
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
