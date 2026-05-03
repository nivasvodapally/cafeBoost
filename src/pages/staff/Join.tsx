import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, UserRoundCog } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Mode = "signin" | "signup";
const staffRoles = ["chef", "runner"];
const staffJoinRedirectUrl = (invite?: string | null) => `${window.location.origin}/#/staff/join${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`;
const getErrorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return "Unable to join staff portal";
};

export default function StaffJoin() {
  const [params] = useSearchParams();
  const invite = params.get("invite") || params.get("code") || "";
  const returnTo = params.get("returnTo") || "/staff";
  const [mode, setMode] = useState<Mode>("signup");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState(invite);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, roles, refreshProfile, loading: authLoading } = useAuth();
  const autoJoinAttempted = useRef(false);

  useEffect(() => { document.title = "Staff Join — CafeBoost"; }, []);
  useEffect(() => { if (invite) setCode(invite); }, [invite]);
  const joinWithCode = async () => {
    if (!code.trim()) throw new Error("Open a staff invite link or paste a valid invite code.");
    const { error: joinError } = await (supabase as any).rpc("join_staff_with_code", { _code: code.trim(), _full_name: fullName.trim() || null });
    if (joinError) throw joinError;
    await refreshProfile();
    toast.success("Staff access activated");
    navigate(returnTo);
  };

  useEffect(() => {
    if (user && roles.some((role) => staffRoles.includes(role))) navigate(returnTo, { replace: true });
  }, [user, roles, navigate, returnTo]);
  useEffect(() => {
    if (authLoading || !user || !invite || autoJoinAttempted.current || roles.some((role) => staffRoles.includes(role))) return;
    autoJoinAttempted.current = true;
    setLoading(true);
    void joinWithCode().catch((err) => setError(getErrorMessage(err))).finally(() => setLoading(false));
  }, [authLoading, user, invite, roles]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null); setLoading(true);
    try {
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
        await joinWithCode();
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: staffJoinRedirectUrl(code), data: { full_name: fullName, role: "customer" } },
        });
        if (signUpError) throw signUpError;
        if (!data.session) { toast.success("Confirm your email, then return here with your staff code."); setMode("signin"); }
        else await joinWithCode();
      }
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-hero">
      <header className="px-6 py-4 flex items-center justify-between max-w-7xl mx-auto w-full">
        <Link to="/"><Logo /></Link>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-smooth flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Link>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 shadow-elegant">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-accent-soft text-accent-foreground text-xs font-semibold mb-3"><UserRoundCog className="w-3 h-3" /> Staff Portal</div>
          <h1 className="font-display text-3xl font-bold">{mode === "signin" ? "Sign in as staff" : "Join your cafe team"}</h1>
          <p className="mt-2 text-muted-foreground text-sm">Use the invite link shared by the cafe owner.</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {mode === "signup" && <div className="space-y-2"><Label htmlFor="staff-name">Full name</Label><Input id="staff-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={80} /></div>}
            <div className="space-y-2"><Label htmlFor="staff-email">Email</Label><Input id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="staff-password">Password</Label><Input id="staff-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></div>
            {!invite && <div className="space-y-2"><Label htmlFor="staff-code">Invite code</Label><Input id="staff-code" value={code} onChange={(e) => setCode(e.target.value.trim())} required placeholder="Paste staff invite code" /></div>}
            {invite && <p className="text-sm rounded-lg bg-accent-soft px-3 py-2 text-accent-foreground">Staff invite detected. Sign in or create your account to activate access.</p>}
            {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
            <Button type="submit" variant="hero" size="lg" className="w-full" disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "signin" ? "Sign in & join" : "Create staff account"}</Button>
          </form>
          <p className="mt-6 text-sm text-center text-muted-foreground">{mode === "signin" ? "New staff member?" : "Already joined?"} <button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }} className="text-accent font-semibold hover:underline">{mode === "signin" ? "Create account" : "Sign in"}</button></p>
        </Card>
      </div>
    </div>
  );
}
