import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { Loader2, Gift } from "lucide-react";
import { toast } from "sonner";
import { useAuth, claimGuestAccount } from "@/hooks/useAuth";

/**
 * Lets a guest (anonymous) user upgrade to a full account, preserving their
 * user_id and therefore all their orders, bookings and loyalty points.
 */
export default function ClaimAccount() {
  const navigate = useNavigate();
  const { user, isGuest, loading: authLoading, refreshProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { document.title = "Save your rewards — CafeBoost"; }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth", { replace: true }); return; }
    if (!isGuest) { navigate("/app", { replace: true }); return; }
  }, [authLoading, user, isGuest, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setLoading(true);
    const { error: err } = await claimGuestAccount({ email, password, fullName });
    if (err) { setError(err.message); setLoading(false); return; }
    // Refresh profile/roles in context BEFORE navigating so downstream
    // pages see the claimed account immediately.
    await refreshProfile();
    setLoading(false);
    toast.success("Account saved! You can now sign in with your email and password on any device.");
    navigate("/app");
  };

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-hero p-4">
      <Card className="w-full max-w-md p-8 shadow-elegant">
        <div className="flex justify-center"><Logo /></div>
        <div className="text-center mt-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-soft text-accent-foreground text-xs font-semibold mb-3">
            <Gift className="w-3.5 h-3.5" /> Claim your rewards
          </div>
          <h1 className="font-display text-2xl font-bold">Save your account</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Add an email and password to keep your rewards, orders and bookings — even on a new device.
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Your name</Label>
            <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" required maxLength={80} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" required minLength={6} autoComplete="new-password" />
          </div>
          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
          <Button type="submit" variant="hero" className="w-full" size="lg" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save my account"}
          </Button>
          <button type="button" onClick={() => navigate(-1)} className="w-full text-center text-sm text-muted-foreground hover:text-foreground">
            Maybe later
          </button>
        </form>
      </Card>
    </div>
  );
}
