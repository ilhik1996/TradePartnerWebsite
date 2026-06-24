import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Bell, Trophy, Wallet, Info, CheckCheck, ShieldCheck, ShieldX, CreditCard, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

const NOTIF_ICONS: Record<string, any> = {
  winner:                     { icon: Trophy,        color: "text-amber-400",          bg: "bg-amber-400/10" },
  draw_result:                { icon: Info,           color: "text-primary",            bg: "bg-primary/10" },
  balance_low:                { icon: Wallet,         color: "text-muted-foreground",   bg: "bg-muted" },
  kyc_approved:               { icon: ShieldCheck,    color: "text-green-400",          bg: "bg-green-500/10" },
  kyc_rejected:               { icon: ShieldX,        color: "text-red-400",            bg: "bg-red-500/10" },
  payment_failed:             { icon: AlertTriangle,  color: "text-red-400",            bg: "bg-red-500/10" },
  subscription_created:       { icon: CreditCard,     color: "text-accent",             bg: "bg-accent/10" },
  subscription_renewal_failed:{ icon: AlertTriangle,  color: "text-amber-400",          bg: "bg-amber-400/10" },
  withdrawal_processed:       { icon: Wallet,         color: "text-green-400",          bg: "bg-green-500/10" },
  withdrawal_rejected:        { icon: AlertTriangle,  color: "text-red-400",            bg: "bg-red-500/10" },
};

function timeAgo(dateStr: string | undefined) {
  if (!dateStr) return "";
  const ms = new Date(dateStr).getTime();
  if (isNaN(ms)) return "";
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Notifications() {
  const { toast } = useToast();
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.notifications.list()
      .then(setNotifs)
      .catch((err: any) => toast({ title: "Failed to load notifications", description: err.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const markAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setNotifs(ns => ns.map(n => ({ ...n, isRead: true })));
    } catch {
      // best-effort
    }
  };

  const markRead = async (id: number) => {
    try {
      await api.notifications.markRead(id);
      setNotifs(ns => ns.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch {
      // best-effort
    }
  };

  const unreadCount = notifs.filter(n => !n.isRead).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="viona-nav sticky top-0 z-50 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="text-muted-foreground">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="font-bold text-lg">Notifications</h1>
          {unreadCount > 0 && (
            <span className="bg-primary text-white text-xs font-bold rounded-full px-2 py-0.5">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-primary text-xs h-8"
            onClick={markAllRead}
          >
            <CheckCheck className="w-3.5 h-3.5 mr-1" />
            Mark all read
          </Button>
        )}
      </div>

      <div className="px-4 md:px-6 pb-16 max-w-2xl mx-auto pt-4 space-y-2">
        {notifs.length === 0 && (
          <div className="viona-card p-12 text-center">
            <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground text-sm">No notifications yet</p>
          </div>
        )}

        {notifs.map(n => {
          const meta = NOTIF_ICONS[n.type] ?? NOTIF_ICONS.draw_result;
          const Icon = meta.icon;
          return (
            <button
              key={n.id}
              onClick={() => !n.isRead && markRead(n.id)}
              className={`w-full viona-card p-4 flex items-start gap-3 text-left transition-all ${
                !n.isRead ? "border-primary/20 bg-primary/3" : "opacity-70"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center shrink-0 ${meta.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{n.title}</p>
                  {!n.isRead && (
                    <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
                <p className="text-xs text-muted-foreground mt-1">{timeAgo(n.createdAt)}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
