import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Trophy, Users, Globe, DollarSign, Play, BarChart2,
  LogOut, Settings, AlertCircle, ChevronDown, ChevronUp,
  CheckCircle, Clock, XCircle, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { api, saveToken, clearToken } from "@/lib/api";

// Separate admin token storage
function getAdminToken() { return localStorage.getItem("viona_admin_token"); }
function saveAdminToken(t: string) { localStorage.setItem("viona_admin_token", t); }
function clearAdminToken() { localStorage.removeItem("viona_admin_token"); }
function hasAdminToken() { return !!getAdminToken(); }

// Patch fetch to use admin token for /api/admin routes
const origFetch = window.fetch.bind(window);
window.fetch = function(input, init = {}) {
  const url = typeof input === "string" ? input : (input as Request).url;
  if (url.includes("/api/admin") && !url.includes("/api/admin/login")) {
    const token = getAdminToken();
    if (token) {
      init.headers = { ...init.headers, Authorization: `Bearer ${token}` };
    }
  }
  return origFetch(input, init);
};

// ── Login screen ──────────────────────────────────────────────────────────────

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("admin@viona.app");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await api.admin.login(email, password);
      saveAdminToken(result.token);
      onLogin();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-3">
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-black">VIONA Admin</h1>
          <p className="text-muted-foreground text-sm mt-1">Management Console</p>
        </div>
        <div className="viona-card p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              className="w-full h-11 px-4 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Admin email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              className="w-full h-11 px-4 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}
            <Button type="submit" className="btn-viona-primary w-full h-11" disabled={loading}>
              {loading ? "Signing in…" : "Sign in to Admin"}
            </Button>
          </form>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-4">
          Dev defaults: admin@viona.app / admin123
        </p>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: any) {
  return (
    <div className="viona-card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p className="text-3xl font-black">{value}</p>
    </div>
  );
}

// ── Draws panel ───────────────────────────────────────────────────────────────

