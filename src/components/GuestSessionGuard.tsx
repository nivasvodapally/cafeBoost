import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { useAuth, signInAsGuest } from "@/hooks/useAuth";
import { getActiveCafe, useValidateActiveCafe } from "@/lib/cafeContext";

const SUPPRESS_KEY = "cafeboost:welcome-back-suppress";

/**
 * GuestSessionGuard
 *
 * Two responsibilities, app-wide:
 *  1. Validate the localStorage active-cafe still exists (clear if not).
 *  2. If the user previously visited a cafe (active-cafe in localStorage)
 *     but has no active session anymore (anonymous sessions don't persist
 *     across browser restarts), show a recovery prompt — never silently
 *     drop them into a broken state.
 */
export function GuestSessionGuard() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Validate stored cafe id against DB.
  useValidateActiveCafe();

  useEffect(() => {
    if (loading || user) return;
    // Don't nag on auth pages or the SaaS landing pages.
    const path = location.pathname;
    if (
      path.startsWith("/auth") ||
      path.startsWith("/for-cafes") ||
      path.startsWith("/reset-password") ||
      path.startsWith("/claim-account") ||
      path === "/"
    ) return;
    if (sessionStorage.getItem(SUPPRESS_KEY) === "1") return;
    const cafe = getActiveCafe();
    if (cafe) setOpen(true);
  }, [loading, user, location.pathname]);

  const continueAsGuest = async () => {
    setBusy(true);
    const { error } = await signInAsGuest();
    setBusy(false);
    if (!error) {
      sessionStorage.setItem(SUPPRESS_KEY, "1");
      setOpen(false);
    }
  };

  const goSignIn = () => {
    sessionStorage.setItem(SUPPRESS_KEY, "1");
    setOpen(false);
    navigate("/auth");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" /> Welcome back!
          </DialogTitle>
          <DialogDescription>
            Your previous session expired. Continue browsing as a guest, or sign in to keep your rewards safe across devices.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={continueAsGuest} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue as guest"}
          </Button>
          <Button variant="hero" onClick={goSignIn} disabled={busy}>
            Sign in / Create account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
