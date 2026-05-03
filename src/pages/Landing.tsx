import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import {
  ArrowRight, Check, Coffee, Gift, CalendarCheck, Users, QrCode, BarChart3, Star, Sparkles,
} from "lucide-react";
import heroImage from "@/assets/hero-cafe.jpg";
import { useEffect } from "react";

const features = [
  { icon: Gift, title: "Loyalty Rewards", desc: "Points, stamps and birthday perks that bring guests back twice as often." },
  { icon: CalendarCheck, title: "Smart Bookings", desc: "Take reservations 24/7 with automated reminders and waitlist." },
  { icon: Users, title: "Customer CRM", desc: "Know every regular — their favorite drink, last visit and lifetime value." },
  { icon: QrCode, title: "QR Ordering", desc: "Contactless menu and order-at-table that lifts ticket size by 18%." },
  { icon: BarChart3, title: "Live Insights", desc: "Daily revenue, repeat rate and peak hours in one elegant dashboard." },
  { icon: Sparkles, title: "Auto Marketing", desc: "Win-back SMS and email campaigns that run while you pull shots." },
];

const pricing = [
  { name: "Starter", price: "₹999", period: "/mo", desc: "For new cafes finding their regulars.", features: ["Up to 500 customers", "Loyalty rewards", "Basic bookings", "Email support"], cta: "Start Free Trial", featured: false },
  { name: "Growth",  price: "₹2,499", period: "/mo", desc: "Most popular for busy neighborhood spots.", features: ["Unlimited customers", "QR ordering", "SMS marketing", "Advanced analytics", "Priority support"], cta: "Start Free Trial", featured: true },
  { name: "Roastery", price: "₹4,999", period: "/mo", desc: "For multi-location cafes & roasters.", features: ["Up to 5 locations", "Custom branding", "API access", "Dedicated manager"], cta: "Book Demo", featured: false },
];

const testimonials = [
  { quote: "Repeat visits jumped 38% in two months. Our regulars feel seen — that's the magic.", name: "Sofia Alvarez", role: "Owner, Aurora Coffee" },
  { quote: "Bookings used to be chaos. Now Sundays run themselves and the team actually enjoys service.", name: "Daniel Park", role: "GM, North Brew House" },
  { quote: "The loyalty program paid for CafeBoost in the first week. Honestly a no-brainer.", name: "Priya Shah", role: "Founder, Kindling Café" },
];

