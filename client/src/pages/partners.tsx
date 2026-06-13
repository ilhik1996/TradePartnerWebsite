import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";

const CATEGORY_ICON: Record<string, string> = {
  food: "🍔", retail: "🛍️", pharmacy: "💊", telecom: "📱", fuel: "⛽",
  entertainment: "🎬", electronics: "🖥️", delivery: "📦", beauty: "💄",
  fitness: "💪", travel: "✈️", finance: "💳",
};

export default function Partners() {
  const { user } = useAuth();
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const countryId = user?.countryId;

  useEffect(() => {
    api.partners.list(countryId).then(setPartners).catch(() => {}).finally(() => setLoading(false));
  }, [countryId]);

  const filtered = partners.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="viona-nav sticky top-0 z-50 px-4 py-4 flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="font-bold text-lg">Partners</h1>
      </div>

      <div className="px-4 md:px-6 pb-24 max-w-2xl mx-auto pt-4 space-y-4">
        <div className="viona-card p-4 flex items-start gap-3">
          <Store className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Show your VIONA app at any partner location to pay with your balance.
            Cashback is credited automatically within 24 hours.
          </p>
        </div>

        <input
          type="search"
          className="w-full h-11 px-4 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="Search partners…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {loading ? (
          <div className="viona-card p-12 text-center text-muted-foreground text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="viona-card p-12 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-muted-foreground text-sm">No partners found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(p => (
              <div key={p.id} className="viona-card p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-secondary border border-border flex items-center justify-center shrink-0 text-2xl overflow-hidden">
                  {p.logoUrl ? (
                    <img src={p.logoUrl} alt={p.name} className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    CATEGORY_ICON[p.category] ?? "🏪"
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{p.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                      {CATEGORY_ICON[p.category]} {p.category}
                    </span>
                  </div>
                  {p.description && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{p.description}</p>
                  )}
                </div>

                {p.cashbackPercent > 0 && (
                  <div className="shrink-0 text-center bg-teal-500/10 rounded-xl px-3 py-2">
                    <p className="text-lg font-black text-teal-400 leading-none">{p.cashbackPercent}%</p>
                    <p className="text-[10px] text-teal-400 mt-0.5">back</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
