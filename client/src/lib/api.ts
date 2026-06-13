const BASE = "/api";

function getToken(): string | null {
  return localStorage.getItem("viona_token");
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeaders(), ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Request failed");
  }
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    register: (body: { email?: string; phone?: string; password: string; countryId?: number }) =>
      request<{ token: string; user: any }>("/auth/register", { method: "POST", body: JSON.stringify(body) }),

    login: (identifier: string, password: string) =>
      request<{ token: string; user: any }>("/auth/login", {
        method: "POST", body: JSON.stringify({ identifier, password })
      }),

    me: () => request<any>("/auth/me"),
  },

  countries: {
    list: () => request<any[]>("/countries"),
    get: (id: number) => request<any>(`/countries/${id}`),
  },

  draws: {
    today: (countryId: number) => request<any>(`/draws/today/${countryId}`),
    history: (countryId: number) => request<any[]>(`/draws/history/${countryId}`),
    enter: (drawId: number) => request<any>(`/draws/${drawId}/enter`, { method: "POST" }),
    enterFree: (drawId: number, body: object) =>
      request<any>(`/draws/${drawId}/enter-free`, { method: "POST", body: JSON.stringify(body) }),
    myEntry: (drawId: number) => request<any>(`/draws/${drawId}/my-entry`),
  },

  wallet: {
    get: () => request<any>("/wallet"),
    transactions: (limit = 20, offset = 0) => request<any[]>(`/wallet/transactions?limit=${limit}&offset=${offset}`),
    deposit: (amount: number, currency = "UAH", paymentMethodToken = "mock_pm_token") =>
      request<any>("/wallet/deposit", { method: "POST", body: JSON.stringify({ amount, currency, paymentMethodToken }) }),
    withdraw: (amount: number) => request<any>("/wallet/withdraw", { method: "POST", body: JSON.stringify({ amount }) }),
  },

  profile: {
    get: () => request<any>("/profile"),
    update: (body: { firstName?: string; lastName?: string }) =>
      request<any>("/profile", { method: "PATCH", body: JSON.stringify(body) }),
    setAutoParticipate: (enabled: boolean) =>
      request<any>("/settings/auto-participate", { method: "PATCH", body: JSON.stringify({ enabled }) }),
    getResponsibleGaming: () => request<any>("/settings/responsible-gaming"),
    selfExclude: (days: number) =>
      request<any>("/settings/self-exclude", { method: "POST", body: JSON.stringify({ days }) }),
  },

  notifications: {
    list: () => request<any[]>("/notifications"),
    markRead: (id: number) => request<any>(`/notifications/${id}/read`, { method: "PATCH" }),
  },

  subscription: {
    get: () => request<any>("/subscription"),
    history: () => request<any[]>("/subscription/history"),
    create: (type: "weekly" | "monthly", paymentMethodToken = "mock_pm_token") =>
      request<any>("/subscription", { method: "POST", body: JSON.stringify({ type, paymentMethodToken }) }),
    cancel: (id: number) => request<any>(`/subscription/${id}`, { method: "DELETE" }),
  },

  referrals: {
    my: () => request<any>("/referrals/my"),
    apply: (code: string) => request<any>("/referrals/apply", { method: "POST", body: JSON.stringify({ code }) }),
  },

  petition: {
    sign: (body: { firstName: string; countryCode: string }) =>
      request<any>("/petition/sign", { method: "POST", body: JSON.stringify(body) }),
    revoke: () => request<any>("/petition/sign", { method: "DELETE" }),
  },

  admin: {
    login: (email: string, password: string) =>
      request<{ token: string; admin: any }>("/admin/login", {
        method: "POST", body: JSON.stringify({ email, password })
      }),
    countries: () => request<any[]>("/admin/countries"),
    draws: () => request<any[]>("/admin/draws"),
    conductDraw: (id: number) => request<any>(`/admin/draws/${id}/conduct`, { method: "POST" }),
    users: (limit = 50, offset = 0) => request<any[]>(`/admin/users?limit=${limit}&offset=${offset}`),
    updateUserStatus: (id: number, status: string) =>
      request<any>(`/admin/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    stats: () => request<any>("/admin/stats"),
    transactions: () => request<any[]>("/admin/transactions"),
    auditLogs: () => request<any[]>("/admin/audit-logs"),
    petition: () => request<any>("/admin/petition"),
    updateCountry: (id: number, body: object) =>
      request<any>(`/admin/countries/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  },

  partners: {
    list: (countryId?: number) =>
      request<any[]>(`/partners${countryId !== undefined ? `?countryId=${countryId}` : ""}`),
    get: (id: number) => request<any>(`/partners/${id}`),
  },

  gamification: {
    me: () => request<any>("/gamification/me"),
  },

  dev: {
    seed: () => request<any>("/dev/seed", { method: "POST" }),
  },
};

export function saveToken(token: string) { localStorage.setItem("viona_token", token); }
export function clearToken() { localStorage.removeItem("viona_token"); }
export function hasToken() { return !!getToken(); }
