import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  apiStatistika,
  dsoPrehladu,
  metrikyPrehladu,
  miestnyDatum,
  normalizujPrehlad,
  PRAZDNY_PREHLAD,
  type KosVeku,
  type PrehladSuhrn,
} from "@/lib/faktero/prehlad-suhrn";
import { mnozne } from "@/lib/faktero/mnozne";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { useServerFn } from "@tanstack/react-start";
import { getRecurringWidgetStats } from "@/lib/faktero/recurring.functions";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { UpozornenieKleinunternehmer } from "@/components/faktero/UpozornenieKleinunternehmer";
import { PrenosFakturyZadarmo } from "@/components/faktero/PrenosFakturyZadarmo";
import { BankWidget } from "@/components/faktero/BankWidget";
import { AutoUctovanieWidget } from "@/components/faktero/AutoUctovanieWidget";
import { VynosyNakladyPanel } from "@/components/faktero/VynosyNakladyPanel";
import { formatujMenu } from "@/lib/faktero/mena";
import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";
import { agendaPreKrajinu } from "@/lib/faktero/agendy-krajiny";
import {
  Plus,
  FileText,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Wallet,
  HandCoins,
  Activity,
  KeyRound,
  Webhook,
  Users,
  Repeat,
  Receipt,
  Calculator,
  Sparkles,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  Send,
  Ban,
  FilePlus2,
  ClipboardList,
  Package,
  Car,
} from "lucide-react";
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { rezimFirmy } from "@/lib/faktero/dph-rezim";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk ?? "sk", "Prehľad — Faktero") }] }),
  component: Dashboard,
});

/*
  Súčty na prehľade sú v domácej mene firmy (SK eurá, CZ koruny). Prehľad je
  jedna stránka, takže mena sa nastaví pri jeho vykreslení a podkomponenty ju
  len čítajú.
*/
let menaPrehladu = "EUR";

function fmt(n: number, currency: string | null | undefined = menaPrehladu) {
  return formatujMenu(n, currency || menaPrehladu);
}

function fmtCompact(n: number) {
  return new Intl.NumberFormat("sk-SK", { notation: "compact", maximumFractionDigits: 1 }).format(
    n,
  );
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Koncept",
  issued: "Vystavené",
  sent: "Odoslané",
  paid: "Zaplatené",
  overdue: "Po splatnosti",
  cancelled: "Stornované",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "oklch(0.80 0.02 250)",
  issued: "oklch(0.70 0.12 240)",
  sent: "oklch(0.85 0.13 85)",
  paid: "oklch(0.68 0.16 162)",
  overdue: "var(--destructive)",
  cancelled: "oklch(0.60 0.02 250)",
};

function useCountdown(target: Date) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, target.getTime() - now.getTime());
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff / 3600000) % 24);
  const mins = Math.floor((diff / 60000) % 60);
  const secs = Math.floor((diff / 1000) % 60);
  return { days, hours, mins, secs };
}

