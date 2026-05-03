import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { ArrowLeft, Loader2, Sparkles, Mail, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { signInAsGuest } from "@/hooks/useAuth";
import { lovable } from "@/integrations/lovable";

type Mode = "signin" | "signup" | "forgot";

// Email/magic-link redirects use the hash router so the link lands on the right page.
const authRedirectUrl = (path: string) => `${window.location.origin}/#${path.startsWith("/") ? path : `/${path}`}`;
// OAuth (Google) redirect MUST be on the bare origin — Lovable's managed OAuth proxy
// only allows the site origin as a callback target. The hash route is restored after
// the redirect via the post-login navigate() below.
const oauthRedirectUrl = () => window.location.origin;

/**
 * Customer-only auth page (/auth).
 * Includes a prominent "Continue as guest" path so customers can act without signing up.
 * Owners should use /for-cafes/auth.
 */
export default function Auth() {
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo") || "/discover";
  const initialMode = (params.get("mode") === "signup" ? "signup" : "signin") as Mode;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [showGuestFields, setShowGuestFields] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { document.title = "Sign in — CafeBoost"; }, []);

  // Auto-redirect already-signed-in customers. After Google OAuth lands back on the
  // bare origin, this effect picks up the stashed returnTo and restores deep-link intent.
  useEffect(() => {
    let cancel = false;
    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancel || !session?.user) return;
      const isAnon = (session.user as typeof session.user & { is_anonymous?: boolean }).is_anonymous;
      if (isAnon) return; // let guest stay on auth page if they want to claim/upgrade
      const { data: hasOwner } = await supabase.rpc("has_role", {
        _user_id: session.user.id, _role: "owner",
      });
      if (cancel) return;
      let dest = returnTo;
      try {
        const stashed = sessionStorage.getItem("cafeboost:postAuthReturnTo");
        if (stashed) { dest = stashed; sessionStorage.removeItem("cafeboost:postAuthReturnTo"); }
      } catch { /* ignore */ }
      navigate(hasOwner ? "/dashboard" : dest, { replace: true });
    });
    return () => { cancel = true; };
  }, [navigate, returnTo]);

  const onContinueAsGuest = async (opts?: { skip?: boolean }) => {
    // First click reveals the optional name/phone fields; second click (or Skip) creates the session.
    if (!opts?.skip && !showGuestFields) {
      setShowGuestFields(true);
      return;
    }
    const fullName = opts?.skip ? "" : guestName.trim();
    const phoneVal = opts?.skip ? "" : guestPhone.trim();

    setGuestLoading(true); setError(null);
    const { user, error: err } = await signInAsGuest({
      fullName: fullName || undefined,
      phone: phoneVal || undefined,
    });
    if (err) { setGuestLoading(false); setError(err.message); return; }

    // Persist name/phone on the profile row so all downstream orders/bookings show it.
    if (user && (fullName || phoneVal)) {
      const updates: { full_name?: string; phone?: string } = {};
      if (fullName) updates.full_name = fullName;
      if (phoneVal) updates.phone = phoneVal;
      // Profile row is created by the handle_new_user trigger; update it now.
      const { error: upErr } = await supabase
        .from("profiles")
        .update(updates)
        .eq("user_id", user.id);
      if (upErr) console.warn("Guest profile update failed:", upErr);
    }

    setGuestLoading(false);
    toast.success(fullName ? `Welcome, ${fullName.split(" ")[0]}!` : "You're in — explore as a guest");
    navigate(returnTo);
  };

  const onGoogle = async () => {
    setGoogleLoading(true); setError(null);
    // Stash the intended destination so we can restore it after the OAuth redirect.
    try { sessionStorage.setItem("cafeboost:postAuthReturnTo", returnTo); } catch { /* ignore */ }
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: oauthRedirectUrl(),
    });
    if (result.error) {
      setGoogleLoading(false);
      setError(result.error.message ?? "Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    toast.success("Welcome!");
    navigate(returnTo);
  };

  const onMagicLink = async () => {
    if (!email.trim()) { setError("Enter your email to get a magic link."); return; }
    setMagicLoading(true); setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: authRedirectUrl(returnTo), data: { role: "customer" } },
    });
    setMagicLoading(false);
    if (err) { setError(err.message); return; }
    setMagicSent(true);
  };

  const onForgot = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirectUrl("/reset-password"),
    });
    if (err) { setError(err.message); setLoading(false); return; }
    setForgotSent(true); setLoading(false);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setLoading(true);
    try {
      if (mode === "signin") {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(), password,
        });
        if (err) throw err;
        if (!data.user) return;
        const { data: hasOwner } = await supabase.rpc("has_role", {
          _user_id: data.user.id, _role: "owner",
        });
        if (hasOwner) {
          await supabase.auth.signOut();
          setError("This is a cafe owner account. Sign in at the owner page instead.");
          setLoading(false);
          return;
        }
        toast.success("Welcome back!");
        navigate(returnTo);
      } else {
        const meta: Record<string, string> = { full_name: fullName, role: "customer" };
        if (phone) meta.phone = phone;
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: authRedirectUrl(returnTo), data: meta },
        });
        if (err) throw err;
        if (data.session) {
          toast.success("Account created!");
          navigate(returnTo);
        } else {
          toast.success("Check your email to confirm your account.");
          setMode("signin");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-hero">
      <header className="px-6 py-4 flex items-center justify-between max-w-7xl mx-auto w-full">
        <Link to="/"><Logo /></Link>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-smooth flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 shadow-elegant">
          {mode === "forgot" ? (
            <>
              <h1 className="font-display text-3xl font-bold">Reset password</h1>
              <p className="mt-2 text-muted-foreground text-sm">We'll email you a reset link.</p>
              {forgotSent ? (
                <div className="mt-6 text-center">
                  <p className="text-sm text-success bg-success/10 rounded-lg px-4 py-3">
                    Check <strong>{email}</strong> for your reset link.
                  </p>
                  <button type="button" onClick={() => { setMode("signin"); setForgotSent(false); setError(null); }} className="mt-4 text-sm text-muted-foreground hover:text-foreground">
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={onForgot} className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email</Label>
                    <Input id="forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required />
                  </div>
                  {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
                  <Button type="submit" variant="hero" className="w-full" size="lg" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send reset link"}
                  </Button>
                  <button type="button" onClick={() => { setMode("signin"); setError(null); }} className="w-full text-center text-sm text-muted-foreground hover:text-foreground mt-2">
                    Back to Sign In
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
              <h1 className="font-display text-3xl font-bold">
                {mode === "signin" ? "Welcome back" : "Join CafeBoost"}
              </h1>
              <p className="mt-2 text-muted-foreground text-sm">
                {mode === "signin" ? "Order, book a table & track your rewards." : "Earn rewards at your favorite cafes."}
              </p>

              {/* Guest CTA — primary fast path */}
              {!showGuestFields ? (
                <>
                  <Button onClick={() => onContinueAsGuest()} variant="hero" size="lg" className="w-full mt-6 gap-2" disabled={guestLoading}>
                    {guestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4" /> Continue as guest</>}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Browse, order, and book — no signup. Upgrade anytime.
                  </p>
                </>
              ) : (
                <div className="mt-6 space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                  <div className="space-y-2">
                    <Label htmlFor="guest_name">Your name <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input id="guest_name" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Jane Doe" maxLength={80} autoFocus />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guest_phone">Phone <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input id="guest_phone" type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="+1 555 123 4567" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Adding a name helps the cafe recognise your orders.
                  </p>
                  {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
                  <div className="flex items-center gap-2 pt-1">
                    <Button onClick={() => onContinueAsGuest()} variant="hero" size="lg" className="flex-1 gap-2" disabled={guestLoading}>
                      {guestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4" /> Continue</>}
                    </Button>
                    <button type="button" onClick={() => onContinueAsGuest({ skip: true })} className="text-sm text-muted-foreground hover:text-foreground px-3" disabled={guestLoading}>
                      Skip
                    </button>
                  </div>
                </div>
              )}

              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>

              <Button type="button" onClick={onGoogle} variant="outline" size="lg" className="w-full gap-2" disabled={googleLoading}>
                {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
                    Continue with Google
                  </>
                )}
              </Button>

              {/* Secondary: email — collapsed by default to declutter */}
              {!showEmail ? (
                <button
                  type="button"
                  onClick={() => setShowEmail(true)}
                  className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 py-2"
                >
                  <Mail className="w-3.5 h-3.5" /> Use email instead
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              ) : (
              <>
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">{mode === "signup" ? "Create with email" : "Email & password"}</span>
                </div>
              </div>

              <form onSubmit={onSubmit} className="space-y-4">
                {mode === "signup" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="full_name">Full name</Label>
                      <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" required maxLength={80} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone <span className="text-muted-foreground font-normal">(optional)</span></Label>
                      <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {mode === "signin" && (
                      <button type="button" onClick={() => { setMode("forgot"); setError(null); }} className="text-xs text-accent hover:underline">
                        Forgot?
                      </button>
                    )}
                  </div>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
                </div>
                {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
                {magicSent && <p className="text-sm text-success bg-success/10 rounded-lg px-3 py-2">Magic link sent! Check {email}.</p>}
                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "signin" ? "Sign in" : "Create account"}
                </Button>
                {mode === "signin" && (
                  <button type="button" onClick={onMagicLink} className="w-full text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5" disabled={magicLoading}>
                    {magicLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <>Email me a magic link instead</>}
                  </button>
                )}
              </form>

              <p className="mt-4 text-sm text-center text-muted-foreground">
                {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
                <button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }} className="text-accent font-semibold hover:underline">
                  {mode === "signin" ? "Create account" : "Sign in"}
                </button>
              </p>
              </>
              )}

              <div className="mt-6 pt-6 border-t border-border text-center text-xs text-muted-foreground">
                Cafe owner?{" "}
                <Link to="/for-cafes/auth" className="text-accent hover:underline font-medium">Sign in to manage your cafe →</Link>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
