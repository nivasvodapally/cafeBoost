import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Coffee, Loader2, QrCode, Search } from "lucide-react";
import { setActiveCafe } from "@/lib/cafeContext";
import { signOut, useAuth } from "@/hooks/useAuth";
import { QrScannerDialog } from "@/components/QrScannerDialog";

type Cafe = { id: string; slug: string; name: string; city: string | null; description: string | null };

export default function Discover() {
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    document.title = "Discover Cafes — CafeBoost";
    void supabase.from("cafes").select("id, slug, name, city, description")
      .eq("onboarding_completed", true).order("name")
      .then(({ data }) => { setCafes((data as Cafe[]) ?? []); setLoading(false); });
  }, []);

  const pick = (c: Cafe) => {
    setActiveCafe({ id: c.id, slug: c.slug, name: c.name });
    // Always go to /app — RequireRole forwards unauthenticated users to /auth
    // with returnTo=/app, so after sign-in/guest they land back here without
    // having to pick the cafe again.
    navigate("/app");
  };
  const filtered = cafes.filter(c => c.name.toLowerCase().includes(q.toLowerCase()) || (c.city ?? "").toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-screen bg-gradient-hero">
      <header className="bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/"><Logo /></Link>
          {user && <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate("/auth"); }}>Sign out</Button>}
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="font-display text-3xl font-bold">Find your cafe ☕</h1>
        <p className="mt-1 text-muted-foreground">Pick a cafe to view its menu, book a table, or check rewards.</p>
        <div className="mt-6 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-10" placeholder="Search cafes…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <Button variant="outline" onClick={() => setScanOpen(true)} className="gap-2 shrink-0" aria-label="Scan QR">
            <QrCode className="w-4 h-4" /> <span className="hidden sm:inline">Scan QR</span>
          </Button>
        </div>
        <QrScannerDialog open={scanOpen} onOpenChange={setScanOpen} />
        <div className="mt-6 space-y-3">
          {loading ? <div className="grid place-items-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            : filtered.length === 0 ? <Card className="p-10 text-center"><Coffee className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" /><p className="font-display text-xl font-bold">No cafes found</p><p className="text-sm text-muted-foreground mt-1">Try another search.</p></Card>
            : filtered.map(c => (
              <Card key={c.id} className="p-5 flex items-center justify-between hover:shadow-soft transition-smooth cursor-pointer" onClick={() => pick(c)}>
                <div className="min-w-0">
                  <p className="font-display font-bold text-lg truncate">{c.name}</p>
                  {c.city && <p className="text-xs text-muted-foreground">{c.city}</p>}
                  {c.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{c.description}</p>}
                </div>
                <Button variant="hero" size="sm">Visit</Button>
              </Card>
            ))}
        </div>
      </div>
    </div>
  );
}