function DrawsPanel() {
  const [draws, setDraws] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [conducting, setConducting] = useState<number | null>(null);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    api.admin.draws().then(setDraws).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const conductDraw = async (id: number) => {
    setConducting(id);
    try {
      const result = await api.admin.conductDraw(id);
      toast({ title: "Draw completed!", description: `Winner: user #${result?.winnerUserId}` });
      load();
    } catch (err: any) {
      toast({ title: "Draw failed", description: err.message, variant: "destructive" });
    } finally {
      setConducting(null);
    }
  };

  const STATUS_ICONS: Record<string, any> = {
    open: <Clock className="w-3.5 h-3.5 text-amber-400" />,
    completed: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
    cancelled: <XCircle className="w-3.5 h-3.5 text-red-400" />,
    pending: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">Draws</h3>
        <Button size="sm" variant="outline" onClick={load} className="h-8 px-3 text-xs border-border">
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
      </div>
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {draws.map(draw => (
        <div key={draw.id} className="viona-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {STATUS_ICONS[draw.status] ?? null}
              <span className="font-medium text-sm">Draw #{draw.id} · {draw.drawDate}</span>
            </div>
            {draw.status === "open" && (
              <Button
                size="sm"
                className="btn-viona-primary h-8 px-3 text-xs"
                onClick={() => conductDraw(draw.id)}
                disabled={conducting === draw.id}
              >
                {conducting === draw.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                {conducting === draw.id ? "" : " Conduct"}
              </Button>
            )}
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Pool: {draw.totalPool}</span>
            <span>Prize: {draw.prizeAmount ?? "—"}</span>
            <span>Entries: {draw.totalEntries}</span>
            {draw.winnerUserId && <span className="text-amber-400">Winner: #{draw.winnerUserId}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Users panel ───────────────────────────────────────────────────────────────

function UsersPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    api.admin.users().then(setUsers).finally(() => setLoading(false));
  }, []);

  const updateStatus = async (id: number, status: string) => {
    try {
      await api.admin.updateUserStatus(id, status);
      setUsers(us => us.map(u => u.id === id ? { ...u, status } : u));
      toast({ title: "Status updated" });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="font-bold">Users ({users.length})</h3>
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {users.map(u => (
          <div key={u.id} className="viona-card p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{u.email ?? u.phone ?? `#${u.id}`}</p>
              <div className="flex gap-2 mt-0.5">
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  u.status === "active" ? "bg-green-500/15 text-green-400"
                  : u.status === "banned" ? "bg-red-500/15 text-red-400"
                  : "bg-muted text-muted-foreground"
                }`}>{u.status}</span>
                <span className="text-xs text-muted-foreground">KYC: {u.kycLevel}</span>
              </div>
            </div>
            <div className="flex gap-1.5">
              {u.status !== "active" && (
                <button onClick={() => updateStatus(u.id, "active")} className="text-xs px-2 py-1 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20">
                  Activate
                </button>
              )}
              {u.status !== "banned" && (
                <button onClick={() => updateStatus(u.id, "banned")} className="text-xs px-2 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20">
                  Ban
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Countries panel ────────────────────────────────────────────────────────────

function CountriesPanel() {
  const [countries, setCountries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    api.admin.countries().then(setCountries).finally(() => setLoading(false));
  }, []);

  const toggleActive = async (c: any) => {
    try {
      const updated = await api.admin.updateCountry(c.id, { isActive: !c.isActive });
      setCountries(cs => cs.map(x => x.id === c.id ? { ...x, isActive: !c.isActive } : x));
      toast({ title: `${c.name} ${!c.isActive ? "enabled" : "disabled"}` });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="font-bold">Markets</h3>
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {countries.map(c => (
        <div key={c.id} className="viona-card p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">{c.name} ({c.code})</p>
            <p className="text-xs text-muted-foreground">
              {c.currencySymbol}{c.entryAmountDaily}/day · Prize: {c.prizePercentage}% · Draw: {c.drawHourUtc}h UTC
            </p>
          </div>
          <button
            onClick={() => toggleActive(c)}
            className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-colors ${
              c.isActive ? "bg-green-500/15 text-green-400 hover:bg-green-500/25" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {c.isActive ? "Active" : "Inactive"}
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Main Admin Panel ───────────────────────────────────────────────────────────

export default function Admin() {
  const [loggedIn, setLoggedIn] = useState(hasAdminToken());
  const [stats, setStats] = useState<any>(null);
  const [activeSection, setActiveSection] = useState("overview");
  const { toast } = useToast();

  useEffect(() => {
    if (loggedIn) {
      api.admin.stats().then(setStats).catch(() => {
        clearAdminToken();
        setLoggedIn(false);
      });
      // Seed DB on first load
      api.dev.seed().catch(() => {});
    }
  }, [loggedIn]);

  if (!loggedIn) {
    return <AdminLogin onLogin={() => setLoggedIn(true)} />;
  }

  const sections = [
    { id: "overview", label: "Overview", icon: BarChart2 },
    { id: "draws", label: "Draws", icon: Trophy },
    { id: "users", label: "Users", icon: Users },
    { id: "markets", label: "Markets", icon: Globe },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-border p-4 hidden md:flex flex-col">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Trophy className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold">VIONA Admin</span>
        </div>
        <nav className="space-y-1 flex-1">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeSection === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
        <button
          onClick={() => { clearAdminToken(); setLoggedIn(false); }}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-red-400 px-3 py-2"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </aside>

      {/* Mobile tabs */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 viona-nav border-t border-border flex">
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id)}
            className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs font-medium transition-colors ${
              activeSection === id ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        ))}
      </div>

      {/* Main */}
      <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto">
        {activeSection === "overview" && (
          <div className="space-y-4 max-w-2xl">
            <h2 className="text-xl font-bold">Overview</h2>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Total users" value={stats?.totalUsers ?? "—"} icon={Users} color="bg-primary/10 text-primary" />
              <StatCard label="Completed draws" value={stats?.completedDraws ?? "—"} icon={Trophy} color="bg-accent/10 text-accent" />
              <StatCard label="Total deposits" value={stats?.totalDeposits ? `$${parseFloat(stats.totalDeposits).toFixed(0)}` : "—"} icon={DollarSign} color="bg-green-500/10 text-green-400" />
              <StatCard label="Prizes paid" value={stats?.totalPrizesPaid ? `$${parseFloat(stats.totalPrizesPaid).toFixed(0)}` : "—"} icon={Trophy} color="bg-amber-500/10 text-amber-400" />
            </div>
            <div className="viona-card p-5">
              <h3 className="font-semibold text-sm mb-3">Quick actions</h3>
              <div className="space-y-2">
                <Button
                  className="btn-viona-primary w-full h-10 text-sm"
                  onClick={() => api.dev.seed().then(() => toast({ title: "DB seeded" })).catch(e => toast({ title: e.message, variant: "destructive" }))}
                >
                  Seed database (dev)
                </Button>
                <Button
                  variant="outline"
                  className="btn-viona-outline w-full h-10 text-sm"
                  onClick={() => { setActiveSection("draws"); }}
                >
                  Manage draws
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeSection === "draws" && <div className="max-w-2xl"><DrawsPanel /></div>}
        {activeSection === "users" && <div className="max-w-2xl"><UsersPanel /></div>}
        {activeSection === "markets" && <div className="max-w-2xl"><CountriesPanel /></div>}
      </main>
    </div>
  );
}
