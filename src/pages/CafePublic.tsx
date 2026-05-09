import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { setActiveCafe } from "@/lib/cafeContext";

/**
 * Public cafe entry — the single QR landing page.
 * Validates the cafe exists, sets the active cafe context,
 * then routes the user to the customer app.
 * - Owners are redirected to their dashboard.
 * - Customers and anonymous users land on /app (or /app/menu for table scans).
 * Browsing is unrestricted; orders require a signed-in account.
 */
export default function CafePublic() {
  const { slug, tableNo } = useParams<{ slug: string; tableNo?: string }>();
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const destination = tableNo ? "/app/menu" : "/app";

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

      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      // Redirect owners to their dashboard.
      if (session?.user) {
        const { data: hasOwner } = await supabase.rpc("has_role", {
          _user_id: session.user.id,
          _role: "owner",
        });
        if (cancelled) return;
        if (hasOwner) { navigate("/dashboard", { replace: true }); return; }
      }

      // Customers and anonymous users land on the customer app.
      navigate(destination, { replace: true });
    })();

    return () => { cancelled = true; };
  }, [slug, tableNo, navigate, destination]);

  const goAuth = (mode: "signin" | "signup") => {
    const returnTo = `/cafe/${slug}${tableNo ? `/table/${tableNo}` : ""}`;
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
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <div className="w-20 h-20 rounded-2xl bg-accent-soft grid place-items-center text-3xl mb-6">☕</div>
        <p className="font-display text-2xl font-bold">{slug}</p>
        <p className="text-sm text-muted-foreground mt-2">Opening the cafe for you…</p>
      </div>
    </div>
  );
}