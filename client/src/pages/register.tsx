import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Trophy, Mail, Lock, Eye, EyeOff, Globe, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";

export default function Register() {
  const [, navigate] = useLocation();
  const { register } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [countryId, setCountryId] = useState<number | undefined>();
  const [countries, setCountries] = useState<any[]>([]);
  const [age18, setAge18] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const [autoOk, setAutoOk] = useState(true);
  const [loading, setLoading] = useState(false);
  const [countriesError, setCountriesError] = useState(false);
  const [refCode] = useState(() => new URLSearchParams(window.location.search).get("ref") ?? "");

  useEffect(() => {
    api.countries.list()
      .then(setCountries)
      .catch(() => setCountriesError(true));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!countryId) {
      toast({ title: "Please select your country", variant: "destructive" });
      return;
    }
    if (!age18 || !termsOk) {
      toast({ title: "Please confirm all requirements", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await register({ email, password, countryId, autoParticipate: autoOk });
      // Apply referral code from ?ref= query param if present
      if (refCode) {
        api.referrals.apply(refCode).catch(() => {});
      }
      navigate("/dashboard");
    } catch (err: any) {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/6 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/">
            <div className="inline-flex flex-col items-center gap-2 cursor-pointer">
              <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center">
                <Trophy className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-black tracking-tight">VIONA</span>
            </div>
          </Link>
          <p className="text-muted-foreground mt-2">Create your account</p>
        </div>

        <div className="viona-card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Country */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Your country</Label>
              {countriesError ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Could not load country list. Please refresh the page and try again.
                </div>
              ) : (
                <div className="relative">
                  <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                  <select
                    className="w-full h-12 pl-10 pr-4 rounded-md bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
                    value={countryId ?? ""}
                    onChange={e => setCountryId(e.target.value ? parseInt(e.target.value) : undefined)}
                  >
                    <option value="">Select country…</option>
                    {countries.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.currencySymbol}{c.entryAmountDaily}/day
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  className="pl-10 h-12 bg-secondary border-border"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPass ? "text" : "password"}
                  placeholder="At least 8 characters"
                  className="pl-10 pr-12 h-12 bg-secondary border-border"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPass(v => !v)}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Consents */}
            <div className="space-y-3 pt-1">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="age18"
                  checked={age18}
                  onCheckedChange={v => setAge18(v === true)}
                  className="mt-0.5"
                />
                <label htmlFor="age18" className="text-sm leading-relaxed cursor-pointer">
                  I confirm I am <strong>18 years of age or older</strong>
                </label>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="terms"
                  checked={termsOk}
                  onCheckedChange={v => setTermsOk(v === true)}
                  className="mt-0.5"
                />
                <label htmlFor="terms" className="text-sm leading-relaxed cursor-pointer">
                  I agree to the{" "}
                  <a href="#" className="text-primary hover:underline">Terms of Service</a>{" "}
                  and{" "}
                  <a href="#" className="text-primary hover:underline">Privacy Policy</a>
                </label>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-primary/5 border border-primary/15">
                <Checkbox
                  id="auto"
                  checked={autoOk}
                  onCheckedChange={v => setAutoOk(v === true)}
                  className="mt-0.5"
                />
                <label htmlFor="auto" className="text-sm leading-relaxed cursor-pointer">
                  <strong>Auto-participate:</strong> When my balance has funds, I'll automatically enter each daily draw.
                  I can turn this off anytime from my dashboard or settings.
                </label>
              </div>
            </div>

            {refCode && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/10 border border-accent/20 text-sm">
                <CheckCircle className="w-4 h-4 text-accent shrink-0" />
                <span>Referral code <strong className="font-mono">{refCode}</strong> will be applied automatically</span>
              </div>
            )}

            <Button
              type="submit"
              className="btn-viona-primary w-full h-12 text-base"
              disabled={loading || !age18 || !termsOk || !countryId}
            >
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <div className="mt-5 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </div>
        </div>

        <div className="viona-card mt-4 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Free entry always available.</strong>{" "}
              You can participate in every draw for free by filling out a short form — no payment required.
              Paid entries build the prize pool.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
