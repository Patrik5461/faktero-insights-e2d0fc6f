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
import {
  kluceNaPrecitanie,
  textNotifikacie,
  type AppNotification,
  type NotificationSeverity,
} from "@/lib/faktero/notifications";
import { useT } from "@/lib/i18n/useT";

const IKONA: Record<NotificationSeverity, typeof Info> = {
  danger: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const FARBA: Record<NotificationSeverity, string> = {
  danger: "text-destructive",
  warning: "text-amber-700 dark:text-amber-400",
  info: "text-muted-foreground",
};

/** Ako často sa zvonček sám prezrie. Notifikácie nie sú nič, čo horí na sekundy. */
const OBNOVA_MS = 5 * 60 * 1000;

/**
 * `className` sa pridáva k tlačidlu, nie nahrádza — na zelenej lište v telefóne
 * musí byť zvonček biely a sivá farba by sa na nej stratila.
 */
export function NotificationBell({ className = "" }: { className?: string } = {}) {
  const { t } = useT();
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
    const casovac = setInterval(obnov, OBNOVA_MS);
    return () => clearInterval(casovac);
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

  async function oznacJednu(n: AppNotification) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const key = n.key;
    setItems((prev) => prev.map((x) => (x.key === key ? { ...x, read: true } : x)));
    setUnread((x) => Math.max(0, x - 1));
    try {
      // Zlúčená položka („3 nové eFaktúry“) sa prečíta aj za svojich členov.
      await oznac({ data: { company_id: cid, keys: kluceNaPrecitanie([n]) } });
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
        aria-label={unread > 0 ? t("Notifikácie ({n} neprečítaných)", { n: unread }) : t("Notifikácie")}
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
          <span className="text-sm font-medium">{t("Notifikácie")}</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={oznacVsetko}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Check className="h-3 w-3" /> {t("Označiť ako prečítané")}
            </button>
          )}
        </div>

        <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
          {loading ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("Načítavam…")}</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t("Nič nové. Všetko je vybavené.")}
            </p>
          ) : (
            items.map((n) => {
              const Ikona = IKONA[n.severity];
              return (
                <Link
                  key={n.key}
                  to={n.to}
                  search={n.search as any}
                  onClick={() => {
                    setOpen(false);
                    if (!n.read) oznacJednu(n);
                  }}
                  className={`flex gap-2.5 border-b border-border/60 px-3 py-2.5 last:border-b-0 hover:bg-secondary ${
                    n.read ? "opacity-60" : ""
                  }`}
                >
                  <Ikona className={`mt-0.5 h-4 w-4 shrink-0 ${FARBA[n.severity]}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">{textNotifikacie(n, "title", t)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{textNotifikacie(n, "detail", t)}</span>
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
        {/* Schválenie, komentáre a nespracované doklady na jednej stránke. */}
        <Link
          to="/moje-ulohy"
          onClick={() => setOpen(false)}
          className="block border-t border-border px-3 py-2 text-center text-xs font-medium text-primary hover:bg-secondary"
        >
          {t("Všetky moje úlohy →")}
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
