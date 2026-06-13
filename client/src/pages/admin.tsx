import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  Trophy, Users, Globe, DollarSign, Play, BarChart2,
  LogOut, AlertCircle, RefreshCw, CheckCircle, Clock,
  XCircle, Shield, FileText, TrendingUp, Eye, Ban
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar
} from "recharts";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { api, saveToken, clearToken } from "@/lib/api";

// ─── Admin token management ───────────────────────────────────────────────────

function getAdminToken() { return localStorage.getItem("viona_admin_token"); }
function saveAdminToken(t: string) { localStorage.setItem("viona_admin_token", t); }
function clearAdminToken() { localStorage.removeItem("viona_admin_token"); }
function hasAdminToken() { return !!getAdminToken(); }

// Intercept fetches to add admin token
const origFetch = window.fetch.bind(window);
window.fetch = function(input: any, init: RequestInit = {}) {
  const url = typeof input === "string" ? input : (input as Request).url;
  if (url.includes("/api/admin") && !url.includes("/api/admin/login")) {
    const token = getAdminToken();
    if (token) init.headers = { ...init.headers, Authorization: `Bearer ${token}` };
  }
  return origFetch(input, init);
};

// ─── Login ────────────────────────────────────────────────────────────────────

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("admin@viona.app");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const r = await api.admin.login(email, password);
      saveAdminToken(r.token);
      onLogin();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-3">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-black">VIONA Admin</h1>
          <p className="text-muted-foreground text-sm mt-1">Management Console</p>
        </div>
        <div className="viona-card p-6">
          <form onSubmit={handle} className="space-y-4">
            <input type="email" className="w-full h-11 px-4 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Admin email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input type="password" className="w-full h-11 px-4 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
            {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}
            <Button type="submit" className="btn-viona-primary w-full h-11" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-4">Dev: admin@viona.app / admin123</p>
      </div>
    </div>
  );
}

