import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  Trophy, Wallet, Bell, User, LogOut, ChevronRight, Zap, Clock,
  Gift, ToggleLeft, ToggleRight, History, Star, Users, Store, CreditCard
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useRealtime } from "@/hooks/use-realtime";
import { api } from "@/lib/api";

// ── Countdown timer ────────────────────────────────────────────────────────────

function useCountdown(targetHourUtc: number) {
  const getSecondsLeft = useCallback(() => {
    const now = new Date();
    const target = new Date();
    target.setUTCHours(targetHourUtc, 0, 0, 0);
    if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
    return Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
  }, [targetHourUtc]);

  const [secs, setSecs] = useState(getSecondsLeft);

  useEffect(() => {
    const id = setInterval(() => setSecs(getSecondsLeft()), 1000);
    return () => clearInterval(id);
  }, [getSecondsLeft]);

  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return { h, m, s };
}

// ── Format currency ────────────────────────────────────────────────────────────

function fmt(amount: string | number, symbol: string) {
  return `${symbol}${parseFloat(String(amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

// ── Nav ────────────────────────────────────────────────────────────────────────

function DashNav({ onLogout, unreadCount }: { onLogout: () => void; unreadCount: number }) {
  return (
    <nav className="viona-nav fixed top-0 left-0 right-0 z-50 px-4 md:px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Trophy className="w-4 h-4 text-white" />
        </div>
        <span className="text-xl font-bold tracking-tight">VIONA</span>
      </div>
      <div className="flex items-center gap-1">
        <Link href="/notifications">
          <Button variant="ghost" size="icon" className="text-muted-foreground relative">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        </Link>
        <Link href="/cabinet">
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <User className="w-5 h-5" />
          </Button>
        </Link>
        <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={onLogout}>
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </nav>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const [country, setCountry] = useState<any>(null);
  const [draw, setDraw] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [myEntry, setMyEntry] = useState<any>(null);
  const [gamification, setGamification] = useState<any>(null);
  const [autoParticipate, setAutoParticipate] = useState(user?.autoParticipate ?? true);
  const [loading, setLoading] = useState(true);
  const [entering, setEntering] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Free entry modal state
  const [freeModal, setFreeModal] = useState(false);
  const [freeName, setFreeName] = useState("");
  const [freeEmail, setFreeEmail] = useState("");
  const [freeLoading, setFreeLoading] = useState(false);

  const countryId = user?.countryId ?? 1;
  const timer = useCountdown(country?.drawHourUtc ?? 21);

  // Real-time updates from WebSocket
  useRealtime(useCallback((msg) => {
    if (msg.type === "draw_pool_update" && draw && msg.drawId === draw.id) {
      setDraw((d: any) => d ? { ...d, totalPool: msg.totalPool, totalEntries: msg.totalEntries } : d);
    }
    if (msg.type === "draw_completed" && msg.countryId === countryId) {
      loadData(); // Reload after draw completes
    }
  }, [draw, countryId]));

  const loadData = useCallback(async () => {
    try {
      const [c, w, g, notifs] = await Promise.all([
        api.countries.get(countryId),
        api.wallet.get(),
        api.gamification.me(),
        api.notifications.list(),
      ]);
      setCountry(c);
      setWallet(w);
      setGamification(g);
      setUnreadCount(notifs.filter((n: any) => !n.isRead).length);
      const d = await api.draws.today(countryId);
      setDraw(d);
      if (d) {
        const e = await api.draws.myEntry(d.id);
        setMyEntry(e);
      }
    } catch (err: any) {
      toast({ title: "Failed to load dashboard", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [countryId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handlePaidEntry = async () => {
    if (!draw) return;
    setEntering(true);
    try {
      const result = await api.draws.enter(draw.id);
      toast({ title: "You're in! 🎉", description: `Ticket #${result.ticketNumber}` });
      await loadData();
    } catch (err: any) {
      toast({ title: "Could not enter", description: err.message, variant: "destructive" });
    } finally {
      setEntering(false);
    }
  };

  const handleFreeEntry = async () => {
    if (!draw || !freeName || !freeEmail) return;
    setFreeLoading(true);
    try {
      const result = await api.draws.enterFree(draw.id, {
        firstName: freeName.split(" ")[0],
        lastName: freeName.split(" ")[1] || "",
        email: freeEmail,
        countryId,
      });
      toast({ title: "Free entry submitted! 🎉", description: `Ticket #${result.ticketNumber}` });
      setFreeModal(false);
      await loadData();
    } catch (err: any) {
      toast({ title: "Could not enter", description: err.message, variant: "destructive" });
    } finally {
      setFreeLoading(false);
    }
  };

  const toggleAuto = async () => {
    const next = !autoParticipate;
    setAutoParticipate(next);
    try {
      await api.profile.setAutoParticipate(next);
    } catch (err: any) {
      setAutoParticipate(!next);
      toast({ title: "Failed to update preference", description: err.message, variant: "destructive" });
    }
  };

  const handleLogout = () => { logout(); navigate("/"); };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const balance = parseFloat(wallet?.balance ?? "0");
  const pool = parseFloat(draw?.totalPool ?? "0");
  const prizePool = pool * (parseFloat(country?.prizePercentage ?? "50") / 100);
  const symbol = country?.currencySymbol ?? "₴";
  const entryAmt = parseFloat(country?.entryAmountDaily ?? "5");
  const canAfford = balance >= entryAmt;

  return (
    <div className="min-h-screen bg-background">
      <DashNav onLogout={handleLogout} unreadCount={unreadCount} />

      <div className="pt-20 pb-24 px-4 md:px-6 max-w-2xl mx-auto space-y-4">

        {/* Prize Pool Hero */}
        <div className="viona-card-glow p-6 text-center animate-fade-in">
          <p className="text-sm text-muted-foreground mb-1">Today's prize pool</p>
          <div className="text-6xl font-black text-gradient-prize mb-1 animate-counter">
            {fmt(prizePool, symbol)}
          </div>
          <p className="text-xs text-muted-foreground">
            {country?.prizePercentage ?? "50"}% of {fmt(pool, symbol)} collected today · {draw?.totalEntries ?? 0} entries
          </p>

          {/* Countdown */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground mr-2">Draw in</span>
            {[
              { label: "h", val: String(timer.h).padStart(2, "0") },
              { label: "m", val: String(timer.m).padStart(2, "0") },
              { label: "s", val: String(timer.s).padStart(2, "0") },
            ].map(({ label, val }) => (
              <span key={label} className="timer-digit text-xl font-black">
                {val}<span className="text-xs text-muted-foreground ml-0.5">{label}</span>
              </span>
            ))}
          </div>
        </div>

        {/* My Status */}
        {myEntry ? (
          <div className="viona-card p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center shrink-0">
              <Star className="w-6 h-6 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold">You're in today's draw!</p>
              <p className="text-sm text-muted-foreground">
                Ticket #{myEntry.ticketNumber} · {myEntry.type === "paid" ? "Paid entry" : "Free entry"}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Paid entry */}
            <Button
              className="btn-viona-primary w-full h-14 text-base animate-glow"
              onClick={handlePaidEntry}
              disabled={entering || !canAfford || draw?.status !== "open"}
            >
              {entering ? (
                <span className="flex items-center gap-2"><div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />Entering…</span>
              ) : !canAfford ? (
                <>
                  <Zap className="mr-2 w-5 h-5" />
                  Top up to enter ({fmt(entryAmt, symbol)})
                </>
              ) : (
                <>
                  <Zap className="mr-2 w-5 h-5" />
                  Enter draw — {fmt(entryAmt, symbol)}
                </>
              )}
            </Button>

            {/* Free entry */}
            <Button
              variant="outline"
              className="btn-viona-outline w-full h-12"
              onClick={() => setFreeModal(true)}
            >
              <Gift className="mr-2 w-4 h-4" />
              Free entry (no payment needed)
            </Button>
          </div>
        )}

        {/* Balance card */}
        <div className="viona-card p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground font-medium">My Balance</p>
            <div className="flex items-center gap-2">
              {gamification && (
                <Link href="/cabinet">
                  <span
                    className="px-2.5 py-1 rounded-full text-xs font-bold cursor-pointer"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)", color: "#fff" }}
                  >
                    Lv.{gamification.level} {gamification.title}
                  </span>
                </Link>
              )}
              <Link href="/wallet">
                <Button variant="ghost" size="sm" className="text-primary h-7 px-2 text-xs">
                  Manage <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                </Button>
              </Link>
            </div>
          </div>
          <div className="text-4xl font-black mb-3">{fmt(balance, symbol)}</div>
          <Link href="/wallet">
            <Button className="btn-viona-primary w-full h-10 text-sm">
              Top up balance
            </Button>
          </Link>
        </div>

        {/* Auto-participate toggle */}
        <div className="viona-card p-5 flex items-center gap-4">
          <div className="flex-1">
            <p className="font-semibold text-sm">Auto-participate</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              When enabled, you enter each daily draw automatically when your balance has funds.
            </p>
          </div>
          <button
            onClick={toggleAuto}
            className={`shrink-0 transition-colors ${autoParticipate ? "text-primary" : "text-muted-foreground"}`}
          >
            {autoParticipate
              ? <ToggleRight className="w-10 h-10" />
              : <ToggleLeft className="w-10 h-10" />
            }
          </button>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { href: "/cabinet",      icon: User,        label: "My Account" },
            { href: "/history",      icon: History,     label: "Draw History" },
            { href: "/wallet",       icon: Wallet,      label: "Wallet" },
            { href: "/subscription", icon: CreditCard,  label: "Subscription" },
            { href: "/partners",     icon: Store,       label: "Partners" },
            { href: "/referrals",    icon: Users,       label: "Refer a Friend" },
          ].map(({ href, icon: Icon, label }) => (
            <Link key={href} href={href}>
              <div className="viona-card p-4 flex items-center gap-3 cursor-pointer hover:border-primary/30 transition-colors">
                <Icon className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">{label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Free entry modal */}
      {freeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
          <div className="viona-card w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-1">Free entry</h3>
            <p className="text-sm text-muted-foreground mb-5">
              Fill in your details to get a free ticket in today's draw. No payment required.
            </p>
            <div className="space-y-3">
              <input
                className="w-full h-12 px-4 rounded-xl bg-secondary border border-border text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Full name"
                value={freeName}
                onChange={e => setFreeName(e.target.value)}
              />
              <input
                type="email"
                className="w-full h-12 px-4 rounded-xl bg-secondary border border-border text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Email address"
                value={freeEmail}
                onChange={e => setFreeEmail(e.target.value)}
              />
            </div>
            <div className="flex gap-3 mt-5">
              <Button variant="outline" className="flex-1 btn-viona-outline" onClick={() => setFreeModal(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 btn-viona-primary"
                onClick={handleFreeEntry}
                disabled={freeLoading || !freeName || !freeEmail}
              >
                {freeLoading ? "Submitting…" : "Get free ticket"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3 text-center">
              One free entry per person per draw. Paid entries help grow the prize pool.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
