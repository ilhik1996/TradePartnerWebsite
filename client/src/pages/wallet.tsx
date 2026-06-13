import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, ArrowDownLeft, ArrowUpRight, Trophy,
  Plus, Minus, TrendingUp, TrendingDown, Zap, Gift, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";

const TX_ICONS: Record<string, any> = {
  deposit: { icon: ArrowDownLeft, cls: "tx-deposit", sign: "+" },
  withdrawal: { icon: ArrowUpRight, cls: "tx-withdraw", sign: "-" },
  lottery_entry: { icon: Zap, cls: "tx-entry", sign: "-" },
  prize_payout: { icon: Trophy, cls: "tx-prize", sign: "+" },
  referral_bonus: { icon: Gift, cls: "tx-deposit", sign: "+" },
  admin_adjustment: { icon: TrendingUp, cls: "tx-deposit", sign: "" },
  refund: { icon: TrendingDown, cls: "tx-deposit", sign: "+" },
};

const TX_LABELS: Record<string, string> = {
  deposit: "Top up",
  withdrawal: "Withdrawal",
  lottery_entry: "Lottery entry",
  prize_payout: "Prize won",
  referral_bonus: "Referral bonus",
  admin_adjustment: "Adjustment",
  refund: "Refund",
};

function fmt(amount: string | number, symbol: string) {
  return `${symbol}${Math.abs(parseFloat(String(amount))).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export default function WalletPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [wallet, setWallet] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [country, setCountry] = useState<any>(null);
  const [depositAmt, setDepositAmt] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [loading, setLoading] = useState(true);
  const [depositing, setDepositing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");

  const countryId = user?.countryId ?? 1;

  useEffect(() => {
    Promise.all([
      api.wallet.get(),
      api.wallet.transactions(30),
      api.countries.get(countryId),
    ]).then(([w, txs, c]) => {
      setWallet(w);
      setTransactions(txs);
      setCountry(c);
    }).catch((err: any) => {
      toast({ title: "Failed to load wallet", description: err.message, variant: "destructive" });
    }).finally(() => setLoading(false));
  }, [countryId]);

  const handleDeposit = async () => {
    const amt = parseFloat(depositAmt);
    if (!amt || amt <= 0) return;
    setDepositing(true);
    try {
      const result = await api.wallet.deposit(amt, country?.currency ?? "UAH");
      toast({ title: "Balance topped up!", description: `${country?.currencySymbol}${amt.toFixed(2)} added` });
      setWallet((w: any) => ({ ...w, balance: (parseFloat(w.balance) + amt).toFixed(2) }));
      setDepositAmt("");
      const txs = await api.wallet.transactions(30);
      setTransactions(txs);
    } catch (err: any) {
      toast({ title: "Deposit failed", description: err.message, variant: "destructive" });
    } finally {
      setDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    const amt = parseFloat(withdrawAmt);
    if (!amt || amt <= 0) return;
    setWithdrawing(true);
    try {
      const result = await api.wallet.withdraw(amt);
      toast({ title: "Withdrawal requested", description: `${country?.currencySymbol}${amt.toFixed(2)} pending` });
      setWallet((w: any) => ({ ...w, balance: result.newBalance.toFixed(2) }));
      setWithdrawAmt("");
      const txs = await api.wallet.transactions(30);
      setTransactions(txs);
    } catch (err: any) {
      toast({ title: "Withdrawal failed", description: err.message, variant: "destructive" });
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const balance = parseFloat(wallet?.balance ?? "0");
  const symbol = country?.currencySymbol ?? "₴";
  const quickAmounts = [
    parseFloat(country?.entryAmountDaily ?? "5") * 7,
    parseFloat(country?.entryAmountDaily ?? "5") * 30,
    100,
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="viona-nav sticky top-0 z-50 px-4 py-4 flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="font-bold text-lg">Wallet</h1>
      </div>

      <div className="px-4 md:px-6 pb-24 max-w-2xl mx-auto pt-4 space-y-4">
        {/* Balance */}
        <div className="viona-card-glow p-6 text-center">
          <p className="text-sm text-muted-foreground mb-1">Available balance</p>
          <div className="text-5xl font-black text-gradient-prize">{fmt(balance, symbol)}</div>
          <p className="text-xs text-muted-foreground mt-2">{wallet?.currency ?? "UAH"}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {(["deposit", "withdraw"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 h-11 rounded-xl font-semibold text-sm transition-all ${
                tab === t
                  ? "btn-viona-primary text-white"
                  : "viona-card text-muted-foreground"
              }`}
            >
              {t === "deposit" ? <><Plus className="inline w-4 h-4 mr-1" />Top Up</> : <><Minus className="inline w-4 h-4 mr-1" />Withdraw</>}
            </button>
          ))}
        </div>

        {tab === "deposit" ? (
          <div className="viona-card p-5 space-y-4">
            <h3 className="font-semibold">Add funds</h3>
            {user?.kycLevel === "none" && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400/90">
                  Age verification required to deposit.{" "}
                  <a href="/cabinet" className="underline hover:text-amber-300">Verify now →</a>
                </p>
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {quickAmounts.map(a => (
                <button
                  key={a}
                  onClick={() => setDepositAmt(String(a))}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                    depositAmt === String(a)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {symbol}{a}
                </button>
              ))}
            </div>
            <input
              type="number"
              className="w-full h-12 px-4 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder={`Amount in ${country?.currency ?? "UAH"}`}
              value={depositAmt}
              onChange={e => setDepositAmt(e.target.value)}
            />
                    {/* Card input (mock UI — replace with Stripe Elements in prod) */}
            <div className="space-y-2 pt-1">
              <p className="text-xs text-muted-foreground font-medium">Payment details</p>
              <input
                className="w-full h-11 px-4 rounded-xl bg-secondary border border-border text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="4242 4242 4242 4242"
                maxLength={19}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 16);
                  e.target.value = v.replace(/(.{4})/g, "$1 ").trim();
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="h-11 px-4 rounded-xl bg-secondary border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="MM/YY"
                  maxLength={5}
                />
                <input
                  className="h-11 px-4 rounded-xl bg-secondary border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="CVV"
                  maxLength={4}
                  type="password"
                />
              </div>
            </div>

            <Button
              className="btn-viona-primary w-full h-12"
              onClick={handleDeposit}
              disabled={depositing || !depositAmt || user?.kycLevel === "none"}
            >
              {depositing ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Processing…
                </span>
              ) : (
                `Add ${depositAmt ? `${symbol}${depositAmt}` : "funds"}`
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Secured by 3DS · Demo mode (no real charges)
            </p>
          </div>
        ) : (
          <div className="viona-card p-5 space-y-4">
            <h3 className="font-semibold">Withdraw funds</h3>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-400/90">
                Withdrawal requires full KYC verification (ID + selfie). Funds are held for 3 business days.
              </p>
            </div>
            <input
              type="number"
              className="w-full h-12 px-4 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder={`Amount (max ${symbol}${balance.toFixed(2)})`}
              value={withdrawAmt}
              max={balance}
              onChange={e => setWithdrawAmt(e.target.value)}
            />
            <Button
              className="btn-viona-primary w-full h-12"
              onClick={handleWithdraw}
              disabled={withdrawing || !withdrawAmt || parseFloat(withdrawAmt) > balance}
            >
              {withdrawing ? "Requesting…" : "Request withdrawal"}
            </Button>
          </div>
        )}

        {/* Transactions */}
        <div>
          <h3 className="font-bold text-sm mb-3 text-muted-foreground uppercase tracking-wide px-1">
            Transaction history
          </h3>
          <div className="space-y-2">
            {transactions.length === 0 && (
              <div className="viona-card p-8 text-center text-muted-foreground text-sm">
                No transactions yet
              </div>
            )}
            {transactions.map(tx => {
              const meta = TX_ICONS[tx.type] ?? TX_ICONS.deposit;
              const Icon = meta.icon;
              const isPositive = parseFloat(tx.amount) > 0;
              return (
                <div key={tx.id} className="viona-card p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0 ${meta.cls}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{TX_LABELS[tx.type] ?? tx.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleDateString()} · Balance after: {symbol}{parseFloat(tx.balanceAfter).toFixed(2)}
                    </p>
                  </div>
                  <span className={`font-bold text-sm shrink-0 ${isPositive ? "tx-deposit" : "text-muted-foreground"}`}>
                    {isPositive ? "+" : ""}{symbol}{Math.abs(parseFloat(tx.amount)).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
