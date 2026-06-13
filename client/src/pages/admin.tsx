import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  Trophy, Users, Globe, DollarSign, Play, BarChart2,
  LogOut, AlertCircle, RefreshCw, CheckCircle, Clock,
  XCircle, Shield, FileText, TrendingUp, Eye, Ban, Heart, Store
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

  const { toast } = useToast();

  useEffect(() => {
    Promise.all([api.admin.stats(), api.admin.transactions()])
      .then(([s, txs]) => { setStats(s); setTransactions(txs); })
      .catch((err: any) => toast({ title: "Failed to load stats", description: err.message, variant: "destructive" }))
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
  const [showCreate, setShowCreate] = useState(false);
  const [countries, setCountries] = useState<any[]>([]);
  const [newCountryId, setNewCountryId] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  const load = () => { setLoading(true); api.admin.draws().then(setDraws).finally(() => setLoading(false)); };
  useEffect(load, []);
  useEffect(() => { if (showCreate && countries.length === 0) api.admin.countries().then(setCountries); }, [showCreate]);

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

  const createDraw = async () => {
    if (!newCountryId) { toast({ title: "Select a country", variant: "destructive" }); return; }
    setCreating(true);
    try {
      const r = await api.admin.createDraw({ countryId: parseInt(newCountryId), drawDate: newDate });
      toast({ title: "Draw created", description: `Draw #${r.id} for ${newDate} is now open.` });
      setShowCreate(false);
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setCreating(false); }
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
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowCreate(v => !v)} className="h-8 px-3 text-xs border-border">
            + Create Draw
          </Button>
          <Button size="sm" variant="outline" onClick={load} className="h-8 px-3 text-xs border-border">
            <RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh
          </Button>
        </div>
      </div>

      {showCreate && (
        <div className="viona-card p-4 space-y-3">
          <p className="text-sm font-semibold">Create new draw</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Market</p>
              <select
                className="w-full h-9 px-3 rounded-xl bg-secondary border border-border text-sm focus:outline-none"
                value={newCountryId}
                onChange={e => setNewCountryId(e.target.value)}
              >
                <option value="">Select country…</option>
                {countries.map(c => <option key={c.id} value={c.id}>{c.name} ({c.currencySymbol})</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Draw Date</p>
              <input
                type="date"
                className="w-full h-9 px-3 rounded-xl bg-secondary border border-border text-sm focus:outline-none"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowCreate(false)} className="text-xs px-3 py-1.5 rounded-lg bg-muted text-muted-foreground">Cancel</button>
            <button onClick={createDraw} disabled={creating} className="text-xs px-4 py-1.5 rounded-lg bg-primary text-white disabled:opacity-50">
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}

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

  const exportCsv = () => {
    const rows = [["ID", "Email", "Phone", "Status", "KYC Level", "Country ID", "Created"]];
    users.forEach(u => rows.push([u.id, u.email ?? "", u.phone ?? "", u.status, u.kycLevel, u.countryId ?? "", new Date(u.createdAt).toISOString()]));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `viona-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
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
        {users.length > 0 && (
          <Button size="sm" variant="outline" onClick={exportCsv} className="h-8 px-3 text-xs border-border shrink-0">
            Export CSV
          </Button>
        )}
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

const BLANK_COUNTRY = {
  code: "", name: "", currency: "", currencySymbol: "", locale: "",
  entryAmountDaily: "5", entryAmountWeekly: "25", entryAmountMonthly: "100",
  prizePercentage: "50", drawHourUtc: "21",
};

function MarketsPanel() {
  const [countries, setCountries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [creating, setCreating] = useState(false);
  const [newData, setNewData] = useState({ ...BLANK_COUNTRY });
  const [saving, setSaving] = useState(false);
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

  const createCountry = async () => {
    setSaving(true);
    try {
      const created = await api.admin.createCountry({
        ...newData,
        drawHourUtc: parseInt(newData.drawHourUtc),
      });
      setCountries(cs => [created, ...cs]);
      setCreating(false);
      setNewData({ ...BLANK_COUNTRY });
      toast({ title: "Market created" });
    } catch (err: any) { toast({ title: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">Markets ({countries.length})</h3>
        <button
          onClick={() => setCreating(v => !v)}
          className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-medium hover:bg-primary/20"
        >
          {creating ? "Cancel" : "+ Add Market"}
        </button>
      </div>

      {creating && (
        <div className="viona-card p-4 space-y-3 border-primary/30">
          <p className="text-sm font-semibold text-primary">New market</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              ["code", "Country code (e.g. UA)"],
              ["name", "Name"],
              ["currency", "Currency (e.g. UAH)"],
              ["currencySymbol", "Symbol (e.g. ₴)"],
              ["locale", "Locale (e.g. uk-UA)"],
              ["entryAmountDaily", "Daily entry"],
              ["entryAmountWeekly", "Weekly entry"],
              ["entryAmountMonthly", "Monthly entry"],
              ["prizePercentage", "Prize %"],
              ["drawHourUtc", "Draw hour UTC"],
            ] as [string, string][]).map(([k, label]) => (
              <div key={k}>
                <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                <input
                  className="w-full h-8 px-2 rounded-lg bg-secondary border border-border text-xs focus:outline-none"
                  value={(newData as any)[k]}
                  onChange={e => setNewData(d => ({ ...d, [k]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <button
            onClick={createCountry}
            disabled={saving || !newData.code || !newData.name}
            className="w-full h-9 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create market"}
          </button>
        </div>
      )}
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

  const exportCsv = () => {
    const rows = [["ID", "User ID", "Type", "Amount", "Balance After", "Status", "Description", "Created"]];
    txs.forEach(tx => rows.push([tx.id, tx.userId, tx.type, tx.amount, tx.balanceAfter, tx.status, tx.description ?? "", new Date(tx.createdAt).toISOString()]));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `viona-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const TYPE_COLORS: Record<string, string> = {
    deposit: "text-green-400",
    withdrawal: "text-red-400",
    lottery_entry: "text-primary",
    prize_payout: "text-amber-400",
    referral_bonus: "text-accent",
  };

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">Transactions ({txs.length})</h3>
        {txs.length > 0 && (
          <Button size="sm" variant="outline" onClick={exportCsv} className="h-8 px-3 text-xs border-border">
            Export CSV
          </Button>
        )}
      </div>
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

// ─── Petition panel ───────────────────────────────────────────────────────────

function PetitionPanel() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.admin.petition().then(setData).finally(() => setLoading(false));
  }, []);

  const exportCsv = () => {
    if (!data?.signatures) return;
    const rows = [["ID", "First Name", "Country", "Date"]];
    data.signatures.forEach((s: any) =>
      rows.push([s.id, s.firstName, s.countryCode, new Date(s.agreedAt).toISOString()])
    );
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `viona-petition-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">Support Petition</h3>
        {data?.total > 0 && (
          <Button size="sm" variant="outline" className="h-8 px-3 text-xs border-border" onClick={exportCsv}>
            Export CSV
          </Button>
        )}
      </div>
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="viona-card p-4 text-center">
              <p className="text-4xl font-black text-gradient-prize">{data.total}</p>
              <p className="text-xs text-muted-foreground mt-1">Total active signatures</p>
            </div>
            <div className="viona-card p-4">
              <p className="font-semibold text-sm mb-2">By country</p>
              <div className="space-y-1">
                {Object.entries(data.byCountry as Record<string, number>).map(([code, count]) => (
                  <div key={code} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{code}</span>
                    <span className="font-bold">{count}</span>
                  </div>
                ))}
                {Object.keys(data.byCountry).length === 0 && (
                  <p className="text-xs text-muted-foreground">No signatures yet</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto">
            {data.signatures.map((s: any) => (
              <div key={s.id} className="viona-card p-3 flex items-center gap-3">
                <Heart className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1">
                  <span className="font-medium text-sm">{s.firstName}</span>
                  <span className="text-muted-foreground text-sm"> · {s.countryCode}</span>
                </div>
                <p className="text-xs text-muted-foreground">{new Date(s.agreedAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Partners panel ────────────────────────────────────────────────────────────

const PARTNER_CATEGORIES = ["food", "retail", "pharmacy", "telecom", "fuel", "entertainment", "electronics", "delivery", "beauty", "fitness", "travel", "finance"] as const;
type PartnerCategory = typeof PARTNER_CATEGORIES[number];

interface PartnerFormData {
  name: string;
  category: PartnerCategory;
  description: string;
  cashbackPercent: number;
  countryId: string;
  isActive: boolean;
}

const DEFAULT_FORM: PartnerFormData = {
  name: "",
  category: "retail",
  description: "",
  cashbackPercent: 0,
  countryId: "",
  isActive: true,
};

function PartnersPanel() {
  const { toast } = useToast();
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PartnerFormData>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);

  const loadPartners = () => {
    setLoading(true);
    api.partners.list().then(setPartners).finally(() => setLoading(false));
  };

  useEffect(() => { loadPartners(); }, []);

  const categoryIcon: Record<string, string> = {
    food: '🍔', retail: '🛍️', pharmacy: '💊', telecom: '📱', fuel: '⛽', entertainment: '🎬',
    electronics: '🖥️', delivery: '📦', beauty: '💄', fitness: '💪', travel: '✈️', finance: '💳',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body: Record<string, any> = {
        name: form.name,
        category: form.category,
        cashbackPercent: Number(form.cashbackPercent),
        isActive: form.isActive,
      };
      if (form.description.trim()) body.description = form.description.trim();
      if (form.countryId.trim()) body.countryId = parseInt(form.countryId);
      await api.admin.createPartner(body);
      toast({ title: "Partner created", description: `${form.name} has been added.` });
      setForm(DEFAULT_FORM);
      setShowForm(false);
      loadPartners();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (id: number, name: string) => {
    try {
      await api.admin.deletePartner(id);
      toast({ title: "Partner deactivated", description: `${name} has been deactivated.` });
      setPartners(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold">Partner Network</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{partners.length} active partners · cashback paid from platform revenue</p>
        </div>
        <Button size="sm" onClick={() => { setShowForm(v => !v); setForm(DEFAULT_FORM); }}>
          {showForm ? "Cancel" : "Add Partner"}
        </Button>
      </div>

      {showForm && (
        <div className="viona-card p-4">
          <p className="text-sm font-semibold mb-3">New Partner</p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Name *</label>
                <input
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Category *</label>
                <select
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value as PartnerCategory }))}
                >
                  {PARTNER_CATEGORIES.map(c => (
                    <option key={c} value={c}>{categoryIcon[c]} {c}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Cashback % (0–50) *</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={0.1}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  value={form.cashbackPercent}
                  onChange={e => setForm(f => ({ ...f, cashbackPercent: parseFloat(e.target.value) || 0 }))}
                  required
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Description</label>
                <textarea
                  rows={2}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Country ID (leave blank for global)</label>
                <input
                  type="number"
                  min={1}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  value={form.countryId}
                  onChange={e => setForm(f => ({ ...f, countryId: e.target.value }))}
                  placeholder="optional"
                />
              </div>
              <div className="flex flex-col gap-1 justify-end">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                    className="accent-primary w-4 h-4"
                  />
                  Active
                </label>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? "Creating…" : "Create Partner"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { setShowForm(false); setForm(DEFAULT_FORM); }}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}

      <div className="space-y-2">
        {partners.map(p => (
          <div key={p.id} className="viona-card p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-secondary border border-border flex items-center justify-center text-xl shrink-0">
              {categoryIcon[p.category] ?? '🏪'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{p.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.description}</p>
              <div className="flex gap-2 mt-1">
                <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">
                  {categoryIcon[p.category]} {p.category}
                </span>
                {p.countryId && (
                  <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">
                    Country #{p.countryId}
                  </span>
                )}
                {!p.countryId && (
                  <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">
                    🌍 Global
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-black" style={{ color: 'var(--viona-teal)' }}>
                {p.cashbackPercent}%
              </p>
              <p className="text-xs text-muted-foreground">cashback</p>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-2">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${p.isActive
                ? 'bg-green-500/15 text-green-400'
                : 'bg-red-500/15 text-red-400'}`}>
                {p.isActive ? 'Active' : 'Inactive'}
              </span>
              {p.isActive && (
                <button
                  onClick={() => handleDeactivate(p.id, p.name)}
                  className="text-xs text-red-400 hover:text-red-300 hover:underline"
                >
                  Deactivate
                </button>
              )}
            </div>
          </div>
        ))}
        {!loading && partners.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <Store className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No partners configured
          </div>
        )}
      </div>

      <div className="viona-card p-4">
        <p className="text-xs font-semibold mb-2">Partner integration notes</p>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• Partners are paid from 50% platform revenue (not from prize pool)</li>
          <li>• Cashback is credited to user wallet within 24 hours of purchase</li>
          <li>• Use the Add Partner button above to create partners via the admin UI</li>
          <li>• Country-specific partners only appear in their market</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Withdrawals panel ────────────────────────────────────────────────────────

