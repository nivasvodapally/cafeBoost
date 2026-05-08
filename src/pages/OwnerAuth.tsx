import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { ArrowLeft, Loader2, Store } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Mode = "signin" | "signup" | "forgot";

const authRedirectUrl = (path: string) => `${window.location.origin}/#${path.startsWith("/") ? path : `/${path}`}`;

/**
 * Owner-only auth page (lives at /for-cafes/auth).
 * Customers should use /auth — there's a link at the bottom for misroutes.
 */
export default function OwnerAuth() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { document.title = "Cafe Owner Sign In — CafeBoost"; }, []);

  // Redirect already-signed-in owners straight to dashboard
  useEffect(() => {
    let cancel = false;
    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancel || !session?.user) return;
      const { data: hasOwner } = await supabase.rpc("has_role", {
        _user_id: session.user.id, _role: "owner",
      });
      if (cancel) return;
      if (hasOwner) {
        const { data: cafe } = await supabase.from("cafes")
          .select("onboarding_completed").eq("owner_user_id", session.user.id).maybeSingle();
        navigate(!cafe || !cafe.onboarding_completed ? "/owner-setup" : "/dashboard", { replace: true });
      }
    });
    return () => { cancel = true; };
  }, [navigate]);

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
        if (!hasOwner) {
          await supabase.auth.signOut();
          setError("This account isn't a cafe owner. Use the customer sign-in page.");
          setLoading(false);
          return;
        }
        toast.success("Welcome back!");
        const { data: cafe } = await supabase.from("cafes")
          .select("onboarding_completed").eq("owner_user_id", data.user.id).maybeSingle();
        navigate(!cafe || !cafe.onboarding_completed ? "/owner-setup" : "/dashboard");
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: {
            emailRedirectTo: authRedirectUrl("/for-cafes/auth"),
            data: { full_name: fullName, role: "owner" },
          },
        });
        if (err) throw err;
        if (data.session) {
          toast.success("Account created — let's set up your cafe!");
          navigate("/owner-setup");
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
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-primary text-primary-foreground relative overflow-hidden">
        <Logo variant="light" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-xs font-semibold mb-4">
            <Store className="w-3.5 h-3.5" /> For Cafe Owners
          </div>
          <h2 className="font-display text-4xl font-bold leading-tight">
            "Our regulars feel seen, and our weekday sales are up 32%."
          </h2>
          <p className="mt-6 text-primary-foreground/80">— Sofia Alvarez, Aurora Coffee</p>
        </div>
        <div className="text-sm text-primary-foreground/60">© 2026 CafeBoost</div>
        <div className="absolute -right-32 -bottom-32 w-96 h-96 rounded-full bg-accent/20 blur-3xl" />
      </div>

      <div className="flex flex-col p-6 sm:p-12">
        <div className="flex justify-between items-center">
          <Link to="/for-cafes" className="lg:hidden"><Logo /></Link>
          <Link to="/for-cafes" className="text-sm text-muted-foreground hover:text-foreground transition-smooth flex items-center gap-1.5 ml-auto">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-center py-12">
          <Card className="w-full max-w-md p-8 shadow-soft">
            {mode === "forgot" ? (
              <>
                <h1 className="font-display text-3xl font-bold">Reset password</h1>
                <p className="mt-2 text-muted-foreground text-sm">We'll email you a reset link.</p>
                {forgotSent ? (
                  <div className="mt-6 text-center">
                    <p className="text-sm text-success bg-success/10 rounded-lg px-4 py-3">
                      Check <strong>{email}</strong> for your reset link.
                    </p>
                    <button type="button" onClick={() => { setMode("signin"); setForgotSent(false); setError(null); }}
                      className="mt-4 text-sm text-muted-foreground hover:text-foreground">
                      Back to Sign In
                    </button>
                  </div>
                ) : (
                  <form onSubmit={onForgot} className="mt-5 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="forgot-email">Email</Label>
                      <Input id="forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@cafe.com" required />
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
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-accent-soft text-accent-foreground text-xs font-semibold mb-3">
                  <Store className="w-3 h-3" /> Owner Portal
                </div>
                <h1 className="font-display text-3xl font-bold">{mode === "signin" ? "Sign in to your cafe" : "Start your free trial"}</h1>
                <p className="mt-2 text-muted-foreground text-sm">
                  {mode === "signin" ? "Manage bookings, orders, loyalty & menu." : "14-day free trial. No card required."}
                </p>

                <form onSubmit={onSubmit} className="mt-6 space-y-4">
                  {mode === "signup" && (
                    <div className="space-y-2">
                      <Label htmlFor="full_name">Your name</Label>
                      <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" required maxLength={80} />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="email">Work email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@cafe.com" required autoComplete="email" />
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
                  <Button type="submit" variant="hero" className="w-full" size="lg" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "signin" ? "Sign in" : "Create account"}
                  </Button>
                </form>

                <p className="mt-6 text-sm text-center text-muted-foreground">
                  {mode === "signin" ? "New to CafeBoost?" : "Already have an account?"}{" "}
                  <button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }} className="text-accent font-semibold hover:underline">
                    {mode === "signin" ? "Start free trial" : "Sign in"}
                  </button>
                </p>

                <div className="mt-6 pt-6 border-t border-border text-center text-xs text-muted-foreground">
                  Are you a customer?{" "}
                  <Link to="/auth" className="text-accent hover:underline font-medium">Use the customer sign-in →</Link>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
