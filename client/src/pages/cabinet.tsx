import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft, User, Trophy, Shield, Bell, LogOut,
  ChevronRight, AlertTriangle, CheckCircle, Clock, BellRing, Star
} from "lucide-react";
import { usePush } from "@/hooks/use-push";
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
  const { user, logout, refresh: refreshUser } = useAuth();
  const { toast } = useToast();

  const [profile, setProfile] = useState<any>(null);
  const [rgSettings, setRgSettings] = useState<any>(null);
  const [draws, setDraws] = useState<any[]>([]);
  const [gamification, setGamification] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<"account" | "draws" | "responsible" | "level">("account");

  // Edit fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);

  // Self-exclusion
  const [exDays, setExDays] = useState(30);
  const [excluding, setExcluding] = useState(false);

  // Spending limits
  const [limitDaily, setLimitDaily] = useState("");
  const [limitWeekly, setLimitWeekly] = useState("");
  const [limitMonthly, setLimitMonthly] = useState("");
  const [savingLimits, setSavingLimits] = useState(false);

  // KYC modal
  const [kycModal, setKycModal] = useState<null | "age" | "full">(null);
  const [kycDob, setKycDob] = useState("");
  const [kycDocType, setKycDocType] = useState("passport");
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const { supported: pushSupported, permission: pushPerm, subscribe: pushSubscribe } = usePush();

  useEffect(() => {
    Promise.all([
      api.profile.get(),
      api.profile.getResponsibleGaming(),
      api.draws.history(user?.countryId ?? 1),
      api.gamification.me(),
    ]).then(([p, rg, d, g]) => {
      setProfile(p);
      setRgSettings(rg);
      setDraws(d);
      setGamification(g);
      setFirstName(p?.firstName ?? "");
      setLastName(p?.lastName ?? "");
      setLimitDaily(rg?.dailyLimitAmount ?? "");
      setLimitWeekly(rg?.weeklyLimitAmount ?? "");
      setLimitMonthly(rg?.monthlyLimitAmount ?? "");
    }).catch((err: any) => {
      toast({ title: "Failed to load profile", description: err.message, variant: "destructive" });
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

  const handleSaveLimits = async () => {
    setSavingLimits(true);
    try {
      await api.profile.setResponsibleGaming({
        dailyLimitAmount: limitDaily ? parseFloat(limitDaily) : null,
        weeklyLimitAmount: limitWeekly ? parseFloat(limitWeekly) : null,
        monthlyLimitAmount: limitMonthly ? parseFloat(limitMonthly) : null,
      });
      toast({ title: "Limits saved" });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setSavingLimits(false);
    }
  };

  const handleStartKyc = async () => {
    const level = kycModal!;
    if (level === "age" && !kycDob) return;
    setKycSubmitting(true);
    try {
      const result = await api.kyc.start({
        level,
        dateOfBirth: level === "age" ? kycDob : undefined,
        documentType: level === "full" ? kycDocType : undefined,
      });
      setKycModal(null);
      if (result.pending) {
        toast({ title: "Documents submitted", description: "Review takes 1-3 business days." });
      } else {
        toast({ title: "Age verified ✓", description: "You can now make deposits." });
        await refreshUser();
      }
    } catch (err: any) {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    } finally {
      setKycSubmitting(false);
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
          {(["account", "draws", "level", "responsible"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                section === s ? "btn-viona-primary text-white" : "viona-card text-muted-foreground"
              }`}
            >
              {s === "account" ? "Account" : s === "draws" ? "Draws" : s === "level" ? "Level" : "Safety"}
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
              <div className="mt-4 space-y-2">
                {user?.kycLevel === "none" && (
                  <Button
                    variant="outline"
                    className="btn-viona-outline w-full h-10 text-sm"
                    onClick={() => setKycModal("age")}
                  >
                    Verify age (18+)
                  </Button>
                )}
                {user?.kycLevel === "age_verified" && (
                  <Button
                    variant="outline"
                    className="btn-viona-outline w-full h-10 text-sm"
                    onClick={() => setKycModal("full")}
                  >
                    Complete full KYC
                  </Button>
                )}
              </div>
            </div>

            {/* Push notifications */}
            {pushSupported && (
              <div className="viona-card p-5 space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <BellRing className="w-4 h-4 text-primary" /> Push Notifications
                </h3>
                {pushPerm === "granted" ? (
                  <div className="flex items-center gap-2 text-sm text-green-400">
                    <CheckCircle className="w-4 h-4" /> Enabled
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Get notified about draw results, wins, and balance updates.
                    </p>
                    <Button className="btn-viona-primary w-full h-10 text-sm" onClick={() => pushSubscribe()}>
                      Enable push notifications
                    </Button>
                  </>
                )}
              </div>
            )}

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

        {/* Level / Gamification */}
        {section === "level" && (
          <div className="space-y-4">
            {/* Level badge + heading */}
            <div className="viona-card p-6 flex flex-col items-center gap-4 text-center">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-black text-white shadow-lg"
                style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}
              >
                {gamification?.level ?? 1}
              </div>
              <div>
                <p className="text-xl font-bold">
                  Level {gamification?.level ?? 1} — {gamification?.title ?? "Newcomer"}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {(gamification?.xp ?? 0) - (gamification?.currentLevelXp ?? 0)} / {gamification?.nextLevelXp != null ? gamification.nextLevelXp - (gamification.currentLevelXp ?? 0) : "—"} XP this level
                </p>
              </div>
              {/* Progress bar */}
              {gamification?.nextLevelXp != null && (
                <div className="w-full">
                  {(() => {
                    const cur = gamification.currentLevelXp ?? 0;
                    const pct = Math.min(100, Math.round(
                      ((gamification.xp - cur) / (gamification.nextLevelXp - cur)) * 100
                    ));
                    return (
                      <>
                        <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: "linear-gradient(90deg, #7c3aed, #a855f7)" }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5 text-right">
                          {pct}% to next level
                        </p>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Badges */}
            <div className="viona-card p-5">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary" /> Badges earned
              </h3>
              {gamification?.badges?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {(gamification.badges as string[]).map(badge => {
                    const BADGE_LABELS: Record<string, string> = {
                      first_entry: "🎟️ First Entry",
                      first_win:   "🏆 First Win",
                      streak_7:    "🔥 7-Day Streak",
                      referrer:    "🤝 Referrer",
                    };
                    return (
                      <span
                        key={badge}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/20"
                      >
                        {BADGE_LABELS[badge] ?? badge}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No badges yet — start earning XP!</p>
              )}
            </div>

            {/* How to earn XP */}
            <div className="viona-card p-5">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Star className="w-4 h-4 text-primary" /> How to earn XP
              </h3>
              <div className="space-y-2">
                {([
                  { action: "Enter a draw",          reason: "entry",       xp: "+10 XP" },
                  { action: "Win a draw",             reason: "win",         xp: "+50 XP" },
                  { action: "Refer a friend",         reason: "referral",    xp: "+25 XP" },
                  { action: "Deposit funds",          reason: "deposit",     xp: "+5 XP"  },
                  { action: "Weekly subscription",    reason: "weekly_sub",  xp: "+15 XP" },
                  { action: "Monthly subscription",   reason: "monthly_sub", xp: "+30 XP" },
                ] as { action: string; reason: string; xp: string }[]).map(row => (
                  <div key={row.reason} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{row.action}</span>
                    <span className="font-semibold text-purple-400">{row.xp}</span>
                  </div>
                ))}
              </div>
            </div>
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
              {[
                { period: "daily",   label: "Daily",   value: limitDaily,   set: setLimitDaily },
                { period: "weekly",  label: "Weekly",  value: limitWeekly,  set: setLimitWeekly },
                { period: "monthly", label: "Monthly", value: limitMonthly, set: setLimitMonthly },
              ].map(({ period, label, value, set }) => (
                <div key={period} className="flex items-center gap-3">
                  <span className="text-sm w-16 shrink-0">{label}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="flex-1 h-10 px-4 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="No limit"
                    value={value}
                    onChange={e => set(e.target.value)}
                  />
                </div>
              ))}
              <Button
                className="btn-viona-primary w-full h-10 text-sm"
                onClick={handleSaveLimits}
                disabled={savingLimits}
              >
                {savingLimits ? "Saving…" : "Save limits"}
              </Button>
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

      {/* KYC Modal */}
      {kycModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="viona-card w-full max-w-sm rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">
                {kycModal === "age" ? "Age verification" : "Full KYC"}
              </h3>
              <button onClick={() => setKycModal(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>

            <p className="text-xs text-muted-foreground">
              {kycModal === "age"
                ? "Confirm your date of birth to verify you are 18 or older. Required before your first deposit."
                : "Upload a government-issued ID to unlock withdrawals. Review takes 1-3 business days."}
            </p>

            {kycModal === "age" && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Date of birth</label>
                <input
                  type="date"
                  className="w-full h-11 px-4 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  value={kycDob}
                  onChange={e => setKycDob(e.target.value)}
                  max={new Date(Date.now() - 18 * 365.25 * 86400000).toISOString().split("T")[0]}
                />
              </div>
            )}

            {kycModal === "full" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Document type</label>
                  <select
                    className="w-full h-11 px-4 rounded-xl bg-secondary border border-border text-sm focus:outline-none"
                    value={kycDocType}
                    onChange={e => setKycDocType(e.target.value)}
                  >
                    <option value="passport">Passport</option>
                    <option value="id_card">National ID card</option>
                    <option value="driving_licence">Driving licence</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {["Front side", "Back side", "Selfie with document"].map(label => (
                    <div
                      key={label}
                      className="h-20 rounded-xl bg-secondary border border-border flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground cursor-pointer hover:border-primary/50 col-span-1 last:col-span-2"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 h-10 text-sm" onClick={() => setKycModal(null)}>
                Cancel
              </Button>
              <Button
                className="btn-viona-primary flex-1 h-10 text-sm"
                onClick={handleStartKyc}
                disabled={kycSubmitting || (kycModal === "age" && !kycDob)}
              >
                {kycSubmitting ? "Submitting…" : "Submit"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