function WithdrawalsPanel() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    api.admin.withdrawals().then(setItems).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const approve = async (id: number) => {
    try {
      await api.admin.approveWithdrawal(id);
      toast({ title: "Withdrawal approved", description: "User has been notified." });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const reject = async (id: number) => {
    const reason = window.prompt("Rejection reason (optional):");
    if (reason === null) return; // cancelled
    try {
      await api.admin.rejectWithdrawal(id, reason || undefined);
      toast({ title: "Withdrawal rejected", description: "Balance refunded to user." });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">Pending Withdrawals ({items.length})</h3>
        <Button size="sm" variant="outline" onClick={load} className="h-8 px-3 text-xs border-border">
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {!loading && items.length === 0 && (
        <div className="viona-card p-10 text-center text-muted-foreground text-sm">
          <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400/60" />
          No pending withdrawals
        </div>
      )}

      <div className="space-y-2">
        {items.map((w: any) => (
          <div key={w.id} className="viona-card p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  {Math.abs(parseFloat(w.amount)).toFixed(2)}
                </span>
                <span className="text-xs text-muted-foreground">
                  user #{w.userId} · {w.email ?? "no email"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(w.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                onClick={() => approve(w.id)}
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                onClick={() => reject(w.id)}
              >
                <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const SECTIONS = [
  { id: "overview",     label: "Overview",    icon: BarChart2 },
  { id: "draws",        label: "Draws",       icon: Trophy },
  { id: "users",        label: "Users",       icon: Users },
  { id: "markets",      label: "Markets",     icon: Globe },
  { id: "finance",      label: "Finance",     icon: DollarSign },
  { id: "withdrawals",  label: "Withdrawals", icon: AlertCircle },
  { id: "partners",     label: "Partners",    icon: Store },
  { id: "audit",        label: "Audit",       icon: FileText },
  { id: "petition",     label: "Petition",    icon: Heart },
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
        {active === "overview"     && <Overview />}
        {active === "draws"        && <DrawsPanel />}
        {active === "users"        && <UsersPanel />}
        {active === "markets"      && <MarketsPanel />}
        {active === "finance"      && <FinancePanel />}
        {active === "withdrawals"  && <WithdrawalsPanel />}
        {active === "partners"     && <PartnersPanel />}
        {active === "audit"        && <AuditPanel />}
        {active === "petition"     && <PetitionPanel />}
      </main>
    </div>
  );
}
