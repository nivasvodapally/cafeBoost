import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, LogIn, UserPlus, Sparkles } from "lucide-react";
import { setActiveCafe } from "@/lib/cafeContext";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

/**
 * Public cafe entry — the single QR landing page.
 * Shows a branded splash (logo + banner + tabs preview) while we set up the
 * session, then redirects into the customer app.
 */
export default function CafePublic() {
  const { slug, tableNo } = useParams<{ slug: string; tableNo?: string }>();
  const [error, setError] = useState<string | null>(null);
  const [cafeName, setCafeName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [needsChoice, setNeedsChoice] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const destination = tableNo ? "/app/menu" : "/app";
  const returnTo = `/cafe/${slug}${tableNo ? `/table/${tableNo}` : ""}`;

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    void (async () => {
      const { data: cafe } = await supabase
        .from("cafes")
        .select("id, slug, name, logo_url, banner_url")
        .eq("slug", slug)
        .maybeSingle();
      if (cancelled) return;
      if (!cafe) { setError("Cafe not found."); return; }
      setActiveCafe({
        id: cafe.id,
        slug: cafe.slug,
        name: cafe.name,
        table: tableNo ? decodeURIComponent(tableNo) : null,
      });
      setCafeName(cafe.name);
      setLogoUrl(cafe.logo_url);
      setBannerUrl(cafe.banner_url);

      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      // If signed-in cafe owner scans, send them to dashboard.
      if (session?.user) {
        const { data: hasOwner } = await supabase.rpc("has_role", {
          _user_id: session.user.id, _role: "owner",
        });
        if (cancelled) return;
        if (hasOwner) { navigate("/dashboard", { replace: true }); return; }
        // Already signed in as customer (or guest) — proceed.
        navigate(destination, { replace: true });
        return;
      }

      // Not signed in — let the user choose how to continue.
      setNeedsChoice(true);
    })();
    return () => { cancelled = true; };
  }, [slug, tableNo, navigate, destination]);

  const continueAsGuest = async () => {
    setBusy(true);
    const { error: anonErr } = await supabase.auth.signInAnonymously();
    if (anonErr) {
      setBusy(false);
      navigate(`/auth?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
      return;
    }
    setTimeout(() => navigate(destination, { replace: true }), 400);
  };

  const goAuth = (mode: "signin" | "signup") => {
    navigate(`/auth?mode=${mode}&returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
  };

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-hero p-4">
        <Card className="p-10 text-center max-w-md">
          <Logo />
          <p className="mt-6 font-display text-2xl font-bold">{error}</p>
          <p className="text-sm text-muted-foreground mt-2">Check the QR code or link and try again.</p>
          <Button variant="outline" className="mt-6" onClick={() => navigate("/discover")}>Browse cafes</Button>
        </Card>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gradient-hero">
      <div className="relative h-48 sm:h-64 overflow-hidden bg-gradient-accent">
        {bannerUrl && <img src={bannerUrl} alt="" className="w-full h-full object-cover opacity-90" />}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/95" />
      </div>
      <div className="-mt-16 relative px-4 pb-10">
        <Card className="max-w-md mx-auto p-8 text-center shadow-elegant">
          {logoUrl ? (
            <img src={logoUrl} alt={cafeName ?? "Cafe"} className="w-20 h-20 rounded-2xl mx-auto object-cover shadow-soft" />
          ) : (
            <div className="w-20 h-20 rounded-2xl mx-auto bg-accent-soft grid place-items-center text-3xl">☕</div>
          )}
          <h1 className="font-display text-2xl font-bold mt-4">{cafeName ?? "Loading…"}</h1>

          {!needsChoice ? (
            <>
              <p className="text-sm text-muted-foreground mt-1">Welcome — preparing your experience</p>
              <Loader2 className="w-5 h-5 animate-spin mx-auto mt-6 text-accent" />
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mt-1">
                {tableNo ? `You're at Table ${decodeURIComponent(tableNo)}. ` : ""}How would you like to continue?
              </p>
              <div className="flex flex-col gap-2 mt-6">
                <Button variant="hero" onClick={() => goAuth("signin")} disabled={busy}>
                  <LogIn className="w-4 h-4" /> Sign in to existing account
                </Button>
                <Button variant="outline" onClick={() => goAuth("signup")} disabled={busy}>
                  <UserPlus className="w-4 h-4" /> Create a new account
                </Button>
                <button
                  onClick={continueAsGuest}
                  disabled={busy}
                  className="text-sm text-muted-foreground hover:text-foreground mt-2 inline-flex items-center justify-center gap-1.5"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Continue as guest
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-4">
                Sign in to keep your rewards and order history across devices.
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