function Dashboard() {
  const { t } = useT();
  /* Slovenské povinnosti sa českej firme neponúkajú. */
  const krajina = useKrajinaDane();
  menaPrehladu = krajina === "CZ" ? "CZK" : "EUR";
  /* Súčty počíta databáza (`prehlad_suhrn`); tu sú len posledné záznamy do aktivity. */
  const [suhrn, setSuhrn] = useState<PrehladSuhrn>(PRAZDNY_PREHLAD);
  const [allInvoices, setAllInvoices] = useState<any[]>([]);
  const [activeRecurring, setActiveRecurring] = useState<any[]>([]);
  const [recurringStats, setRecurringStats] = useState<{
    last_success_at: string | null;
    next_run: string | null;
    failed_24h: number;
    active_templates: number;
  } | null>(null);
  const fetchRecurringStats = useServerFn(getRecurringWidgetStats);
  const [pendingQuotes, setPendingQuotes] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [company, setCompany] = useState<any | null>(null);
  const [apiLogs, setApiLogs] = useState<any[]>([]);
  const [apiKeysCount, setApiKeysCount] = useState(0);
  const [webhooksCount, setWebhooksCount] = useState(0);
  const [webhookDeliveries, setWebhookDeliveries] = useState<any[]>([]);
  const [lastTrip, setLastTrip] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const companyId = getActiveCompanyId();
    if (!companyId) return;
    (async () => {
      const yearAgo = new Date();
      yearAgo.setMonth(yearAgo.getMonth() - 13);
      const yearAgoISO = yearAgo.toISOString().slice(0, 10);
      const polnoc = new Date();
      polnoc.setHours(0, 0, 0, 0);

      const [sum, inv, cust, comp, logs, keys, hooks, deliv, recur, quotesPend, trip] =
        await Promise.all([
          supabase.rpc("prehlad_suhrn" as any, {
            p_company_id: companyId,
            p_dnes: miestnyDatum(),
            p_mena: menaPrehladu,
            p_dnes_od: polnoc.toISOString(),
          } as any),
          // Len posledné faktúry do aktivity — súčty sú v `prehlad_suhrn`.
          supabase
            .from("invoices")
            .select("id, invoice_number, customer_name, total, currency, status, paid_at, created_at")
            .eq("company_id", companyId)
            .is("deleted_at", null)
            .gte("issue_date", yearAgoISO)
            .order("created_at", { ascending: false })
            .limit(30),
          supabase
            .from("customers")
            .select("id, name, created_at")
            .eq("company_id", companyId)
            .eq("odberatel", true)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
          supabase
            .from("api_logs")
            .select("id, status, created_at, path")
            .eq("company_id", companyId)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("api_keys")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .is("revoked_at", null),
          supabase
            .from("webhooks")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("active", true),
          supabase
            .from("webhook_delivery_logs")
            .select("id, event_type, response_status, created_at")
            .eq("company_id", companyId)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("recurring_invoices")
            .select("id, name, customer_name, frequency, next_run, total, currency")
            .eq("company_id", companyId)
            .is("deleted_at", null)
            .eq("active", true)
            .order("next_run", { ascending: true })
            .limit(5),
          supabase
            .from("quotes")
            .select("id, quote_number, customer_name, total, currency, valid_until, status")
            .eq("company_id", companyId)
            // Zmazaná ponuka na prehľade nemá čo robiť. Bez tohto tam visela
            // aj po vymazaní zo zoznamu ponúk.
            .is("deleted_at", null)
            .in("status", ["draft", "sent"])
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("trips")
            .select("trip_date, distance_km, start_location, end_location")
            .eq("company_id", companyId)
            .order("trip_date", { ascending: false })
            .limit(1),
        ]);

      if (sum.error) console.error("[prehlad_suhrn]", sum.error);
      setSuhrn(normalizujPrehlad(sum.data));
      setAllInvoices(inv.data ?? []);
      setCustomers(cust.data ?? []);
      setCompany(comp.data ?? null);
      setApiLogs(logs.data ?? []);
      setApiKeysCount(keys.count ?? 0);
      setWebhooksCount(hooks.count ?? 0);
      setWebhookDeliveries(deliv.data ?? []);
      setActiveRecurring(recur.data ?? []);
      setPendingQuotes(quotesPend.data ?? []);
      setLastTrip(trip.data?.[0] ?? null);
      setLoading(false);
    })();
    fetchRecurringStats()
      .then(setRecurringStats)
      .catch(() => {});
  }, []);

  /*
    Súčty, grafy a splatnosti sú v domácej mene firmy. Faktúra v cudzej mene
    ide do súčtu prepočítaná (sumy `*_eur` nesú domácu menu firmy) — to robí
    `prehlad_suhrn` podľa `p_mena`.
  */
  const metrics = useMemo(() => metrikyPrehladu(suhrn), [suhrn]);
  const payables = loading
    ? null
    : {
        unpaid: suhrn.zavazky_neuhradene,
        overdueCount: suhrn.zavazky_po_splatnosti,
        count: suhrn.zavazky_pocet,
      };
  const lowStockCount = suhrn.sklad_pod_minimom;
  const tripStats = loading ? null : { km_month: suhrn.km_mesiac, last: lastTrip };
  const statusData = useMemo(
    () => buildStatusDistribution(suhrn.stavy).map((d) => ({ ...d, name: t(d.name) })),
    [suhrn, t],
  );
  const topDebtors = useMemo(
    () => suhrn.dlznici.map((d) => ({ name: d.meno, amount: d.suma, neznamy: !d.meno })),
    [suhrn],
  );
  const activity = useMemo(
    () => buildActivity(allInvoices, customers, webhookDeliveries, apiLogs),
    [allInvoices, customers, webhookDeliveries, apiLogs],
  );
  const apiStats = useMemo(() => apiStatistika(suhrn), [suhrn]);
  const agingReceivables = useMemo(() => buildAging(suhrn.vek_pohladavok), [suhrn]);
  const agingPayables = useMemo(() => buildAging(suhrn.vek_zavazkov), [suhrn]);
  const dso = useMemo(() => dsoPrehladu(suhrn), [suhrn]);
  const forecast = useMemo(() => buildCashflowForecast(suhrn.vyhlad), [suhrn]);

  const countdown = useCountdown(new Date("2027-01-01T00:00:00"));

  const isEmpty = !loading && suhrn.pocet_faktur === 0;
  const hasPaidInvoice = suhrn.ma_zaplatenu;

  return (
    <>
      <PageHeader
        title={t("Prehľad")}
        description={t("Finančný prehľad vašej firmy v reálnom čase.")}
        /*
          Rýchle akcie sú v tlačidle „Vytvoriť" v hornej lište — to isté štyri
          razy nad každou stránkou nemá kde byť. Zoznam v lište je nadmnožinou
          tohto: má aj rýchlu faktúru a nový produkt.
        */
      />
      <PageBody>
        {/* Nemecký Kleinunternehmer: obrat blízko hranice § 19 UStG. */}
        <UpozornenieKleinunternehmer firma={company} />
        {/* Faktúra z verejnej stránky „Faktúra zadarmo“ — jedným kliknutím koncept. */}
        <PrenosFakturyZadarmo />
        {isEmpty ? (
          <EmptyDashboard />
        ) : (
          <>
            {/* Overview stat strip */}
            <StatStrip metrics={metrics} loading={loading} />

            {/* CRM: Aging + DSO + Forecast */}
            <div className="grid gap-6 lg:grid-cols-2">
              <AgingPanel
                title="Vek pohľadávok"
                icon={HandCoins}
                buckets={agingReceivables}
                loading={loading}
              />
              <AgingPanel
                title="Vek záväzkov"
                icon={TrendingDown}
                buckets={agingPayables}
                loading={loading}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <DsoCard dso={dso} loading={loading} hasPaid={hasPaidInvoice} />
              <ForecastPanel rows={forecast} loading={loading} className="lg:col-span-2" />
            </div>
          </>
        )}

        <div className="mt-6">
          <BankWidget />
        </div>

        {/*
          Výnosy a náklady po mesiacoch — nahradili graf „Obrat (12 mesiacov)",
          ktorý ukazoval len vystavené faktúry. Načítava si vlastné obdobie.
        */}
        {getActiveCompanyId() && (
          <div className="mt-6">
            <VynosyNakladyPanel companyId={getActiveCompanyId()!} />
          </div>
        )}

        {/* SECOND ROW */}
        <div className="grid gap-6 lg:grid-cols-4">
          <Panel title="Pohľadávky" icon={HandCoins}>
            <Row label="Celkové pohľadávky" value={fmt(metrics.receivables)} strong />
            <Row label="Po splatnosti" value={fmt(metrics.overdueAmount)} tone="destructive" />
            <Row
              label="Priemerná doba úhrady"
              value={
                metrics.avgPayDays === null
                  ? "—"
                  : t("{n} dní", { n: Math.round(metrics.avgPayDays) })
              }
            />
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-1.5 text-[12px] text-muted-foreground">{t("Najväčší dlžníci")}</div>
              {topDebtors.length === 0 ? (
                <div className="text-xs text-muted-foreground">{t("Žiadni dlžníci.")}</div>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {topDebtors.map((d) => (
                    <li key={d.name} className="flex items-center justify-between">
                      <span className="truncate">{d.neznamy ? t("Neznámy") : d.name}</span>
                      <span className="ml-2 font-medium tabular-nums">{fmt(d.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>

          <Panel title="DPH prehľad" icon={Receipt}>
            <Row label="DPH na odvod" value={fmt(metrics.vatOut)} />
            <Row label="DPH na odpočet (prijaté faktúry)" value={fmt(metrics.vatIn)} />
            <Row
              label="Rozdiel"
              value={fmt(metrics.vatOut - metrics.vatIn)}
              strong
              tone={metrics.vatOut - metrics.vatIn > 0 ? "destructive" : undefined}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              {/* Platiteľ podľa režimu firmy, nie podľa IČ DPH — Kleinunternehmer či § 7 ho majú tiež. */}
              {company && rezimFirmy(company).platitel ? t("Ste platiteľ DPH.") : t("Nie ste platiteľ DPH.")}
            </p>
          </Panel>

          <Panel title="Daňový odhad" icon={Calculator}>
            <Row label="Príjmy (rok)" value={fmt(metrics.yearIncome)} />
            <Row label="Výdavky (prijaté faktúry)" value={fmt(metrics.yearExpenses)} />
            <Row
              label="Odhad základu dane"
              value={fmt(Math.max(0, metrics.yearIncome - metrics.yearExpenses))}
              strong
            />
            <p className="mt-3 text-xs text-muted-foreground">
              {t("Indikatívny výpočet — nenahrádza účtovníka.")}
            </p>
          </Panel>

          <Panel title="Záväzky" icon={TrendingDown}>
            <Row label="Neuhradené prijaté faktúry" value={fmt(payables?.unpaid ?? 0)} strong />
            <Row
              label="Po splatnosti"
              value={String(payables?.overdueCount ?? 0)}
              tone={(payables?.overdueCount ?? 0) > 0 ? "destructive" : undefined}
            />
            <Row label="Evidovaných spolu" value={String(payables?.count ?? 0)} />
            <div className="mt-3 border-t border-border pt-3">
              <Link
                to="/prijate-faktury"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {t("Otvoriť prijaté faktúry")} <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </Panel>
        </div>

        {/* THIRD ROW */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/*
            Odpočet do 1. 1. 2027 je slovenská povinnosť a odkaz vedie na
            eFaktúru cez slovenskú schému Peppol. Českej firme by sľuboval
            niečo, čo sa jej netýka a čo jej ani nepôjde použiť.
          */}
          {krajina === "SK" && (
            <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6">
              <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary/20 blur-3xl" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">{t("eFaktúra 2027")}</h3>
                  </div>
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-400">
                    {t("Pripravujeme")}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{t("Povinná eFaktúra od 1.1.2027")}</p>
                <div className="mt-5 grid grid-cols-4 gap-2">
                  {[
                    { v: countdown.days, l: "dní" },
                    { v: countdown.hours, l: "hod" },
                    { v: countdown.mins, l: "min" },
                    { v: countdown.secs, l: "sek" },
                  ].map((x) => (
                    <div
                      key={x.l}
                      className="rounded-xl border border-border bg-card/60 px-2 py-3 text-center backdrop-blur"
                    >
                      <div className="text-2xl font-bold tabular-nums">
                        {String(x.v).padStart(2, "0")}
                      </div>
                      <div className="text-[12px] text-muted-foreground">{t(x.l)}</div>
                    </div>
                  ))}
                </div>
                <Link
                  to="/efaktura"
                  className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  {t("Zobraziť eFaktúru")} <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          )}

          <Panel title="Rozdelenie faktúr" icon={Activity}>
            {/* Graf je len obrázok k zoznamu pod ním — čítačka prečíta zoznam. */}
            <div className="h-72" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {statusData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-1 text-xs">
              {statusData.map((s) => (
                <li key={s.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                    {s.name}
                  </span>
                  <span className="font-medium tabular-nums">{s.value}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="API a integrácie" icon={KeyRound}>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Volania API dnes" value={String(apiStats.today)} icon={Activity} />
              <MiniStat label="Volania API za mesiac" value={String(apiStats.month)} icon={Activity} />
              <MiniStat
                label="Úspešnosť"
                value={`${apiStats.successRate.toFixed(1).replace(".", ",")} %`}
                icon={CheckCircle2}
              />
              <MiniStat label="Aktívne kľúče" value={String(apiKeysCount)} icon={KeyRound} />
              <MiniStat label="Aktívne webhooky" value={String(webhooksCount)} icon={Webhook} />
              <Link
                to="/api-kluce"
                className="flex items-center justify-center rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-medium hover:bg-muted/60"
              >
                {t("Spravovať API →")}
              </Link>
            </div>
          </Panel>
        </div>

        {/* ACTIVITY FEED */}
        <div className="mt-6">
          {getActiveCompanyId() && <AutoUctovanieWidget companyId={getActiveCompanyId()!} />}
          <div className="mb-6">
            <Link
              to="/sklad/produkty"
              search={{ filter: "low_stock" }}
              className={`group flex items-center justify-between rounded-2xl border p-5 transition-colors ${lowStockCount > 0 ? "border-amber-400/40 bg-amber-500/5 hover:bg-amber-500/10" : "border-border bg-card hover:bg-muted/30"}`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`grid h-12 w-12 place-items-center rounded-xl ${lowStockCount > 0 ? "bg-amber-500/15 text-amber-800 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}
                >
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{t("Nízky stav skladu")}</div>
                  <div className="text-xs text-muted-foreground">
                    {lowStockCount > 0
                      ? t(
                          mnozne(lowStockCount, [
                            "{n} položka pod minimom",
                            "{n} položky pod minimom",
                            "{n} položiek pod minimom",
                          ]),
                          { n: lowStockCount },
                        )
                      : t("Všetky položky nad minimálnym stavom.")}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className={`text-2xl font-bold tabular-nums ${lowStockCount > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
                >
                  {lowStockCount}
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </Link>
          </div>
          {/* Nemecká firma knihu jázd nemá (agendy-krajiny.ts). */}
          {agendaPreKrajinu("/jazdy", krajina) && (
          <div className="mb-6">
            <Link
              to="/jazdy"
              className="group flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Car className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{t("Kniha jázd")}</div>
                  <div className="text-xs text-muted-foreground">
                    {tripStats?.last
                      ? t("Posledná jazda {datum} · {odkial} → {kam}", {
                          datum: datumNaDoklade(tripStats.last.trip_date),
                          odkial: tripStats.last.start_location ?? "—",
                          kam: tripStats.last.end_location ?? "—",
                        })
                      : t("Zatiaľ žiadne jazdy.")}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-2xl font-bold tabular-nums">
                    {(tripStats?.km_month ?? 0).toFixed(1).replace(".", ",")}
                  </div>
                  <div className="text-[12px] text-muted-foreground">{t("km tento mesiac")}</div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </Link>
          </div>
          )}
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <Panel title="Opakované faktúry" icon={Repeat}>
              <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg border border-border bg-muted/30 px-2 py-1.5">
                  <div className="text-muted-foreground">{t("Posledný beh")}</div>
                  <div className="mt-0.5 font-medium">
                    {recurringStats?.last_success_at
                      ? new Date(recurringStats.last_success_at).toLocaleString("sk-SK")
                      : "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 px-2 py-1.5">
                  <div className="text-muted-foreground">{t("Najbližší beh")}</div>
                  <div className="mt-0.5 font-medium">{recurringStats?.next_run ?? "—"}</div>
                </div>
                <div
                  className={`rounded-lg border px-2 py-1.5 ${(recurringStats?.failed_24h ?? 0) > 0 ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/30"}`}
                >
                  <div className="text-muted-foreground">{t("Chyby (24h)")}</div>
                  <div className="mt-0.5 font-medium tabular-nums">
                    {recurringStats?.failed_24h ?? 0}
                  </div>
                </div>
              </div>
              {activeRecurring.length === 0 ? (
                <div className="py-4 text-sm text-muted-foreground">
                  {t("Žiadne aktívne šablóny.")}{" "}
                  <Link to="/opakovane/nova" className="text-primary underline underline-offset-2">
                    {t("Vytvoriť")}
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {activeRecurring.map((r) => (
                    <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                      <div className="min-w-0">
                        <Link
                          to="/opakovane/$id"
                          params={{ id: r.id }}
                          className="truncate font-medium hover:underline"
                        >
                          {r.name}
                        </Link>
                        <div className="truncate text-xs text-muted-foreground">
                          {t("{odberatel} · ďalší beh {datum}", {
                            odberatel: r.customer_name ?? "—",
                            datum: datumNaDoklade(r.next_run),
                          })}
                        </div>
                      </div>
                      <div className="shrink-0 font-medium tabular-nums">
                        {fmt(Number(r.total), r.currency)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to="/opakovane"
                className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
              >
                {t("Zobraziť všetky →")}
              </Link>
            </Panel>
            <Panel title="Ponuky čakajúce na odpoveď" icon={ClipboardList}>
              {pendingQuotes.length === 0 ? (
                <div className="py-4 text-sm text-muted-foreground">
                  {t("Žiadne otvorené ponuky.")}{" "}
                  <Link to="/ponuky/nova" className="text-primary underline underline-offset-2">
                    {t("Vytvoriť")}
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {pendingQuotes.map((q) => (
                    <li key={q.id} className="flex items-center justify-between py-2.5 text-sm">
                      <div className="min-w-0">
                        <Link
                          to="/ponuky/$id"
                          params={{ id: q.id }}
                          className="truncate font-medium hover:underline"
                        >
                          {q.quote_number}
                        </Link>
                        <div className="truncate text-xs text-muted-foreground">
                          {t("{odberatel} · platná do {datum}", {
                            odberatel: q.customer_name ?? "—",
                            datum: datumNaDoklade(q.valid_until),
                          })}
                        </div>
                      </div>
                      <div className="shrink-0 font-medium tabular-nums">
                        {fmt(Number(q.total), q.currency)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to="/ponuky"
                className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
              >
                {t("Zobraziť všetky →")}
              </Link>
            </Panel>
          </div>
          <Panel title="Posledná aktivita" icon={Activity}>
            {activity.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {loading ? t("Načítavam…") : t("Zatiaľ žiadna aktivita.")}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {activity.map((a, i) => (
                  <li key={i} className="flex items-center gap-3 py-2.5">
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${a.tone}`}
                    >
                      <a.icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{t(a.title, a.titleP)}</div>
                      <div className="truncate text-xs text-muted-foreground">{t(a.subtitle, a.subtitleP)}</div>
                    </div>
                    <time className="shrink-0 text-xs text-muted-foreground">{a.time}</time>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </PageBody>
    </>
  );
}

/* ---------- Sub-components ---------- */

function QuickAction({
  to,
  search,
  icon: Icon,
  label,
  primary,
}: {
  to: string;
  /* Bez parametrov otvorí „Nový odberateľ" iba zoznam odberateľov — formulár
     sa otvára až na `?new=1`, rovnako ako z menu. */
  search?: Record<string, string>;
  icon: any;
  label: string;
  primary?: boolean;
}) {
  const { t } = useT();
  return (
    <Link
      to={to}
      search={search as any}
      className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
        primary
          ? "bg-primary text-primary-foreground hover:opacity-90"
          : "border border-border bg-card hover:bg-muted/60"
      }`}
    >
      <Icon className="h-4 w-4" /> {t(label)}
    </Link>
  );
}

function Delta({ pct }: { pct: number | null }) {
  if (pct === null || !isFinite(pct) || Math.abs(pct) < 0.05) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const up = pct > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-nums ${
        up ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"
      }`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(pct) >= 1000 ? "> 999" : Math.abs(pct).toFixed(1).replace(".", ",")} %
    </span>
  );
}

function Segment({
  label,
  value,
  meta,
  tone,
  className,
}: {
  label: string;
  value: string;
  meta?: ReactNode;
  tone?: "destructive" | "primary";
  className?: string;
}) {
  const { t } = useT();
  const valueTone =
    tone === "destructive" ? "text-destructive" : tone === "primary" ? "text-primary" : "";
  return (
    <div className={`min-w-0 px-5 py-4 ${className ?? ""}`}>
      <div className="text-xs text-muted-foreground">{t(label)}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueTone}`}>{value}</div>
      <div className="mt-1 min-h-4 text-xs text-muted-foreground">{meta}</div>
    </div>
  );
}

/**
 * Štyri hlavné čísla.
 *
 * Predtým to bol jeden pás rozdelený linkami. Karty sú zvlášť, lebo pás sa na
 * úzkom okne zlomil na dva riadky a bez rámu nebolo poznať, kde jedno číslo
 * končí a druhé začína.
 *
 * Ikona vpravo hore nesie **stav, nie ozdobu**: červená je len vtedy, keď je
 * hodnota naozaj problém (niečo je po splatnosti). Keby červenala vždy, prestala
 * by niečo znamenať.
 */
function StatStrip({ metrics, loading }: { metrics: any; loading: boolean }) {
  const { t } = useT();
  const faktur = (n: number) =>
    t(mnozne(n, ["{n} faktúra", "{n} faktúry", "{n} faktúr"]), { n });
  const odberatelov = (n: number) =>
    t(mnozne(n, ["{n} odberateľ", "{n} odberatelia", "{n} odberateľov"]), { n });
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border bg-card p-4">
            <div className="h-3 w-24 animate-pulse rounded bg-muted/60" />
            <div className="h-7 w-32 animate-pulse rounded bg-muted/60" />
            <div className="h-3 w-20 animate-pulse rounded bg-muted/60" />
          </div>
        ))}
      </div>
    );
  }

  const revenueDelta = metrics.prevMonthRevenue > 0 ? (metrics.monthRevenueDelta as number) : null;
  const jePoSplatnosti = metrics.overdueAmount > 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiKarta
        label="Obrat tento mesiac"
        value={fmt(metrics.monthRevenue)}
        icon={TrendingUp}
        meta={<Delta pct={revenueDelta} />}
      />
      <KpiKarta
        label="Neuhradené"
        value={fmt(metrics.unpaidAmount)}
        icon={FileText}
        meta={faktur(metrics.unpaidCount)}
      />
      <KpiKarta
        label="Po splatnosti"
        value={fmt(metrics.overdueAmount)}
        icon={AlertTriangle}
        stav={jePoSplatnosti ? "zle" : "pokoj"}
        meta={`${faktur(metrics.overdueCount)} · ${odberatelov(metrics.debtorCount)}`}
      />
      <KpiKarta
        label="Dlžia mi zákazníci"
        value={fmt(metrics.receivables)}
        icon={HandCoins}
        meta={
          <Link
            to="/faktury"
            search={{ neuhradene: true } as any}
            className="inline-flex items-center gap-1 hover:underline"
          >
            {t("Zobraziť pohľadávky")} <ArrowUpRight className="h-3 w-3" />
          </Link>
        }
      />
    </div>
  );
}

function KpiKarta({
  label,
  value,
  icon: Icon,
  meta,
  stav = "pokoj",
}: {
  label: string;
  value: string;
  icon: any;
  meta?: ReactNode;
  /** `zle` zafarbí ikonu načerveno — inak ostáva neutrálna. */
  stav?: "pokoj" | "zle";
}) {
  const { t } = useT();
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] text-muted-foreground">{t(label)}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        </div>
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
            stav === "zle" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      {meta && <div className="mt-2 text-[12px] text-muted-foreground">{meta}</div>}
    </div>
  );
}

function EmptyDashboard() {
  const { t } = useT();
  return (
    <div className="rounded-xl border border-border bg-card px-6 py-16 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10">
        <HandCoins className="h-5 w-5 text-primary" />
      </div>
      <h2 className="mt-4 text-base font-semibold">{t("Zatiaľ tu nie sú žiadne dáta")}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {t("Vystavte prvú faktúru a prehľad sa naplní obratom, pohľadávkami a cash flow predikciou.")}
      </p>
      <Link
        to="/faktury/nova"
        className="mt-5 inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        {t("Vytvoriť faktúru")}
      </Link>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon?: any;
  children: React.ReactNode;
  className?: string;
}) {
  const { t } = useT();
  return (
    /* Rovnaký jazyk ako KPI karty: 1px rám v plnej farbe, `rounded-xl` a 16
       bodov vnútri. Predtým 24 — pri dvoch kartách vedľa seba to na notebooku
       ubralo z obsahu celý stĺpec. */
    <div className={`min-w-0 rounded-xl border border-border bg-card p-4 ${className ?? ""}`}>
      <div className="mb-3 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        <h2 className="text-sm font-medium">{t(title)}</h2>
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "destructive";
}) {
  const { t } = useT();
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{t(label)}</span>
      <span
        className={`tabular-nums ${strong ? "font-semibold" : ""} ${tone === "destructive" ? "text-destructive" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function MiniStat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  const { t } = useT();
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Icon className="h-3 w-3" /> {t(label)}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  const map: Record<string, string> = {
    // Vystavená a odoslaná mali sivé pozadie splývajúce s plochou — v hlavičke
    // detailu aj v zozname pôsobili ako holý text.
    draft: "border border-border bg-muted text-muted-foreground",
    issued: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
    sent: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
    paid: "bg-primary/15 text-primary-hover",
    overdue: "bg-destructive/15 text-destructive",
    cancelled: "bg-muted text-muted-foreground line-through",
  };
  const label: Record<string, string> = {
    draft: "Koncept",
    issued: "Vystavená",
    sent: "Odoslaná",
    paid: "Uhradená",
    overdue: "Po splatnosti",
    cancelled: "Stornovaná",
  };
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-muted"}`}
    >
      {label[status] ? t(label[status]) : status}
    </span>
  );
}

/* ---------- Pure data helpers ---------- */

/** Výseky grafu stavov z počtov `prehlad_suhrn` (po splatnosti už z dátumu). */
function buildStatusDistribution(stavy: Record<string, number>) {
  const counts: Record<string, number> = {
    draft: 0,
    issued: 0,
    sent: 0,
    paid: 0,
    overdue: 0,
    cancelled: 0,
    ...stavy,
  };
  return Object.entries(counts).map(([k, v]) => ({
    name: STATUS_LABEL[k] ?? k,
    value: v,
    color: STATUS_COLOR[k] ?? "var(--muted-foreground)",
  }));
}

function buildActivity(invoices: any[], customers: any[], deliveries: any[], apiLogs: any[]) {
  type Item = {
    icon: any;
    tone: string;
    /** Slovenský kľúč prekladu; premenné v `titleP`/`subtitleP`. */
    title: string;
    titleP?: Record<string, string | number>;
    subtitle: string;
    subtitleP?: Record<string, string | number>;
    time: string;
    at: number;
  };
  const items: Item[] = [];
  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 60000;
    if (diff < 60) return `${Math.max(1, Math.floor(diff))} min`;
    if (diff < 1440) return `${Math.floor(diff / 60)} h`;
    return d.toLocaleDateString("sk-SK");
  };

  invoices.slice(0, 30).forEach((i) => {
    items.push({
      icon: FilePlus2,
      tone: "bg-primary/15 text-primary-hover",
      title: "Faktúra {cislo} vytvorená",
      titleP: { cislo: i.invoice_number },
      subtitle: "{v}",
      subtitleP: {
        v: `${i.customer_name ?? "—"} · ${fmt(Number(i.total), i.currency || menaPrehladu)}`,
      },
      time: fmtTime(i.created_at),
      at: new Date(i.created_at).getTime(),
    });
    if (i.status === "sent" || i.status === "paid") {
      items.push({
        icon: Send,
        tone: "bg-primary/15 text-primary-hover",
        title: "Faktúra {cislo} odoslaná",
        titleP: { cislo: i.invoice_number },
        subtitle: "{v}",
        subtitleP: { v: i.customer_name ?? "—" },
        time: fmtTime(i.created_at),
        at: new Date(i.created_at).getTime() + 1,
      });
    }
    if (i.status === "paid" && i.paid_at) {
      items.push({
        icon: CheckCircle2,
        tone: "bg-emerald-500/15 text-emerald-500",
        title: "Faktúra {cislo} zaplatená",
        titleP: { cislo: i.invoice_number },
        subtitle: "{v}",
        subtitleP: { v: fmt(Number(i.total), i.currency || menaPrehladu) },
        time: fmtTime(i.paid_at),
        at: new Date(i.paid_at).getTime(),
      });
    }
    if (i.status === "cancelled") {
      items.push({
        icon: Ban,
        tone: "bg-muted text-muted-foreground",
        title: "Faktúra {cislo} stornovaná",
        titleP: { cislo: i.invoice_number },
        subtitle: "{v}",
        subtitleP: { v: i.customer_name ?? "—" },
        time: fmtTime(i.created_at),
        at: new Date(i.created_at).getTime(),
      });
    }
  });

  customers.slice(0, 10).forEach((c) => {
    items.push({
      icon: Users,
      tone: "bg-purple-500/15 text-purple-500",
      title: "Nový odberateľ: {meno}",
      titleP: { meno: c.name },
      subtitle: "Vytvorený v systéme",
      time: fmtTime(c.created_at),
      at: new Date(c.created_at).getTime(),
    });
  });

  deliveries.slice(0, 10).forEach((w) => {
    items.push({
      icon: Webhook,
      tone: "bg-cyan-500/15 text-cyan-500",
      title: "Webhook {udalost}",
      titleP: { udalost: w.event_type ?? "delivered" },
      subtitle: "Status {kod}",
      subtitleP: { kod: w.response_status ?? "—" },
      time: fmtTime(w.created_at),
      at: new Date(w.created_at).getTime(),
    });
  });

  apiLogs.slice(0, 5).forEach((l) => {
    items.push({
      icon: KeyRound,
      tone: "bg-amber-500/15 text-amber-500",
      title: "API {cesta}",
      titleP: { cesta: l.path ?? "request" },
      subtitle: "Status {kod}",
      subtitleP: { kod: l.status ?? "—" },
      time: fmtTime(l.created_at),
      at: new Date(l.created_at).getTime(),
    });
  });

  return items.sort((a, b) => b.at - a.at).slice(0, 12);
}

/* ---------- Aging / DSO / Forecast ---------- */

type AgingBucket = { key: string; label: string; count: number; amount: number; tone: string };

/** Koše veku (v termíne, 1–30, 31–60, 61–90, 90+ dní) z `prehlad_suhrn`. */
function buildAging(kose: KosVeku[]): AgingBucket[] {
  const buckets: AgingBucket[] = [
    {
      key: "current",
      label: "V termíne",
      count: 0,
      amount: 0,
      tone: "text-emerald-700 dark:text-emerald-400",
    },
    {
      key: "1_30",
      label: "1–30 dní",
      count: 0,
      amount: 0,
      tone: "text-amber-700 dark:text-amber-400",
    },
    {
      key: "31_60",
      label: "31–60 dní",
      count: 0,
      amount: 0,
      tone: "text-amber-700 dark:text-amber-300",
    },
    { key: "61_90", label: "61–90 dní", count: 0, amount: 0, tone: "text-destructive" },
    {
      key: "90_plus",
      label: "90+ dní",
      count: 0,
      amount: 0,
      tone: "text-destructive font-semibold",
    },
  ];
  return buckets.map((b, i) => ({ ...b, count: kose[i]?.pocet ?? 0, amount: kose[i]?.suma ?? 0 }));
}

type ForecastRow = {
  label: string;
  tyzden: number;
  range: string;
  income: number;
  expense: number;
  balance: number;
};

/** Výhľad na 4 týždne — sumy z `prehlad_suhrn`, tu len popisy týždňov. */
function buildCashflowForecast(vyhlad: { prijem: number; vydaj: number }[]): ForecastRow[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows: ForecastRow[] = [];
  for (let w = 0; w < 4; w++) {
    const start = new Date(today.getTime() + w * 7 * 86400000);
    const end = new Date(today.getTime() + (w + 1) * 7 * 86400000);
    const income = vyhlad[w]?.prijem ?? 0;
    const expense = vyhlad[w]?.vydaj ?? 0;
    const fmtD = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`;
    rows.push({
      label: `Týždeň ${w + 1}`,
      tyzden: w + 1,
      range: `${fmtD(start)} – ${fmtD(new Date(end.getTime() - 86400000))}`,
      income,
      expense,
      balance: income - expense,
    });
  }
  return rows;
}

/* ---------- Aging / DSO / Forecast components ---------- */

function AgingPanel({
  title,
  icon,
  buckets,
  loading,
}: {
  title: string;
  icon: any;
  buckets: AgingBucket[];
  loading: boolean;
}) {
  const { t } = useT();
  const [rozpis, setRozpis] = useState(false);
  const total = buckets.reduce((a, b) => a + b.amount, 0);
  const pocetSpolu = buckets.reduce((a, b) => a + b.count, 0);

  /*
    Pruh zlučuje päť buketov do troch pásov, aby sa dal prečítať na prvý
    pohľad — dva pásy po pár percentách sa vedľa seba nedajú rozoznať.
    **Bukety sa nemenia**: rozpis pod tlačidlom ukazuje všetkých päť tak, ako
    ich počíta `buildAging`, a súčty sedia na to isté číslo.
  */
  const pasy = [
    {
      kluc: "current",
      nazov: "V termíne",
      farba: "bg-emerald-500",
      suma: sumaZa(buckets, ["current"]),
    },
    {
      kluc: "1_60",
      nazov: "1–60 dní",
      farba: "bg-amber-500",
      suma: sumaZa(buckets, ["1_30", "31_60"]),
    },
    {
      kluc: "60_plus",
      nazov: "60+ dní",
      farba: "bg-destructive",
      suma: sumaZa(buckets, ["61_90", "90_plus"]),
    },
  ];

  return (
    <Panel title={title} icon={icon}>
      {loading ? (
        <div className="space-y-2">
          <div className="h-3 animate-pulse rounded-full bg-muted/50" />
          <div className="h-9 animate-pulse rounded-md bg-muted/50" />
        </div>
      ) : total === 0 ? (
        <div className="py-6 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-muted">
            <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{t("Nič otvorené — všetko je vyrovnané.")}</p>
        </div>
      ) : (
        <>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            {pasy.map((p) =>
              p.suma > 0 ? (
                <div
                  key={p.kluc}
                  className={p.farba}
                  style={{ width: `${(p.suma / total) * 100}%` }}
                  title={`${t(p.nazov)}: ${fmt(p.suma)}`}
                />
              ) : null,
            )}
          </div>

          <ul className="mt-3 space-y-1.5">
            {pasy.map((p) => (
              <li key={p.kluc} className="flex items-center gap-2 text-[13px]">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${p.farba}`} />
                <span className="flex-1 text-muted-foreground">{t(p.nazov)}</span>
                <span className="tabular-nums">{fmt(p.suma)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-[13px]">
            <span className="text-muted-foreground">{t("Spolu · {n}", { n: pocetSpolu })}</span>
            <span className="font-semibold tabular-nums">{fmt(total)}</span>
          </div>

          <button
            onClick={() => setRozpis((v) => !v)}
            aria-expanded={rozpis}
            className="mt-2 text-[12px] text-muted-foreground hover:text-foreground hover:underline"
          >
            {rozpis ? t("Skryť rozpis") : t("Zobraziť rozpis")}
          </button>

          {rozpis && (
            <div className="mt-2 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[12px] text-muted-foreground">
                    <th className="py-1.5 font-medium">{t("Obdobie")}</th>
                    <th className="py-1.5 text-right font-medium">{t("Počet")}</th>
                    <th className="py-1.5 text-right font-medium">{t("Suma")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {buckets.map((b) => (
                    <tr key={b.key}>
                      <td className="py-2">{t(b.label)}</td>
                      <td className="py-2 text-right tabular-nums">{b.count}</td>
                      <td className="py-2 text-right tabular-nums">{fmt(b.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

/** Súčet vybraných buketov. Pruh zlučuje, rozpis nie — počíta sa z tých istých. */
function sumaZa(buckets: AgingBucket[], kluce: string[]): number {
  return buckets.filter((b) => kluce.includes(b.key)).reduce((a, b) => a + b.amount, 0);
}

function DsoCard({
  dso,
  loading,
  hasPaid,
}: {
  dso: { days: number; receivables: number; revenue365: number };
  loading: boolean;
  hasPaid?: boolean;
}) {
  const { t } = useT();
  const tone =
    dso.days < 30
      ? "text-emerald-700 dark:text-emerald-400"
      : dso.days <= 60
        ? "text-amber-700 dark:text-amber-400"
        : "text-destructive";
  const badge = dso.days < 30 ? "Vynikajúce" : dso.days <= 60 ? "Priemerné" : "Kritické";
  return (
    <Panel title="Doba inkasa (DSO)" icon={Clock}>
      {loading ? (
        <div className="space-y-3">
          <div className="h-12 w-32 animate-pulse rounded-md bg-muted/50" />
          <div className="h-4 w-48 animate-pulse rounded-md bg-muted/50" />
        </div>
      ) : (
        <>
          <div className={`text-4xl font-bold tabular-nums ${tone}`}>{dso.days.toFixed(1).replace(".", ",")}</div>
          <div className="mt-1 text-xs text-muted-foreground">{t("Priemerná doba inkasa (dní)")}</div>
          {hasPaid && (
            <div
              className={`mt-3 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tone} bg-muted/40`}
            >
              {t(badge)}
            </div>
          )}

          <div className="mt-4 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>{t("Pohľadávky")}</span>
              <span className="tabular-nums">{fmt(dso.receivables)}</span>
            </div>
            <div className="flex justify-between">
              <span>{t("Obrat 365 dní")}</span>
              <span className="tabular-nums">{fmt(dso.revenue365)}</span>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

function ForecastPanel({
  rows,
  loading,
  className,
}: {
  rows: ForecastRow[];
  loading: boolean;
  className?: string;
}) {
  const { t } = useT();
  return (
    <Panel title="Výhľad peňažných tokov (4 týždne)" icon={Wallet} className={className}>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-muted/50" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0}>
          <table className="w-full min-w-[26rem] text-sm">
            <thead>
              <tr className="text-left text-[12px] text-muted-foreground">
                <th className="py-1.5 font-medium">{t("Obdobie")}</th>
                <th className="py-1.5 text-right font-medium">{t("Príjmy")}</th>
                <th className="py-1.5 text-right font-medium">{t("Výdavky")}</th>
                <th className="py-1.5 text-right font-medium">{t("Zostatok")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="py-2">
                    <div className="font-medium">{t("Týždeň {n}", { n: r.tyzden })}</div>
                    <div className="text-xs text-muted-foreground">{r.range}</div>
                  </td>
                  <td className="py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                    {fmt(r.income)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-destructive">
                    {r.expense > 0 ? `−${fmt(r.expense)}` : fmt(0)}
                  </td>
                  <td
                    className={`py-2 text-right font-semibold tabular-nums ${r.balance >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}
                  >
                    {fmt(r.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td className="pt-2 text-[12px] text-muted-foreground">{t("Spolu 4 týždne")}</td>
                <td className="pt-2 text-right text-xs tabular-nums text-emerald-700 dark:text-emerald-400">
                  {fmt(rows.reduce((a, r) => a + r.income, 0))}
                </td>
                <td className="pt-2 text-right text-xs tabular-nums text-destructive">
                  {rows.some((r) => r.expense > 0) ? "−" : ""}
                  {fmt(rows.reduce((a, r) => a + r.expense, 0))}
                </td>
                <td
                  className={`pt-2 text-right font-bold tabular-nums ${rows.reduce((a, r) => a + r.balance, 0) >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}
                >
                  {fmt(rows.reduce((a, r) => a + r.balance, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
  );
}
