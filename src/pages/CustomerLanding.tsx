import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowRight, Coffee, Gift, CalendarCheck, QrCode, Search, Heart, Sparkles, Star } from "lucide-react";
import heroImage from "@/assets/hero-cafe.jpg";
import { useEffect, useState } from "react";
import { QrScannerDialog } from "@/components/QrScannerDialog";

const perks = [
  { icon: Gift, title: "Earn rewards", desc: "Collect points every visit at your favorite cafes." },
  { icon: CalendarCheck, title: "Book a table", desc: "Reserve your spot in seconds — no calls, no waiting." },
  { icon: QrCode, title: "Order at the table", desc: "Scan, order and pay without flagging down a server." },
  { icon: Heart, title: "Save your favorites", desc: "Keep your usual order and your favorite spots one tap away." },
];

const howItWorks = [
  { step: "1", title: "Find a cafe", desc: "Browse cafes near you or scan a QR at the table." },
  { step: "2", title: "Browse the menu", desc: "Explore the full menu as a guest — no signup needed to look around." },
  { step: "3", title: "Order or book", desc: "Create a free account when you're ready to place an order." },
];

export default function CustomerLanding() {
  const [scanOpen, setScanOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Brief loading skeleton for perceived performance
    const timer = setTimeout(() => setLoading(false), 600);
    document.title = "CafeBoost — Find cafes, earn rewards, skip the queue";
    const meta = document.querySelector('meta[name="description"]');
    const desc = "Discover great cafes near you, order ahead, book a table and earn rewards on every visit. No signup required to get started.";
    if (meta) meta.setAttribute("content", desc);
    else {
      const m = document.createElement("meta"); m.name = "description"; m.content = desc;
      document.head.appendChild(m);
    }
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Logo />
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#perks" className="hover:text-foreground transition-smooth">Why CafeBoost</a>
            <a href="#how" className="hover:text-foreground transition-smooth">How it works</a>
            <Link to="/for-cafes" className="hover:text-foreground transition-smooth">For cafes</Link>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Link to="/discover"><Button variant="hero" size="sm">Find a cafe</Button></Link>
          </div>
        </div>
      </header>

      {loading ? (
        /* HERO SKELETON */
        <section className="relative overflow-hidden bg-gradient-hero">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center py-16 md:py-24">
            <div>
              <Skeleton className="h-5 w-44 rounded-full mb-6" />
              <Skeleton className="h-16 sm:h-20 lg:h-24 w-full max-w-xl mb-4" />
              <Skeleton className="h-7 w-full max-w-md mb-2" />
              <Skeleton className="h-7 w-3/4 max-w-sm mb-6" />
              <div className="flex flex-wrap gap-3 mt-8">
                <Skeleton className="h-12 w-56 rounded-xl" />
                <Skeleton className="h-12 w-32 rounded-xl" />
                <Skeleton className="h-12 w-28 rounded-xl" />
              </div>
              <div className="mt-8 flex items-center gap-6">
                <Skeleton className="h-5 w-32" />
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-accent rounded-3xl blur-2xl opacity-30" />
              <Skeleton className="relative rounded-3xl aspect-[4/5] w-full" />
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* HERO */}
          <section className="relative overflow-hidden bg-gradient-hero">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center py-16 md:py-24">
              <div className="animate-fade-in">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-soft text-accent-foreground text-xs font-semibold mb-6">
                  <Sparkles className="w-3.5 h-3.5" /> Browse free · sign up when you order
                </div>
                <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.05]">
                  Find your next <br className="hidden sm:block" />
                  favorite cafe <span className="inline-block">☕</span>
                </h1>
                <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
                  Discover great cafes nearby, book a table, and order ahead. Browse the menu right now — create an account when you're ready to order.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link to="/discover"><Button variant="hero" size="xl" className="group gap-2">
                    <Search className="w-4 h-4" /> Find cafes near you
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-smooth" />
                  </Button></Link>
                  <Button variant="outline" size="xl" className="gap-2" onClick={() => setScanOpen(true)}>
                    <QrCode className="w-4 h-4" /> Scan QR
                  </Button>
                  <Link to="/auth"><Button variant="ghost" size="xl">Sign in</Button></Link>
                </div>
                <QrScannerDialog open={scanOpen} onOpenChange={setScanOpen} />
                <div className="mt-8 flex items-center gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="flex">
                      {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-accent text-accent" />)}
                    </div>
                    <span className="font-semibold text-foreground">New</span> — discover cafes near you
                  </div>
                </div>
              </div>
              <div className="relative animate-fade-in">
                <div className="absolute -inset-4 bg-gradient-accent rounded-3xl blur-2xl opacity-30" />
                <img src={heroImage} alt="Cozy cafe interior" loading="eager" className="relative rounded-3xl shadow-elegant object-cover aspect-[4/5] w-full" />
              </div>
            </div>
          </section>

          {/* PERKS */}
          <section id="perks" className="py-20 bg-background">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center max-w-2xl mx-auto">
                <h2 className="font-display text-3xl sm:text-4xl font-bold">Everything coffee lovers want</h2>
                <p className="mt-4 text-muted-foreground">From discovery to your first reward — all in one place.</p>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
                {perks.map((p) => (
                  <Card key={p.title} className="p-6 hover:shadow-elegant transition-smooth">
                    <div className="w-12 h-12 rounded-xl bg-accent-soft grid place-items-center text-accent">
                      <p.icon className="w-5 h-5" />
                    </div>
                    <h3 className="mt-4 font-display text-lg font-bold">{p.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          {/* HOW IT WORKS */}
          <section id="how" className="py-20 bg-secondary/30">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center max-w-2xl mx-auto">
                <h2 className="font-display text-3xl sm:text-4xl font-bold">Three taps to coffee</h2>
                <p className="mt-4 text-muted-foreground">Seriously, that's it.</p>
              </div>
              <div className="grid md:grid-cols-3 gap-6 mt-12">
                {howItWorks.map((s) => (
                  <div key={s.step} className="text-center">
                    <div className="w-12 h-12 rounded-full bg-accent text-accent-foreground font-bold grid place-items-center mx-auto">{s.step}</div>
                    <h3 className="mt-4 font-display text-lg font-bold">{s.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
                  </div>
                ))}
              </div>
              <div className="mt-12 text-center">
                <Link to="/discover"><Button variant="hero" size="lg" className="gap-2">
                  <Coffee className="w-4 h-4" /> Browse cafes
                </Button></Link>
              </div>
            </div>
          </section>

          {/* FOR OWNERS STRIP */}
          <section className="py-12 bg-gradient-primary text-primary-foreground">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <h3 className="font-display text-2xl font-bold">Run a cafe?</h3>
                <p className="text-primary-foreground/80 mt-1">Bring more regulars in with CafeBoost for cafes.</p>
              </div>
              <Link to="/for-cafes"><Button variant="secondary" size="lg" className="gap-2">
                For cafe owners <ArrowRight className="w-4 h-4" />
              </Button></Link>
            </div>
          </section>

          <footer className="py-8 border-t border-border text-center text-sm text-muted-foreground">
            © 2026 CafeBoost · <Link to="/for-cafes" className="hover:text-foreground">For cafes</Link>
          </footer>
        </>
      )}
    </div>
  );
}
