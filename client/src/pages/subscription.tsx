import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Zap, Calendar, RefreshCw, CheckCircle,
  AlertCircle, Trophy, Shield, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";

function PlanCard({
  type, title, amount, perDay, currency, symbol, savings, isActive, loading, onSelect
}: {
  type: "weekly" | "monthly";
  title: string;
  amount: number;
  perDay: number;
  currency: string;
  symbol: string;
  savings?: string;
  isActive: boolean;
  loading: boolean;
  onSelect: () => void;
}) {
  const isPurple = type === "weekly";
  return (
    <div className={`viona-card p-6 relative ${isActive ? "border-primary/50" : ""} ${isPurple ? "" : "border-accent/20"}`}>
      {savings && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-background text-xs font-bold px-3 py-1 rounded-full">
          {savings}
        </div>
      )}
      {isActive && (
        <div className="absolute -top-3 right-4 bg-primary text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
          <CheckCircle className="w-3 h-3" /> Active
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isPurple ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"}`}>
          {isPurple ? <Zap className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
        </div>
        <div>
          <p className="font-bold">{title}</p>
          <p className="text-xs text-muted-foreground">Billed {type === "weekly" ? "weekly" : "monthly"}</p>
        </div>
      </div>

      <div className="mb-4">
        <div className="text-4xl font-black text-gradient-prize mb-1">
          {symbol}{amount.toFixed(2)}
        </div>
        <p className="text-sm text-muted-foreground">
          ≈ {symbol}{perDay.toFixed(2)}/day · charged once
        </p>
      </div>

      <ul className="space-y-2 mb-5">
        {[
          "Auto-enter every daily draw",
          "Cancel anytime — 1 tap",
          "Lower effective fee than daily",
          type === "monthly" ? "Priority support" : "Referral bonus boosted",
        ].map(f => (
          <li key={f} className="flex items-center gap-2 text-sm">
            <CheckCircle className={`w-4 h-4 shrink-0 ${isPurple ? "text-primary" : "text-accent"}`} />
            {f}
          </li>
        ))}
      </ul>

      <Button
        className={`w-full h-11 font-semibold ${isActive ? "btn-viona-outline" : isPurple ? "btn-viona-primary" : ""}`}
        onClick={onSelect}
        disabled={loading}
        variant={isActive ? "outline" : undefined}
      >
        {loading ? (
          <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" />Processing…</span>
        ) : isActive ? (
          "Cancel subscription"
        ) : (
          `Subscribe — ${symbol}${amount.toFixed(2)}`
        )}
      </Button>
    </div>
  );
}

export default function Subscription() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [country, setCountry] = useState<any>(null);
  const [activeSub, setActiveSub] = useState<any>(null);
  const [subHistory, setSubHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"weekly" | "monthly" | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  const countryId = user?.countryId ?? 1;

  const load = async () => {
    const [c, sub, hist] = await Promise.all([
      api.countries.get(countryId),
      api.subscription.get(),
      api.subscription.history(),
    ]);
    setCountry(c);
    setActiveSub(sub);
    setSubHistory(hist);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const subscribe = async (type: "weekly" | "monthly") => {
    setSubmitting(type);
    try {
      await api.subscription.create(type);
      toast({ title: "Subscription active!", description: `You'll auto-enter every daily draw.` });
      await load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(null);
    }
  };

  const cancelSub = async () => {
    if (!activeSub) return;
    setSubmitting("weekly");
    try {
      await api.subscription.cancel(activeSub.id);
      toast({ title: "Subscription cancelled", description: "Access continues until the end of the paid period." });
      setCancelConfirm(false);
      await load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const weeklyAmt = parseFloat(country?.entryAmountWeekly ?? "35");
  const monthlyAmt = parseFloat(country?.entryAmountMonthly ?? "150");
  const dailyAmt = parseFloat(country?.entryAmountDaily ?? "5");
  const symbol = country?.currencySymbol ?? "₴";
  const monthSavings = Math.round((1 - monthlyAmt / (dailyAmt * 30)) * 100);

  return (
    <div className="min-h-screen bg-background">
      <div className="viona-nav sticky top-0 z-50 px-4 py-4 flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="font-bold text-lg">Subscription</h1>
      </div>

      <div className="px-4 md:px-6 pb-16 max-w-2xl mx-auto pt-4 space-y-4">
        {/* Hero */}
        <div className="text-center py-4">
          <h2 className="text-2xl font-black tracking-tight mb-2">Choose your plan</h2>
          <p className="text-sm text-muted-foreground">
            Subscribe once, enter every draw automatically. Cancel anytime — no lock-in.
          </p>
        </div>

        {/* Plans */}
        <div className="grid md:grid-cols-2 gap-4">
          <PlanCard
            type="weekly"
            title="Weekly"
            amount={weeklyAmt}
            perDay={weeklyAmt / 7}
            currency={country?.currency ?? "UAH"}
            symbol={symbol}
            isActive={activeSub?.type === "weekly"}
            loading={submitting === "weekly"}
            onSelect={() => activeSub?.type === "weekly" ? setCancelConfirm(true) : subscribe("weekly")}
          />
          <PlanCard
            type="monthly"
            title="Monthly"
            amount={monthlyAmt}
            perDay={monthlyAmt / 30}
            currency={country?.currency ?? "UAH"}
            symbol={symbol}
            savings={`Save ${monthSavings}%`}
            isActive={activeSub?.type === "monthly"}
            loading={submitting === "monthly"}
            onSelect={() => activeSub?.type === "monthly" ? setCancelConfirm(true) : subscribe("monthly")}
          />
        </div>

        {/* Or single entry note */}
        <div className="viona-card p-4 flex items-start gap-3">
          <Trophy className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">Prefer pay-as-you-go?</p>
            <p className="text-muted-foreground text-xs mt-0.5">
              You can also top up your balance and enter each draw manually. No subscription needed.
              Free entries are always available too.
            </p>
          </div>
        </div>

        {/* Legal note */}
        <div className="viona-card p-4 flex items-start gap-3">
          <Shield className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            By subscribing, you authorise VIONA to charge your payment method on a recurring {activeSub?.type ?? "weekly"} basis.
            You can cancel at any time — access continues until the end of the paid period.
            No refunds for unused days. See <a href="#" className="text-primary hover:underline">Terms of Service</a>.
          </p>
        </div>

        {/* Subscription history */}
        {subHistory.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wide px-1">History</h3>
            {subHistory.map(s => (
              <div key={s.id} className="viona-card p-4 flex items-center gap-3">
                <div className="flex-1">
                  <p className="font-medium text-sm capitalize">{s.type} subscription</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(s.startDate).toLocaleDateString()} →{" "}
                    {s.cancelledAt ? new Date(s.cancelledAt).toLocaleDateString() : "ongoing"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">{symbol}{parseFloat(s.amount).toFixed(2)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    s.status === "active" ? "bg-green-500/15 text-green-400"
                    : s.status === "cancelled" ? "bg-muted text-muted-foreground"
                    : "bg-amber-500/15 text-amber-400"
                  }`}>{s.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cancel confirm modal */}
      {cancelConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="viona-card w-full max-w-sm p-6">
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-bold text-lg">Cancel subscription?</h3>
              <button onClick={() => setCancelConfirm(false)} className="text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Your subscription will remain active until{" "}
              <strong className="text-foreground">
                {activeSub?.nextBillingDate ? new Date(activeSub.nextBillingDate).toLocaleDateString() : "end of period"}
              </strong>. After that, you won't be automatically entered in draws.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 btn-viona-outline" onClick={() => setCancelConfirm(false)}>Keep it</Button>
              <Button className="flex-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20" onClick={cancelSub}>
                Cancel subscription
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
