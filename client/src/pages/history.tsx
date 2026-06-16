import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Trophy, Target, CheckCircle, Clock, XCircle, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

// Proximity bar: how close to winning (0–100%)
function ProximityBar({ myTicket, totalEntries, winnerTicket }: {
  myTicket: number; totalEntries: number; winnerTicket: number;
}) {
  if (!myTicket || !totalEntries) return null;
  // Distance from winner as % of total
  const distance = Math.abs(myTicket - winnerTicket);
  const proximityPct = Math.max(0, 100 - Math.round((distance / totalEntries) * 100));

  const color =
    proximityPct >= 90 ? "from-amber-400 to-yellow-300" :
    proximityPct >= 70 ? "from-primary to-violet-400" :
    proximityPct >= 40 ? "from-primary/70 to-primary/40" :
    "from-muted to-muted/60";

  const label =
    proximityPct === 100 ? "Winner!" :
    proximityPct >= 90 ? "So close!" :
    proximityPct >= 70 ? "Very close" :
    proximityPct >= 40 ? "Close" :
    "Far off";

  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-muted-foreground">How close were you?</span>
        <span className={`font-bold ${proximityPct >= 90 ? "text-amber-400" : "text-primary"}`}>
          {label} · {proximityPct}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`}
          style={{ width: `${proximityPct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Your ticket: #{myTicket} · Winner: #{winnerTicket} · {totalEntries} total entries
      </p>
    </div>
  );
}

function DrawCard({ draw, symbol }: { draw: any; symbol: string }) {
  const [expanded, setExpanded] = useState(false);
  const isWinner = draw.isWinner === true;

  return (
    <div className={`viona-card p-5 ${isWinner ? "border-amber-500/30" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {draw.status === "completed"
            ? isWinner
              ? <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
              : <CheckCircle className="w-5 h-5 text-green-400/60 shrink-0" />
            : draw.status === "cancelled"
            ? <XCircle className="w-5 h-5 text-muted-foreground shrink-0" />
            : <Clock className="w-5 h-5 text-primary shrink-0" />
          }
          <div>
            <p className="font-semibold text-sm">{draw.drawDate}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {draw.totalEntries} entries · Pool: {symbol}{parseFloat(draw.totalPool ?? 0).toFixed(2)}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          {draw.status === "completed" && draw.prizeAmount && (
            <p className={`font-bold text-sm ${isWinner ? "text-amber-400" : "text-muted-foreground"}`}>
              {isWinner ? "+" : ""}{symbol}{parseFloat(draw.prizeAmount).toFixed(2)}
            </p>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${
            draw.status === "completed"
              ? isWinner ? "bg-amber-500/15 text-amber-400" : "bg-green-500/10 text-green-400/80"
              : draw.status === "cancelled" ? "bg-muted text-muted-foreground"
              : "bg-primary/10 text-primary"
          }`}>
            {isWinner ? "Won!" : draw.status}
          </span>
        </div>
      </div>

      {/* Expand for proximity info */}
      {draw.status === "completed" && !isWinner && draw.myTicket && (
        <>
          <button
            onClick={() => setExpanded(v => !v)}
            className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <Target className="w-3.5 h-3.5" />
            {expanded ? "Hide" : "Show"} proximity
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          {expanded && (
            <ProximityBar
              myTicket={draw.myTicket}
              totalEntries={draw.totalEntries}
              winnerTicket={draw.winnerTicketNumber}
            />
          )}
        </>
      )}

      {isWinner && draw.myTicket && (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-400">
          <Trophy className="w-3.5 h-3.5" />
          Your winning ticket: #{draw.myTicket}
        </div>
      )}

      {draw.status === "completed" && draw.rngProof && (
        <a
          href={`/api/draws/${draw.id}/verify`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-primary transition-colors w-fit"
        >
          <CheckCircle className="w-3 h-3" />
          Verify fairness
        </a>
      )}
    </div>
  );
}

export default function History() {
  const { user } = useAuth();
  const [draws, setDraws] = useState<any[]>([]);
  const [symbol, setSymbol] = useState("₴");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const countryId = user?.countryId ?? 1;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.draws.history(countryId),
      api.countries.get(countryId),
    ]).then(([d, c]) => {
      if (cancelled) return;
      setDraws(d);
      setSymbol(c?.currencySymbol ?? "₴");
    }).catch((err: any) => {
      if (cancelled) return;
      toast({ title: "Failed to load history", description: err.message, variant: "destructive" });
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [countryId]);

  const enriched = draws.map(d => ({
    ...d,
    myTicket: d.myEntry?.ticketNumber ?? null,
  }));

  const wins = enriched.filter(d => d.isWinner).length;
  const participated = enriched.filter(d => d.myEntry).length;

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
        <h1 className="font-bold text-lg">Draw History</h1>
      </div>

      <div className="px-4 md:px-6 pb-16 max-w-2xl mx-auto pt-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total draws", value: draws.length },
            { label: "My entries", value: participated },
            { label: "My wins", value: wins },
          ].map(({ label, value }) => (
            <div key={label} className="viona-card p-4 text-center">
              <p className="text-2xl font-black text-gradient-prize">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Draw list */}
        {draws.length === 0 ? (
          <div className="viona-card p-12 text-center">
            <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground text-sm">No completed draws yet in your market.</p>
            <p className="text-xs text-muted-foreground mt-1">Check back after the first draw runs!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {enriched.map(draw => (
              <DrawCard key={draw.id} draw={draw} symbol={symbol} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
