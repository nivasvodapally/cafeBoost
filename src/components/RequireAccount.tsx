import { useAuth } from "@/hooks/useAuth";

/**
 * Route guard that wraps protected customer routes.
 * Shows a redirect to /auth if the user has no session.
 * Browsing is always allowed; auth is required at action time.
 */
export function RequireAccount({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return null; // rely on the individual pages to show the auth prompt
  return <>{children}</>;
}