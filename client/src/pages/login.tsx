import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Trophy, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

export default function Login() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) return;
    setLoading(true);
    try {
      await login(identifier, password);
      navigate("/dashboard");
    } catch (err: any) {
      toast({ title: "Login failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/6 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/">
            <div className="inline-flex flex-col items-center gap-2 cursor-pointer">
              <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center">
                <Trophy className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-black tracking-tight">VIONA</span>
            </div>
          </Link>
          <p className="text-muted-foreground mt-2">Welcome back</p>
        </div>

        {/* Card */}
        <div className="viona-card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="identifier" className="text-sm font-medium">Email or phone</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="identifier"
                  type="text"
                  placeholder="you@example.com"
                  className="pl-10 h-12 bg-secondary border-border"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPass ? "text" : "password"}
                  placeholder="Your password"
                  className="pl-10 pr-12 h-12 bg-secondary border-border"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
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

            <Button
              type="submit"
              className="btn-viona-primary w-full h-12 text-base"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/register" className="text-primary hover:underline font-medium">
              Create one free
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          18+ only. By signing in you agree to our Terms of Service.
        </p>
      </div>
    </div>
  );
}
