import { useEffect, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { useAuth, signInAsGuest } from "@/hooks/useAuth";
import { getActiveCafe, useValidateActiveCafe } from "@/lib/cafeContext";
import { supabase } from "@/integrations/supabase/client";

const SUPPRESS_KEY = "cafeboost:welcome-back-suppress";
const SESSION_TIMESTAMP_KEY = "cafeboost:guest_session_timestamp";
const SESSION_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour (changed from 24 hours)
const ACTIVITY_EVENTS = ['click', 'scroll', 'keydown', 'mousemove', 'touchstart'];

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

  // Activity tracking to reset session timeout on user interaction
  useEffect(() => {
    if (user) return; // Only track for guest sessions
    
    const updateActivityTimestamp = () => {
      const timestamp = sessionStorage.getItem(SESSION_TIMESTAMP_KEY);
      if (timestamp) {
        // Only update if we have an existing timestamp (session is active)
        sessionStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());
      }
    };

    // Add event listeners for user activity
    ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, updateActivityTimestamp, { passive: true });
    });

    return () => {
      ACTIVITY_EVENTS.forEach(event => {
        window.removeEventListener(event, updateActivityTimestamp);
      });
    };
  }, [user]);

  useEffect(() => {
    if (loading || user) return;
    
    // Check if session has expired
    const timestamp = sessionStorage.getItem(SESSION_TIMESTAMP_KEY);
    if (timestamp) {
      const sessionAge = Date.now() - parseInt(timestamp, 10);
      if (sessionAge > SESSION_MAX_AGE_MS) {
        // Session expired, clear suppression
        sessionStorage.removeItem(SUPPRESS_KEY);
        sessionStorage.removeItem(SESSION_TIMESTAMP_KEY);
      }
    }
    
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
    if (error) { setBusy(false); return; }
    await new Promise<void>(resolve => {
      const { data: stop } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN") { stop?.unsubscribe(); resolve(); }
      });
      setTimeout(resolve, 800);
    });
    sessionStorage.setItem(SUPPRESS_KEY, "1");
    sessionStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());
    setOpen(false);
  };

  const goSignIn = () => {
    sessionStorage.setItem(SUPPRESS_KEY, "1");
    sessionStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());
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
