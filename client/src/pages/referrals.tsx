import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Copy, Users, Gift, CheckCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";

export default function Referrals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [applyCode, setApplyCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.referrals.my().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const copyCode = () => {
    navigator.clipboard.writeText(data?.referralCode ?? "");
    toast({ title: "Copied!", description: "Referral code copied to clipboard" });
  };

  const shareLink = () => {
    const url = `${window.location.origin}/register?ref=${data?.referralCode}`;
    if (navigator.share) {
      navigator.share({ title: "Join VIONA", text: "Daily prize draws in your currency!", url });
    } else {
      navigator.clipboard.writeText(url);
      toast({ title: "Link copied!" });
    }
  };

  const handleApply = async () => {
    if (!applyCode.trim()) return;
    setApplying(true);
    try {
      await api.referrals.apply(applyCode.trim());
      toast({ title: "Referral applied!", description: "Your referrer will get a bonus when you make your first payment." });
      setApplyCode("");
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="viona-nav sticky top-0 z-50 px-4 py-4 flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="font-bold text-lg">Refer a Friend</h1>
      </div>

      <div className="px-4 md:px-6 pb-16 max-w-2xl mx-auto pt-4 space-y-4">
        {/* Hero */}
        <div className="viona-card-glow p-6 text-center">
          <Gift className="w-10 h-10 text-primary mx-auto mb-3" />
          <h2 className="text-2xl font-black mb-2">Invite friends, earn bonuses</h2>
          <p className="text-sm text-muted-foreground">
            Share your code. When your friend makes their first paid entry, you both get a bonus — one free day's entry each.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="viona-card p-4 text-center">
            <p className="text-3xl font-black text-gradient-prize">{data?.referralCount ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Friends referred</p>
          </div>
          <div className="viona-card p-4 text-center">
            <p className="text-3xl font-black text-gradient-gold">{data?.totalBonusEarned ?? "0.00"}</p>
            <p className="text-xs text-muted-foreground mt-1">Total bonus earned</p>
          </div>
        </div>

        {/* Your code */}
        <div className="viona-card p-5 space-y-3">
          <h3 className="font-semibold text-sm">Your referral code</h3>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-secondary rounded-xl px-4 py-3 font-mono text-xl font-black tracking-widest text-center text-primary">
              {data?.referralCode ?? "—"}
            </div>
            <button onClick={copyCode} className="viona-card p-3 text-primary hover:border-primary/40 transition-colors">
              <Copy className="w-5 h-5" />
            </button>
          </div>
          <Button className="btn-viona-primary w-full h-11 text-sm" onClick={shareLink}>
            <Share2 className="mr-2 w-4 h-4" /> Share invite link
          </Button>
        </div>

        {/* Apply a code */}
        {!user?.referredBy && (
          <div className="viona-card p-5 space-y-3">
            <h3 className="font-semibold text-sm">Have a code from a friend?</h3>
            <div className="flex gap-2">
              <input
                className="flex-1 h-11 px-4 rounded-xl bg-secondary border border-border text-sm font-mono tracking-wider uppercase focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="XXXXXXXX"
                value={applyCode}
                onChange={e => setApplyCode(e.target.value.toUpperCase())}
                maxLength={12}
              />
              <Button
                className="btn-viona-primary h-11 px-5 text-sm shrink-0"
                onClick={handleApply}
                disabled={applying || !applyCode.trim()}
              >
                {applying ? "…" : "Apply"}
              </Button>
            </div>
          </div>
        )}
        {user?.referredBy && (
          <div className="viona-card p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
            <p className="text-sm">You were referred by a friend. Bonus will be paid on your first paid entry.</p>
          </div>
        )}

        {/* Referred friends list */}
        {data?.referrals?.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wide px-1">
              Your referrals
            </h3>
            {data.referrals.map((r: any) => (
              <div key={r.id} className="viona-card p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Friend #{r.refereeId}</p>
                  <p className="text-xs text-muted-foreground">
                    Joined {new Date(r.joinedAt).toLocaleDateString()} · Bonus: {r.bonusAmount} {r.currency}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  r.status === "paid" ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"
                }`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
