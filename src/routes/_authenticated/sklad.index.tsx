import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { getStockDashboard } from "@/lib/faktero/stock.functions";
import { Warehouse, AlertTriangle, Package, TrendingUp, ArrowRight, ScanLine } from "lucide-react";
import { useMenaFirmy } from "@/lib/faktero/krajina-firmy";
import { formatujCislo, formatujMenu } from "@/lib/faktero/mena";
import { hodnotaPohybu, pohybNazov, pohybText } from "@/lib/faktero/stock-pohyb";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/sklad/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Sklad — Faktero") }] }),
  component: SkladDashboard,
});

function SkladDashboard() {
  const { t } = useT();
  const mena = useMenaFirmy();
  const fetch = useServerFn(getStockDashboard);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) {
      setLoading(false);
      return;
    }
    fetch({ data: { company_id: cid } })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [fetch]);

  return (
    <>
      <PageHeader
        title={t("Skladové hospodárstvo")}
        description={t("Prehľad stavu skladu, položiek a posledných pohybov.")}
      />
      <PageBody>
        {loading ? (
          <div className="text-sm text-muted-foreground">{t("Načítavam…")}</div>
        ) : !data ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {t("Žiadne dáta.")}{" "}
            <Link to="/sklad/nastavenia" className="text-primary hover:underline">
              {t("Vytvorte sklad")}
            </Link>
            .
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Stat
                icon={Package}
                label="Skladové položky"
                value={String(data.total_items)}
                accent="text-primary"
              />
              <Stat
                icon={TrendingUp}
                label="Hodnota skladu"
                value={formatujMenu(data.total_value, mena.kod)}
                accent="text-emerald-700"
              />
              <Stat
                icon={AlertTriangle}
                label="Pod minimom"
                value={String(data.below_min_count)}
                accent={data.below_min_count ? "text-amber-700" : "text-muted-foreground"}
              />
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <Card title="Položky pod minimálnym stavom">
                {data.below_min_items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("Všetky položky majú dostatočný stav.")}
                  </p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {data.below_min_items.map((it: any) => (
                      <li key={it.id} className="flex items-center justify-between gap-3 py-2">
                        <Link
                          to="/sklad/produkty/$id"
                          params={{ id: it.id }}
                          className="min-w-0 truncate hover:text-primary hover:underline"
                        >
                          {it.name ?? it.sku ?? "—"}
                          {it.name && it.sku && (
                            <span className="ml-1 text-xs text-muted-foreground">{it.sku}</span>
                          )}
                        </Link>
                        <span className="whitespace-nowrap tabular-nums text-amber-700">
                          {formatujCislo(it.current, 0, 2)} / {formatujCislo(it.min, 0, 2)}{" "}
                          {it.unit ?? ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  to="/sklad/produkty"
                  className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  {t("Spravovať položky")} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Card>
              <Card title="Posledné pohyby">
                {data.recent_movements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("Zatiaľ žiadne pohyby.")}</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {data.recent_movements.map((m: any) => (
                      <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                        <Link
                          to="/sklad/pohyby/$id"
                          params={{ id: m.id }}
                          className="min-w-0 hover:text-primary"
                        >
                          <div className="truncate font-medium hover:underline">
                            {m.name ?? m.sku ?? "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {t(pohybNazov(m.type))} ·{" "}
                            {new Date(m.created_at).toLocaleDateString("sk-SK")}
                          </div>
                        </Link>
                        <div className="text-right">
                          <div className="whitespace-nowrap tabular-nums">
                            {pohybText(m.type, m.quantity)} {m.unit ?? ""}
                          </div>
                          <div className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                            {formatujMenu(hodnotaPohybu(m), mena.kod)}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  to="/sklad/pohyby"
                  className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  {t("Všetky pohyby")} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Card>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <QuickLink to="/sklad/prijem" label="Príjem na sklad" />
              <QuickLink to="/sklad/vydaj" label="Výdaj zo skladu" />
              <QuickLink to="/sklad/presuny" label="Presuny" />
              <QuickLink to="/sklad/dodaci-list" label="Naskenovať dodací list" icon={ScanLine} />
              <QuickLink to="/sklad/inventura" label="Inventúra" />
              <QuickLink to="/sklad/hodnota" label="Hodnota skladu" />
              <QuickLink to="/sklad/minimum" label="Pod minimom" />
              <QuickLink to="/sklad/import" label="Import (CSV, XLSX)" />
              <QuickLink to="/sklad/dodacie-listy" label="História skenov DL" />
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: string;
  accent?: string;
}) {
  const { t } = useT();
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{t(label)}</span>
        <Icon className={`h-4 w-4 ${accent ?? ""}`} />
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useT();
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Warehouse className="h-4 w-4 text-primary" />
        {t(title)}
      </div>
      {children}
    </div>
  );
}

function QuickLink({ to, label, icon: Icon }: { to: string; label: string; icon?: any }) {
  const { t } = useT();
  return (
    <Link
      to={to as any}
      className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium shadow-sm hover:border-primary/40 hover:bg-secondary/40"
    >
      <span className="inline-flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-primary" />}
        {t(label)}
      </span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