// ─── Stats overview ───────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, sub }: any) {
  return (
    <div className="viona-card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
      </div>
      <p className="text-3xl font-black">{value ?? "—"}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function Overview() {
  const [stats, setStats] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.admin.stats(), api.admin.transactions()])
      .then(([s, txs]) => { setStats(s); setTransactions(txs); })
      .finally(() => setLoading(false));
  }, []);

  // Build chart data from transactions (group by day)
  const chartData = (() => {
    const byDay: Record<string, { date: string; deposits: number; prizes: number; entries: number }> = {};
    transactions.forEach(tx => {
      const day = tx.createdAt?.slice(0, 10) ?? "unknown";
      if (!byDay[day]) byDay[day] = { date: day, deposits: 0, prizes: 0, entries: 0 };
      const amt = Math.abs(parseFloat(tx.amount ?? "0"));
      if (tx.type === "deposit") byDay[day].deposits += amt;
      if (tx.type === "prize_payout") byDay[day].prizes += amt;
      if (tx.type === "lottery_entry") byDay[day].entries += amt;
    });
    return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  })();

  if (loading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total users" value={stats?.totalUsers} icon={Users} color="bg-primary/10 text-primary" />
        <StatCard label="Completed draws" value={stats?.completedDraws} icon={Trophy} color="bg-accent/10 text-accent" />
        <StatCard
          label="Total deposits"
          value={stats?.totalDeposits ? `${parseFloat(stats.totalDeposits).toFixed(0)}` : "0"}
          icon={DollarSign}
          color="bg-green-500/10 text-green-400"
          sub="All currencies combined"
        />
        <StatCard
          label="Prizes paid"
          value={stats?.totalPrizesPaid ? `${parseFloat(stats.totalPrizesPaid).toFixed(0)}` : "0"}
          icon={Trophy}
          color="bg-amber-500/10 text-amber-400"
        />
      </div>

      {/* Revenue chart */}
      {chartData.length > 0 && (
        <div className="viona-card p-5">
          <h3 className="font-bold text-sm mb-4">Revenue (last 14 days)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gDeposits" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(262,83%,63%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(262,83%,63%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gPrizes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(42,100%,60%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(42,100%,60%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,10%,18%)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(220,8%,55%)" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(220,8%,55%)" }} />
              <Tooltip
                contentStyle={{ background: "hsl(220,14%,12%)", border: "1px solid hsl(220,10%,20%)", borderRadius: "0.5rem" }}
                labelStyle={{ color: "hsl(0,0%,96%)", fontSize: 11 }}
              />
              <Area type="monotone" dataKey="deposits" stroke="hsl(262,83%,63%)" fill="url(#gDeposits)" strokeWidth={2} name="Deposits" />
              <Area type="monotone" dataKey="prizes" stroke="hsl(42,100%,60%)" fill="url(#gPrizes)" strokeWidth={2} name="Prizes" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Entry volume chart */}
      {chartData.length > 0 && (
        <div className="viona-card p-5">
          <h3 className="font-bold text-sm mb-4">Entry volume</h3>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,10%,18%)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(220,8%,55%)" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(220,8%,55%)" }} />
              <Tooltip
                contentStyle={{ background: "hsl(220,14%,12%)", border: "1px solid hsl(220,10%,20%)", borderRadius: "0.5rem" }}
              />
              <Bar dataKey="entries" fill="hsl(172,66%,50%)" radius={[4, 4, 0, 0]} name="Entry fees" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Draws panel ──────────────────────────────────────────────────────────────

function DrawsPanel() {
  const [draws, setDraws] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [conducting, setConducting] = useState<number | null>(null);
  const { toast } = useToast();

  const load = () => { setLoading(true); api.admin.draws().then(setDraws).finally(() => setLoading(false)); };
  useEffect(load, []);

  const conduct = async (id: number) => {
    setConducting(id);
    try {
      const r = await api.admin.conductDraw(id);
      toast({ title: "Draw completed!", description: `Winner: user #${r?.winnerUserId}` });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setConducting(null); }
  };

  const STATUS = {
    open: <span className="flex items-center gap-1 text-amber-400"><Clock className="w-3.5 h-3.5" />Open</span>,
    completed: <span className="flex items-center gap-1 text-green-400"><CheckCircle className="w-3.5 h-3.5" />Done</span>,
    cancelled: <span className="flex items-center gap-1 text-muted-foreground"><XCircle className="w-3.5 h-3.5" />Cancelled</span>,
    pending: <span className="flex items-center gap-1 text-muted-foreground"><Clock className="w-3.5 h-3.5" />Pending</span>,
  } as Record<string, any>;

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex justify-between items-center">
        <h3 className="font-bold">Draws</h3>
        <Button size="sm" variant="outline" onClick={load} className="h-8 px-3 text-xs border-border">
          <RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh
        </Button>
      </div>
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {draws.map(d => (
        <div key={d.id} className="viona-card p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {STATUS[d.status] ?? STATUS.pending}
                <span className="font-medium text-sm">#{d.id} · {d.drawDate}</span>
                {d.rngProof && (
                  <span className="text-xs text-muted-foreground font-mono" title={d.rngProof}>
                    proof:{d.rngProof.slice(0, 8)}…
                  </span>
                )}
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Pool: {d.totalPool}</span>
                <span>Prize: {d.prizeAmount ?? "—"}</span>
                <span>{d.totalEntries} entries</span>
                {d.winnerUserId && <span className="text-amber-400">Winner: #{d.winnerUserId} (ticket #{d.winnerTicketNumber})</span>}
              </div>
            </div>
            {d.status === "open" && (
              <Button size="sm" className="btn-viona-primary h-8 px-4 text-xs" onClick={() => conduct(d.id)} disabled={conducting === d.id}>
                {conducting === d.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
                {conducting === d.id ? "…" : "Conduct"}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Users panel ──────────────────────────────────────────────────────────────

function UsersPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  useEffect(() => { api.admin.users(100).then(setUsers).finally(() => setLoading(false)); }, []);

  const updateStatus = async (id: number, status: string) => {
    try {
      await api.admin.updateUserStatus(id, status);
      setUsers(us => us.map(u => u.id === id ? { ...u, status } : u));
      toast({ title: "Updated" });
    } catch (err: any) { toast({ title: err.message, variant: "destructive" }); }
  };

  const filtered = users.filter(u =>
    !search || (u.email ?? u.phone ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-center gap-3">
        <h3 className="font-bold">Users ({users.length})</h3>
        <input
          className="flex-1 h-9 px-3 rounded-xl bg-secondary border border-border text-sm focus:outline-none"
          placeholder="Search by email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {filtered.map(u => (
          <div key={u.id} className="viona-card p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground">
              #{u.id}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{u.email ?? u.phone ?? "—"}</p>
              <div className="flex gap-2 mt-0.5 flex-wrap">
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  u.status === "active" ? "bg-green-500/15 text-green-400"
                  : u.status === "banned" ? "bg-red-500/15 text-red-400"
                  : u.status === "suspended" ? "bg-amber-500/15 text-amber-400"
                  : "bg-muted text-muted-foreground"
                }`}>{u.status}</span>
                <span className="text-xs text-muted-foreground">KYC: {u.kycLevel}</span>
                <span className="text-xs text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {u.status !== "active" && (
                <button onClick={() => updateStatus(u.id, "active")} className="text-xs px-2 py-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20">
                  Activate
                </button>
              )}
              {u.status !== "suspended" && u.status !== "banned" && (
                <button onClick={() => updateStatus(u.id, "suspended")} className="text-xs px-2 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20">
                  Suspend
                </button>
              )}
              {u.status !== "banned" && (
                <button onClick={() => updateStatus(u.id, "banned")} className="text-xs px-2 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20">
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

// ─── Markets panel ────────────────────────────────────────────────────────────

function MarketsPanel() {
  const [countries, setCountries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [editData, setEditData] = useState<any>({});
  const { toast } = useToast();

  useEffect(() => { api.admin.countries().then(setCountries).finally(() => setLoading(false)); }, []);

  const toggleActive = async (c: any) => {
    try {
      await api.admin.updateCountry(c.id, { isActive: !c.isActive });
      setCountries(cs => cs.map(x => x.id === c.id ? { ...x, isActive: !c.isActive } : x));
    } catch (err: any) { toast({ title: err.message, variant: "destructive" }); }
  };

  const saveEdit = async (id: number) => {
    try {
      await api.admin.updateCountry(id, editData);
      setCountries(cs => cs.map(x => x.id === id ? { ...x, ...editData } : x));
      setEditId(null);
      toast({ title: "Market updated" });
    } catch (err: any) { toast({ title: err.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-3 max-w-3xl">
      <h3 className="font-bold">Markets ({countries.length})</h3>
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {countries.map(c => (
        <div key={c.id} className="viona-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <p className="font-bold">{c.name} ({c.code})</p>
                <button
                  onClick={() => toggleActive(c)}
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    c.isActive ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {c.isActive ? "Active" : "Inactive"}
                </button>
              </div>
              {editId === c.id ? (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {[
                    ["entryAmountDaily", "Daily entry"],
                    ["entryAmountWeekly", "Weekly"],
                    ["entryAmountMonthly", "Monthly"],
                    ["prizePercentage", "Prize %"],
                    ["drawHourUtc", "Draw hour UTC"],
                  ].map(([k, label]) => (
                    <div key={k}>
                      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                      <input
                        className="w-full h-8 px-2 rounded-lg bg-secondary border border-border text-xs focus:outline-none"
                        defaultValue={c[k]}
                        onChange={e => setEditData((d: any) => ({ ...d, [k]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {c.currencySymbol}{c.entryAmountDaily}/day · {c.prizePercentage}% prize · Draw {c.drawHourUtc}:00 UTC
                </p>
              )}
            </div>
            <div className="flex gap-1.5 shrink-0">
              {editId === c.id ? (
                <>
                  <button onClick={() => saveEdit(c.id)} className="text-xs px-2 py-1 rounded-lg bg-primary/10 text-primary">Save</button>
                  <button onClick={() => setEditId(null)} className="text-xs px-2 py-1 rounded-lg bg-muted text-muted-foreground">Cancel</button>
                </>
              ) : (
                <button onClick={() => { setEditId(c.id); setEditData({}); }}
                  className="text-xs px-2 py-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground">
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Audit log panel ──────────────────────────────────────────────────────────

function AuditPanel() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.admin.auditLogs().then(setLogs).finally(() => setLoading(false)); }, []);

  return (
    <div className="space-y-3 max-w-3xl">
      <h3 className="font-bold">Audit Log</h3>
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {logs.length === 0 && !loading && (
        <div className="viona-card p-8 text-center text-muted-foreground text-sm">No audit events yet</div>
      )}
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {logs.map(l => (
          <div key={l.id} className="viona-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{l.action}</span>
                  {l.entityType && <span className="text-xs text-muted-foreground">{l.entityType} #{l.entityId}</span>}
                  {l.adminUserId && <span className="text-xs text-muted-foreground">by admin #{l.adminUserId}</span>}
                </div>
                {l.dataAfter && (
                  <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                    {JSON.stringify(l.dataAfter)}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground shrink-0">
                {new Date(l.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Financial transactions panel ─────────────────────────────────────────────

function FinancePanel() {
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.admin.transactions().then(setTxs).finally(() => setLoading(false)); }, []);

  const TYPE_COLORS: Record<string, string> = {
    deposit: "text-green-400",
    withdrawal: "text-red-400",
    lottery_entry: "text-primary",
    prize_payout: "text-amber-400",
    referral_bonus: "text-accent",
  };

  return (
    <div className="space-y-3 max-w-3xl">
      <h3 className="font-bold">Transactions ({txs.length})</h3>
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {txs.map(tx => (
          <div key={tx.id} className="viona-card p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono ${TYPE_COLORS[tx.type] ?? "text-muted-foreground"}`}>{tx.type}</span>
                <span className="text-xs text-muted-foreground">user #{tx.userId}</span>
                <span className={`text-xs font-bold ${parseFloat(tx.amount) > 0 ? "text-green-400" : "text-muted-foreground"}`}>
                  {parseFloat(tx.amount) > 0 ? "+" : ""}{parseFloat(tx.amount).toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{tx.description ?? "—"}</p>
            </div>
            <p className="text-xs text-muted-foreground shrink-0">
              {new Date(tx.createdAt).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Admin Panel ─────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "overview", label: "Overview", icon: BarChart2 },
  { id: "draws", label: "Draws", icon: Trophy },
  { id: "users", label: "Users", icon: Users },
  { id: "markets", label: "Markets", icon: Globe },
  { id: "finance", label: "Finance", icon: DollarSign },
  { id: "audit", label: "Audit", icon: FileText },
] as const;

type Section = typeof SECTIONS[number]["id"];

export default function Admin() {
  const [loggedIn, setLoggedIn] = useState(hasAdminToken());
  const [active, setActive] = useState<Section>("overview");
  const { toast } = useToast();

  useEffect(() => {
    if (loggedIn) {
      // Seed DB on first admin load (dev only)
      api.dev.seed().catch(() => {});
    }
  }, [loggedIn]);

  if (!loggedIn) return <AdminLogin onLogin={() => setLoggedIn(true)} />;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar desktop */}
      <aside className="w-52 shrink-0 border-r border-border p-4 hidden md:flex flex-col">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm">VIONA Admin</span>
        </div>
        <nav className="space-y-0.5 flex-1">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActive(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </nav>
        <button onClick={() => { clearAdminToken(); setLoggedIn(false); }}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-red-400 px-3 py-2 mt-2">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </aside>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 viona-nav border-t border-border grid grid-cols-6">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActive(id)}
            className={`flex flex-col items-center py-2 gap-0.5 text-[10px] font-medium ${
              active === id ? "text-primary" : "text-muted-foreground"
            }`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto">
        <h2 className="text-xl font-black mb-5 capitalize">{active}</h2>
        {active === "overview" && <Overview />}
        {active === "draws"    && <DrawsPanel />}
        {active === "users"    && <UsersPanel />}
        {active === "markets"  && <MarketsPanel />}
        {active === "finance"  && <FinancePanel />}
        {active === "audit"    && <AuditPanel />}
      </main>
    </div>
  );
}
