import { Link } from "wouter";
import { useState, useEffect } from "react";
import { Trophy, Zap, Shield, Globe, ArrowRight, Star, Users, Award, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export default function Landing() {
  const [stats, setStats] = useState<any>(null);
  const [livePool, setLivePool] = useState<string | null>(null);

  useEffect(() => {
    // Fetch live data without auth
    fetch("/api/admin/stats", { headers: { Authorization: "Bearer " + localStorage.getItem("viona_token") } })
      .then(r => r.ok ? r.json() : null).then(s => s && setStats(s)).catch(() => {});
    fetch("/api/draws/today/1")
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setLivePool(d.totalPool)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="viona-nav fixed top-0 left-0 right-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Trophy className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">VIONA</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
              Sign In
            </Button>
          </Link>
          <Link href="/register">
            <Button className="btn-viona-primary px-6">Get Started</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 text-center relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/8 blur-[120px]" />
        </div>

        <div className="relative max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2 mb-8 text-sm text-primary">
            <Star className="w-3.5 h-3.5 fill-current" />
            Daily draws in your local currency
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-6 leading-tight">
            Win every day.
            <br />
            <span className="text-gradient-prize">Your country's prize.</span>
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            VIONA runs a daily draw in your country, in your currency.
            Enter for free or pay the small daily fee — the prize pool is always 50% of what's collected.
            No house tricks, always provably fair.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="btn-viona-primary px-8 h-14 text-base w-full sm:w-auto">
                Join the next draw
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            <Link href="/register">
              <Button size="lg" variant="outline" className="btn-viona-outline px-8 h-14 text-base w-full sm:w-auto">
                Try for free
              </Button>
            </Link>
          </div>

          <p className="text-sm text-muted-foreground mt-4">
            Always a free entry available. 18+ only. Play responsibly.
          </p>
        </div>
      </section>

      {/* Live stats */}
      <section className="py-12 px-6 border-y border-border">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-8 text-center">
          {[
            { label: "Registered users", value: stats?.totalUsers ? `${stats.totalUsers}+` : "5+", icon: Users },
            {
              label: "Today's pool (UA)",
              value: livePool ? `₴${parseFloat(livePool).toFixed(0)}` : "—",
              icon: Trophy
            },
            { label: "Provably Fair", value: "100%", icon: Shield },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <Icon className="w-5 h-5 text-primary" />
              <div className="text-3xl font-black text-gradient-prize">{value}</div>
              <div className="text-sm text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-black text-center mb-2 tracking-tight">How VIONA works</h2>
          <p className="text-muted-foreground text-center mb-12">Simple, transparent, fair</p>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                step: "01", icon: Users, title: "Join the draw",
                desc: "Register, pick your country, and enter today's draw — paid or free. Free entry is always available."
              },
              {
                step: "02", icon: Zap, title: "Pool grows",
                desc: "Every paid entry adds to the day's prize pool. 50% goes to the winner, rest funds the platform."
              },
              {
                step: "03", icon: Award, title: "Winner picked",
                desc: "At draw time, a provably fair RNG picks the winner. The prize appears on their balance instantly."
              },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="viona-card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-4xl font-black text-primary/20">{step}</span>
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                </div>
                <h3 className="font-bold text-lg mb-2">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Countries */}
      <section className="py-16 px-6 bg-card/50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-black mb-2 tracking-tight">Available markets</h2>
          <p className="text-muted-foreground mb-10">Local currency, local prize</p>

          <div className="flex flex-wrap justify-center gap-4">
            {[
              { flag: "🇺🇦", name: "Ukraine", amount: "₴5/day" },
              { flag: "🇺🇸", name: "United States", amount: "$2/day" },
              { flag: "🇵🇭", name: "Philippines", amount: "₱8/day" },
              { flag: "🇮🇳", name: "India", amount: "₹10/day" },
              { flag: "🇧🇷", name: "Brazil", amount: "R$2/day" },
            ].map(({ flag, name, amount }) => (
              <div key={name} className="viona-card px-5 py-3 flex items-center gap-3">
                <span className="text-2xl">{flag}</span>
                <div className="text-left">
                  <div className="font-semibold text-sm">{name}</div>
                  <div className="text-xs text-muted-foreground">{amount}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 text-center">
        <div className="max-w-2xl mx-auto viona-card-glow p-12">
          <Trophy className="w-12 h-12 text-primary mx-auto mb-4" />
          <h2 className="text-3xl font-black mb-3 tracking-tight">Ready to play?</h2>
          <p className="text-muted-foreground mb-8">
            Create your account in under a minute. First entry is always free.
          </p>
          <Link href="/register">
            <Button size="lg" className="btn-viona-primary px-10 h-14 text-base">
              Start for free
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border text-center text-sm text-muted-foreground">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" />
            <span className="font-bold text-foreground">VIONA</span>
          </div>
          <div className="flex gap-6 text-xs">
            <a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-foreground transition-colors">Responsible Gaming</a>
          </div>
          <p className="text-xs">© 2025 VIONA. 18+ only. Play responsibly.</p>
        </div>
      </footer>
    </div>
  );
}
