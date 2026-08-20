import { useEffect, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, AlertTriangle, AlertCircle, Info, Check } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listNotifications, markNotificationsRead } from "@/lib/faktero/notifications.functions";
import type { AppNotification, NotificationSeverity } from "@/lib/faktero/notifications";

const IKONA: Record<NotificationSeverity, typeof Info> = {
  danger: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const FARBA: Record<NotificationSeverity, string> = {
  danger: "text-destructive",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-muted-foreground",
};

/** Ako často sa zvonček sám prezrie. Notifikácie nie sú nič, čo horí na sekundy. */
const OBNOVA_MS = 5 * 60 * 1000;

/**
 * `className` sa pridáva k tlačidlu, nie nahrádza — na zelenej lište v telefóne
 * musí byť zvonček biely a sivá farba by sa na nej stratila.
 */
export function NotificationBell({ className = "" }: { className?: string } = {}) {
  const nacitaj = useServerFn(listNotifications);
  const oznac = useServerFn(markNotificationsRead);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const obnov = useCallback(async () => {
    const cid = getActiveCompanyId();
    if (!cid) {
      setLoading(false);
      return;
    }
    try {
      const r = await nacitaj({ data: { company_id: cid } });
      setItems(r.items);
      setUnread(r.unread);
    } catch {
      // Zvonček je vedľajšia vec — keď sa nenačíta, nesmie zhodiť hlavičku.
    } finally {
      setLoading(false);
    }
  }, [nacitaj]);

  useEffect(() => {
    obnov();
    const t = setInterval(obnov, OBNOVA_MS);
    return () => clearInterval(t);
  }, [obnov]);

  async function oznacVsetko() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    // Najprv v obrazovke, nech to nepôsobí zaseknuto; server dobehne.
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try {
      await oznac({ data: { company_id: cid } });
    } catch {
      obnov();
    }
  }

  async function oznacJednu(key: string) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setItems((prev) => prev.map((n) => (n.key === key ? { ...n, read: true } : n)));
    setUnread((n) => Math.max(0, n - 1));
    try {
      await oznac({ data: { company_id: cid, keys: [key] } });
    } catch {
      obnov();
    }
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) obnov();
      }}
    >
      <DropdownMenuTrigger
        aria-label={unread > 0 ? `Notifikácie (${unread} neprečítaných)` : "Notifikácie"}
        className={`relative grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary ${className}`}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[16px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-4 text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Notifikácie</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={oznacVsetko}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Check className="h-3 w-3" /> Označiť ako prečítané
            </button>
          )}
        </div>

        <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
          {loading ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Načítavam…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nič nové. Všetko je vybavené.
            </p>
          ) : (
            items.map((n) => {
              const Ikona = IKONA[n.severity];
              return (
                <Link
                  key={n.key}
                  to={n.to}
                  onClick={() => {
                    setOpen(false);
                    if (!n.read) oznacJednu(n.key);
                  }}
                  className={`flex gap-2.5 border-b border-border/60 px-3 py-2.5 last:border-b-0 hover:bg-secondary ${
                    n.read ? "opacity-60" : ""
                  }`}
                >
                  <Ikona className={`mt-0.5 h-4 w-4 shrink-0 ${FARBA[n.severity]}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">{n.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{n.detail}</span>
                  </span>
                  {!n.read && (
                    <span
                      aria-hidden
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 self-start rounded-full bg-primary"
                    />
                  )}
                </Link>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
