import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft, User, Trophy, Shield, Bell, LogOut,
  ChevronRight, AlertTriangle, CheckCircle, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";

function StatusBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    none: "bg-muted text-muted-foreground",
    age_verified: "bg-amber-500/15 text-amber-400",
    full: "bg-green-500/15 text-green-400",
  };
  const labels: Record<string, string> = {
    none: "Not verified",
    age_verified: "Age verified",
    full: "Fully verified",
  };
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${colors[level] ?? colors.none}`}>
      {labels[level] ?? level}
    </span>
  );
}

export default function Cabinet() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const [profile, setProfile] = useState<any>(null);
  const [rgSettings, setRgSettings] = useState<any>(null);
  const [draws, setDraws] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<"account" | "draws" | "responsible">("account");

  // Edit fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);

  // Self-exclusion
  const [exDays, setExDays] = useState(30);
  const [excluding, setExcluding] = useState(false);

  useEffect(() => {
    Promise.all([
      api.profile.get(),
      api.profile.getResponsibleGaming(),
      api.draws.history(user?.countryId ?? 1),
    ]).then(([p, rg, d]) => {
      setProfile(p);
      setRgSettings(rg);
      setDraws(d);
      setFirstName(p?.firstName ?? "");
      setLastName(p?.lastName ?? "");
    }).finally(() => setLoading(false));
  }, [user]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await api.profile.update({ firstName, lastName });
      toast({ title: "Profile updated" });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSelfExclude = async () => {
    setExcluding(true);
    try {
      await api.profile.selfExclude(exDays);
      toast({ title: "Self-exclusion active", description: `Account paused for ${exDays} days` });
      logout();
      navigate("/");
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setExcluding(false);
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
      {/* Header */}
      <div className="viona-nav sticky top-0 z-50 px-4 py-4 flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="font-bold text-lg">My Account</h1>
      </div>

      <div className="px-4 md:px-6 pb-24 max-w-2xl mx-auto pt-4 space-y-4">
        {/* Profile card */}
        <div className="viona-card p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <User className="w-7 h-7 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-lg truncate">
              {firstName || lastName ? `${firstName} ${lastName}`.trim() : "Anonymous"}
            </p>
            <p className="text-sm text-muted-foreground truncate">{user?.email ?? user?.phone}</p>
            <div className="mt-1">
              <StatusBadge level={user?.kycLevel ?? "none"} />
            </div>
          </div>
        </div>

        {/* Section tabs */}
        <div className="flex gap-2">
          {(["account", "draws", "responsible"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                section === s ? "btn-viona-primary text-white" : "viona-card text-muted-foreground"
              }`}
            >
              {s === "account" ? "Account" : s === "draws" ? "Draws" : "Safety"}
            </button>
          ))}
        </div>

        {/* Account section */}
        {section === "account" && (
          <div className="space-y-3">
            <div className="viona-card p-5 space-y-4">
              <h3 className="font-semibold text-sm">Personal info</h3>
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="h-11 px-4 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="First name"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                />
                <input
                  className="h-11 px-4 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Last name"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                />
              </div>
              <Button
                className="btn-viona-primary w-full h-10 text-sm"
                onClick={handleSaveProfile}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>

            <div className="viona-card p-5">
              <h3 className="font-semibold text-sm mb-3">KYC Verification</h3>
              <div className="space-y-3">
                {[
                  { label: "Level 1 — Account created", done: true },
                  { label: "Level 2 — Age 18+ verified", done: user?.kycLevel !== "none" },
                  { label: "Level 3 — Full KYC (required for withdrawals)", done: user?.kycLevel === "full" },
                ].map(({ label, done }) => (
                  <div key={label} className="flex items-center gap-3">
                    {done
                      ? <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                      : <Clock className="w-5 h-5 text-muted-foreground shrink-0" />
                    }
                    <span className={`text-sm ${done ? "" : "text-muted-foreground"}`}>{label}</span>
                  </div>
                ))}
              </div>
              {user?.kycLevel !== "full" && (
                <Button variant="outline" className="btn-viona-outline w-full h-10 text-sm mt-4">
                  Start verification
                </Button>
              )}
            </div>

            <button
              onClick={() => { logout(); navigate("/"); }}
              className="viona-card w-full p-4 flex items-center gap-3 text-red-400 hover:border-red-500/30 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium text-sm">Sign out</span>
            </button>
          </div>
        )}

        {/* Draws section */}
        {section === "draws" && (
          <div className="space-y-2">
            {draws.length === 0 && (
              <div className="viona-card p-8 text-center text-muted-foreground text-sm">
                No completed draws yet in your market.
              </div>
            )}
            {draws.map(draw => (
              <div key={draw.id} className="viona-card p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{draw.drawDate}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    draw.status === "completed" ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"
                  }`}>
                    {draw.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Pool: {draw.totalPool}</span>
                  <span>Prize: {draw.prizeAmount ?? "—"}</span>
                  <span>{draw.totalEntries} entries</span>
                </div>
                {draw.winnerUserId === user?.id && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
                    <Trophy className="w-3.5 h-3.5" /> You won this draw!
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Responsible gaming */}
        {section === "responsible" && (
          <div className="space-y-4">
            <div className="viona-card p-5 space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> Spending Limits
              </h3>
              <p className="text-xs text-muted-foreground">
                Set daily, weekly, or monthly spending limits. Once set, they take effect immediately.
              </p>
              {["daily", "weekly", "monthly"].map(period => (
                <div key={period} className="flex items-center gap-3">
                  <span className="text-sm capitalize w-16 shrink-0">{period}</span>
                  <input
                    type="number"
                    className="flex-1 h-10 px-4 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="No limit"
                    defaultValue={rgSettings?.[`${period}LimitAmount`] ?? ""}
                  />
                </div>
              ))}
              <Button className="btn-viona-primary w-full h-10 text-sm">Save limits</Button>
            </div>

            <div className="viona-card p-5 space-y-4 border-red-500/20">
              <h3 className="font-semibold text-sm flex items-center gap-2 text-red-400">
                <AlertTriangle className="w-4 h-4" /> Self-Exclusion
              </h3>
              <p className="text-xs text-muted-foreground">
                Temporarily exclude yourself from all draws. This cannot be undone for the chosen period.
              </p>
              <select
                className="w-full h-11 px-4 rounded-xl bg-secondary border border-border text-sm focus:outline-none"
                value={exDays}
                onChange={e => setExDays(parseInt(e.target.value))}
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>1 year</option>
              </select>
              <Button
                variant="outline"
                className="w-full h-10 text-sm border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={handleSelfExclude}
                disabled={excluding}
              >
                {excluding ? "Processing…" : `Exclude for ${exDays} days`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