export default function Landing() {
  useEffect(() => {
    document.title = "CafeBoost — Increase Repeat Customers for Your Cafe";
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Logo />
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-smooth">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-smooth">Pricing</a>
            <a href="#testimonials" className="hover:text-foreground transition-smooth">Customers</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/for-cafes/auth"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Link to="/for-cafes/auth"><Button variant="hero" size="sm">Start Free</Button></Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-hero">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center py-16 md:py-24">
          <div className="animate-fade-in">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-soft text-accent-foreground text-xs font-semibold mb-6">
              <Sparkles className="w-3.5 h-3.5" /> Built for independent cafes
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.05]">
              Increase Repeat Customers <br className="hidden sm:block" />
              for Your Cafe <span className="inline-block">☕</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
              Loyalty rewards, bookings, customer CRM and QR ordering in one platform. The all-in-one growth toolkit your café deserves.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/for-cafes/auth"><Button variant="hero" size="xl" className="group">
                Start Free Trial <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-smooth" />
              </Button></Link>
            </div>
            <div className="mt-8 flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="flex">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-accent text-accent" />)}
                </div>
                <span className="font-semibold text-foreground">4.9</span> from 1,200+ cafes
              </div>
            </div>
          </div>
          <div className="relative animate-fade-in" style={{ animationDelay: "120ms" }}>
            <div className="relative rounded-3xl overflow-hidden shadow-elegant">
              <img src={heroImage} alt="Cozy cafe interior" className="w-full h-auto" loading="eager" />
            </div>
            <Card className="absolute -bottom-6 -left-4 sm:-left-8 p-4 shadow-elegant bg-card/95 backdrop-blur w-56 animate-float">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-success/15 flex items-center justify-center">
                  <Gift className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Today's rewards</p>
                  <p className="font-display font-bold text-lg">+47 redeemed</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-sm font-semibold text-accent uppercase tracking-wider">Everything in one place</p>
          <h2 className="mt-3 font-display text-3xl md:text-5xl font-bold">Run a café customers love coming back to</h2>
        </div>
        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <Card key={f.title} className="p-7 bg-gradient-card border-border/60 hover:shadow-elegant hover:-translate-y-1 transition-smooth">
              <div className="w-12 h-12 rounded-2xl bg-accent-soft flex items-center justify-center mb-5">
                <f.icon className="w-6 h-6 text-accent" />
              </div>
              <h3 className="font-display text-xl font-bold">{f.title}</h3>
              <p className="mt-2 text-muted-foreground leading-relaxed">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      <section id="pricing" className="bg-secondary/40 py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-sm font-semibold text-accent uppercase tracking-wider">Pricing</p>
            <h2 className="mt-3 font-display text-3xl md:text-5xl font-bold">Simple plans that grow with your café</h2>
          </div>
          <div className="mt-14 grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {pricing.map((p) => (
              <Card key={p.name} className={`p-8 relative transition-smooth ${p.featured ? "border-accent border-2 shadow-elegant scale-[1.02]" : "hover:shadow-soft"}`}>
                {p.featured && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-accent text-accent-foreground text-xs font-bold">Most popular</div>}
                <h3 className="font-display text-2xl font-bold">{p.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{p.desc}</p>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="font-display text-5xl font-bold">{p.price}</span>
                  <span className="text-muted-foreground">{p.period}</span>
                </div>
                <Link to="/for-cafes/auth" className="block mt-6">
                  <Button variant={p.featured ? "hero" : "outline"} className="w-full">{p.cta}</Button>
                </Link>
                <ul className="mt-6 space-y-3">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-success mt-0.5 shrink-0" /> {feat}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="testimonials" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
        <div className="max-w-2xl mx-auto text-center mb-14">
          <p className="text-sm font-semibold text-accent uppercase tracking-wider">Customers</p>
          <h2 className="mt-3 font-display text-3xl md:text-5xl font-bold">Loved by cafe owners</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <Card key={t.name} className="p-7 bg-gradient-card">
              <div className="flex mb-3">{[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-accent text-accent" />)}</div>
              <p className="text-foreground leading-relaxed italic">"{t.quote}"</p>
              <div className="mt-5 pt-4 border-t border-border">
                <p className="font-semibold text-sm">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-gradient-accent py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-4 text-center text-accent-foreground">
          <Coffee className="w-10 h-10 mx-auto mb-4 opacity-80" />
          <h2 className="font-display text-3xl md:text-4xl font-bold">Ready to grow your cafe?</h2>
          <p className="mt-3 text-lg opacity-80">Join 1,200+ cafes using CafeBoost to increase repeat customers.</p>
          <Link to="/for-cafes/auth">
            <Button variant="outline" size="xl" className="mt-8 bg-background/20 border-background/40 hover:bg-background/30">
              Start Free Trial <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            <div className="col-span-2">
              <Logo />
              <p className="text-sm text-muted-foreground mt-3 max-w-xs leading-relaxed">
                The all-in-one growth platform built for independent cafes and roasters.
              </p>
              <Link to="/for-cafes/auth" className="inline-block mt-5">
                <Button variant="hero" size="sm">Start free trial <ArrowRight className="w-3.5 h-3.5 ml-1" /></Button>
              </Link>
            </div>
            <div>
              <h4 className="font-display text-sm font-bold mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-smooth">Features</a></li>
                <li><a href="#pricing" className="hover:text-foreground transition-smooth">Pricing</a></li>
                <li><Link to="/discover" className="hover:text-foreground transition-smooth">Discover cafes</Link></li>
                <li><Link to="/for-cafes/auth" className="hover:text-foreground transition-smooth">Sign in</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-display text-sm font-bold mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#testimonials" className="hover:text-foreground transition-smooth">Customers</a></li>
                <li><a href="mailto:hello@cafeboost.app" className="hover:text-foreground transition-smooth">Contact</a></li>
                <li><a href="#" className="hover:text-foreground transition-smooth">About</a></li>
                <li><a href="#" className="hover:text-foreground transition-smooth">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-display text-sm font-bold mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-smooth">Privacy</a></li>
                <li><a href="#" className="hover:text-foreground transition-smooth">Terms</a></li>
                <li><a href="#" className="hover:text-foreground transition-smooth">Security</a></li>
                <li><a href="#" className="hover:text-foreground transition-smooth">Cookies</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">© 2026 CafeBoost. Brewed with care.</p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>hello@cafeboost.app</span>
              <span className="hidden sm:inline">·</span>
              <span>Made for independent cafes</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
