import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { ArrowLeft, Loader2, Store, Rocket, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/validation";

type Mode = "signin" | "signup" | "forgot";
type SignupStep = 1 | 2;

export default function OwnerAuth() {
  const [mode, setMode] = useState<Mode>("signin");
  const [signupStep, setSignupStep] = useState<SignupStep>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [cafeName, setCafeName] = useState("");
  const [cafeSlug, setCafeSlug] = useState("");
  const [cafeCity, setCafeCity] = useState("");
  const [cafeDescription, setCafeDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);
  const navigate = useNavigate();

  const handleCafeNameChange = (value: string) => {
    setCafeName(value);
    if (signupStep === 2 && !cafeSlug) {
      setCafeSlug(slugify(value));
    }
  };

  const handleSignupMode = () => {
    setMode("signup");
    setSignupStep(1);
    setError(null);
  };

  const onForgot = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/#/reset-password`,
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
        // Navigate after a short delay to let AuthProvider update roles
        setTimeout(() => navigate("/dashboard"), 100);
      } else {
        // Step 1 → Step 2
        if (signupStep === 1) {
          if (!email.trim() || !password || !fullName.trim()) {
            setError("Please fill in all fields");
            setLoading(false);
            return;
          }
          if (password.length < 6) {
            setError("Password must be at least 6 characters");
            setLoading(false);
            return;
          }
          setSignupStep(2);
          setLoading(false);
          return;
        }

        // Step 2: Create account, then sign in, then create cafe
        if (!cafeName.trim() || !cafeSlug.trim()) {
          setError("Please enter your cafe name and slug");
          setLoading(false);
          return;
        }

        // Step A: Sign up
        const { error: signupErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim(), role: "owner" },
          },
        });

        if (signupErr) {
          setError(signupErr.message);
          setLoading(false);
          return;
        }

        // Step B: Sign in immediately (to ensure we have a session)
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInErr) {
          setError("Account created! Please sign in to continue.");
          setMode("signin");
          setLoading(false);
          return;
        }

        // Step C: Create cafe (we now have a valid session)
        const { error: cafeErr } = await supabase.from("cafes").insert({
          name: cafeName.trim(),
          slug: slugify(cafeSlug.trim()),
          city: cafeCity.trim() || null,
          description: cafeDescription.trim() || null,
          owner_user_id: (await supabase.auth.getSession()).data.session?.user.id,
          onboarding_completed: true,
          accept_online_orders: true,
          accept_reservations: true,
          loyalty_enabled: true,
        });

        if (cafeErr) {
          setError("Account created! Sign in and create your cafe from the dashboard.");
          setLoading(false);
          return;
        }

        toast.success("Your cafe is live! Welcome to CafeBoost.");
        setTimeout(() => navigate("/dashboard"), 100);
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
            ) : mode === "signup" ? (
              <>
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-accent-soft text-accent-foreground text-xs font-semibold mb-3">
                  <Store className="w-3 h-3" /> Owner Portal
                </div>
                <h1 className="font-display text-3xl font-bold">
                  {signupStep === 1 ? "Start your free trial" : "Set up your cafe"}
                </h1>
                <p className="mt-2 text-muted-foreground text-sm">
                  {signupStep === 1
                    ? "14-day free trial. No card required."
                    : "Almost done — tell us about your cafe."}
                </p>

                <div className="flex items-center gap-2 mt-4">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${signupStep >= 1 ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>1</div>
                  <div className="flex-1 h-0.5 bg-muted" />
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${signupStep >= 2 ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>2</div>
                </div>

                <form onSubmit={onSubmit} className="mt-6 space-y-4">
                  {signupStep === 1 && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="full_name">Your name</Label>
                        <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" required maxLength={80} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Work email</Label>
                        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@cafe.com" required autoComplete="email" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} autoComplete="new-password" />
                      </div>
                    </>
                  )}

                  {signupStep === 2 && (
                    <>
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setSignupStep(1); setError(null); }} className="-ml-2 mb-2 text-muted-foreground">
                        ← Back
                      </Button>
                      <div className="space-y-2">
                        <Label htmlFor="cafe_name">Cafe name *</Label>
                        <Input id="cafe_name" value={cafeName} onChange={(e) => handleCafeNameChange(e.target.value)} placeholder="Aurora Coffee" required maxLength={80} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cafe_slug">Public slug *</Label>
                        <Input id="cafe_slug" value={cafeSlug} onChange={(e) => setCafeSlug(slugify(e.target.value))} placeholder="aurora-coffee" required maxLength={60} />
                        <p className="text-xs text-muted-foreground">Your cafe will be at /cafe/{cafeSlug || "your-cafe"}</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cafe_city">City</Label>
                        <Input id="cafe_city" value={cafeCity} onChange={(e) => setCafeCity(e.target.value)} placeholder="Mumbai" maxLength={80} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cafe_desc">Description</Label>
                        <Input id="cafe_desc" value={cafeDescription} onChange={(e) => setCafeDescription(e.target.value)} placeholder="Specialty coffee in the heart of the city" maxLength={200} />
                      </div>
                    </>
                  )}

                  {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
                  <Button type="submit" variant="hero" className="w-full" size="lg" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> :
                      signupStep === 1 ? <><ArrowRight className="w-4 h-4 mr-1" /> Continue</> : <><Rocket className="w-4 h-4 mr-1" /> Launch my cafe</>}
                  </Button>
                </form>

                <p className="mt-6 text-sm text-center text-muted-foreground">
                  Already have an account?{" "}
                  <button type="button" onClick={() => { setMode("signin"); setError(null); }} className="text-accent font-semibold hover:underline">
                    Sign in
                  </button>
                </p>

                <div className="mt-6 pt-6 border-t border-border text-center text-xs text-muted-foreground">
                  Are you a customer?{" "}
                  <Link to="/auth" className="text-accent hover:underline font-medium">Use the customer sign-in →</Link>
                </div>
              </>
            ) : (
              <>
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-accent-soft text-accent-foreground text-xs font-semibold mb-3">
                  <Store className="w-3 h-3" /> Owner Portal
                </div>
                <h1 className="font-display text-3xl font-bold">Sign in to your cafe</h1>
                <p className="mt-2 text-muted-foreground text-sm">Manage bookings, orders, loyalty & menu.</p>

                <form onSubmit={onSubmit} className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Work email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@cafe.com" required autoComplete="email" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <button type="button" onClick={() => { setMode("forgot"); setError(null); }} className="text-xs text-accent hover:underline">
                        Forgot?
                      </button>
                    </div>
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
                  </div>
                  {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
                  <Button type="submit" variant="hero" className="w-full" size="lg" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in"}
                  </Button>
                </form>

                <p className="mt-6 text-sm text-center text-muted-foreground">
                  New to CafeBoost?{" "}
                  <button type="button" onClick={handleSignupMode} className="text-accent font-semibold hover:underline">
                    Start free trial
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