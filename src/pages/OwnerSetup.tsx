import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cafeProfileSchema, slugify } from "@/lib/validation";

/**
 * Owner onboarding — creates the cafe row and marks it complete.
 * Trimmed from the original 6-step wizard to the essential first step;
 * additional configuration lives in /owner/settings, /owner/menu, /owner/loyalty.
 */
export default function OwnerSetup() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { document.title = "Set up your cafe — CafeBoost"; }, []);
  useEffect(() => { if (name && !slug) setSlug(slugify(name)); }, [name, slug]);

  // If the owner already has a cafe, send them straight to dashboard.
  useEffect(() => {
    if (loading || !user) return;
    void supabase.from("cafes").select("id, onboarding_completed").eq("owner_user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.onboarding_completed) navigate("/dashboard", { replace: true }); })
      .catch((err) => console.error("Failed to check onboarding status:", err));
  }, [user, loading, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = cafeProfileSchema.safeParse({ name, slug, city, description });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setSaving(true);
    const { error: cafeError } = await supabase.from("cafes").insert({
      name: parsed.data.name, slug: parsed.data.slug,
      city: parsed.data.city || null, description: parsed.data.description || null,
      owner_user_id: user.id, onboarding_completed: true,
      accept_online_orders: true, accept_reservations: true, loyalty_enabled: true,
    });
    if (cafeError) { toast.error(cafeError.message); setSaving(false); return; }
    setSaving(false);
    toast.success("Cafe created!");
    navigate("/dashboard", { replace: true });
  };

  if (loading) return <div className="min-h-screen grid place-items-center bg-background"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-gradient-hero grid place-items-center p-4">
      <Card className="w-full max-w-lg p-8 shadow-soft">
        <Logo />
        <h1 className="mt-6 font-display text-3xl font-bold">Set up your cafe</h1>
        <p className="mt-2 text-sm text-muted-foreground">You can fine-tune everything afterwards in Settings.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-2"><Label>Cafe name *</Label><Input value={name} onChange={e => setName(e.target.value)} required maxLength={80} /></div>
          <div className="space-y-2"><Label>Public slug *</Label><Input value={slug} onChange={e => setSlug(slugify(e.target.value))} required maxLength={60} /><p className="text-xs text-muted-foreground">Will be reachable at /cafe/{slug || "your-cafe"}</p></div>
          <div className="space-y-2"><Label>City</Label><Input value={city} onChange={e => setCity(e.target.value)} maxLength={80} /></div>
          <div className="space-y-2"><Label>Description</Label><Input value={description} onChange={e => setDescription(e.target.value)} maxLength={200} /></div>
          <Button type="submit" variant="hero" size="lg" className="w-full" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Rocket className="w-4 h-4 mr-1" /> Launch my cafe</>}
          </Button>
        </form>
      </Card>
    </div>
  );
}
