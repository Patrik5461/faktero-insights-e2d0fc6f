import { createFileRoute, Link } from "@tanstack/react-router";
import { StavOdznak, TON_DOKLADU, tonStavu } from "@/components/faktero/web/Stav";
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
  pocetBezPrepoctu,
  sucetPrehladu,
  udalostiFaktury,
  type KosVeku,
  type PrehladSuhrn,
} from "@/lib/faktero/prehlad-suhrn";
import { mnozne } from "@/lib/faktero/mnozne";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { useServerFn } from "@tanstack/react-start";
import { getRecurringWidgetStats } from "@/lib/faktero/recurring.functions";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { TRIEDA_KLIK_RIADKU, useKlikNaRiadok } from "@/hooks/useKlikNaRiadok";
import { cn } from "@/lib/utils";
import { UpozornenieKleinunternehmer } from "@/components/faktero/UpozornenieKleinunternehmer";
import { PrenosFakturyZadarmo } from "@/components/faktero/PrenosFakturyZadarmo";
import { BankWidget } from "@/components/faktero/BankWidget";
import { AutoUctovanieWidget } from "@/components/faktero/AutoUctovanieWidget";
import { VynosyNakladyPanel } from "@/components/faktero/VynosyNakladyPanel";
import { SumaVDomacejMene } from "@/components/faktero/SuctyPoMenach";
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
  ChevronDown,
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
const domacaPrehladu = (): "EUR" | "CZK" => (menaPrehladu === "CZK" ? "CZK" : "EUR");

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

/*
  Farby výsekov = bodky stavových odznakov (web.css, `--stav-*-bod`), takže
  „Zaplatené“ má v grafe tú istú farbu ako odznak „Uhradená“ v zozname a obe
  sa prepnú aj do tmavého motívu. Koncept a Stornované sú obe sivé (ako
  predtým), Stornované tmavšie, aby sa dali rozoznať.
*/
const STATUS_COLOR: Record<string, string> = {
  draft: "var(--stav-neutralny-bod)",
  issued: "var(--stav-informacia-bod)",
  sent: "var(--stav-priebeh-bod)",
  paid: "var(--stav-uspech-bod)",
  overdue: "var(--stav-chyba-bod)",
  cancelled: "color-mix(in oklch, var(--muted-foreground) 70%, var(--foreground))",
};

/** Tóny čísel (zelená = v poriadku, jantárová = pozor, červená = problém). */
const TON_CISLA = {
  uspech: "text-[var(--stav-uspech-text)]",
  pozor: "text-[var(--stav-pozor-text)]",
  chyba: "text-destructive",
} as const;

/** Bublina grafu — rovnaký tvar ako ponuky (plávajúci tieň, tokeny). */
function BublinaGrafu({
  active,
  payload,
  label,
  hodnota,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  hodnota: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[10rem] rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      {label ? <div className="mb-1 font-semibold">{label}</div> : null}
      <ul className="space-y-1">
        {payload.map((p: any) => (
          <li key={p.name} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: p.payload?.color ?? p.color }}
            />
            <span className="min-w-0 flex-1 text-muted-foreground">{p.name}</span>
            <span className="suma">{hodnota(Number(p.value))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
  const klik = useKlikNaRiadok();
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
            .select(
              "id, invoice_number, customer_name, total, currency, status, paid_at, created_at, sent_at, cancelled_at",
            )
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
            {/* S-02: doklady v cudzej mene bez kurzu sa do súčtov nepripočítajú „koruna za euro“. */}
            {!loading && pocetBezPrepoctu(suhrn) > 0 && (
              <p className="text-xs text-muted-foreground">
                {t(
                  "Doklady v cudzej mene bez kurzu ({n}) nie sú v súčtoch — doplňte im kurz v detaile dokladu.",
                  { n: pocetBezPrepoctu(suhrn) },
                )}
              </p>
            )}

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
            <Row
              label="Celkové pohľadávky"
              value={
                <SumaVDomacejMene
                  sucet={sucetPrehladu(metrics.receivables, suhrn, domacaPrehladu(), "pohladavky")}
                />
              }
              strong
            />
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
              <div className="mb-1.5 text-xs font-semibold text-muted-foreground">{t("Najväčší dlžníci")}</div>
              {topDebtors.length === 0 ? (
                <div className="text-xs text-muted-foreground">{t("Žiadni dlžníci.")}</div>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {topDebtors.map((d) => (
                    <li key={d.name} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate" title={d.neznamy ? undefined : d.name}>
                        {d.neznamy ? t("Neznámy") : d.name}
                      </span>
                      <span className="suma shrink-0 font-medium">{fmt(d.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>

          <Panel title="DPH prehľad" icon={Receipt}>
            <Row label="DPH na odvod" value={fmt(metrics.vatOut)} />
            <Row label="DPH na odpočet (prijaté faktúry a bločky)" value={fmt(metrics.vatIn)} />
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
            <Row label="Výdavky (prijaté faktúry a bločky)" value={fmt(metrics.yearExpenses)} />
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
            <Row
              label="Neuhradené prijaté faktúry"
              value={
                <SumaVDomacejMene
                  sucet={sucetPrehladu(payables?.unpaid ?? 0, suhrn, domacaPrehladu(), "zavazky")}
                />
              }
              strong
            />
            <Row
              label="Po splatnosti"
              value={String(payables?.overdueCount ?? 0)}
              tone={(payables?.overdueCount ?? 0) > 0 ? "destructive" : undefined}
            />
            <Row label="Evidovaných spolu" value={String(payables?.count ?? 0)} />
            <div className="mt-3 border-t border-border pt-3">
              <Link
                to="/prijate-faktury"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover hover:underline"
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
            <div className="min-w-0 rounded-xl border border-primary/35 bg-card p-4 shadow-sm" data-w-efaktura-odpocet="">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <h3 className="text-base font-semibold">{t("eFaktúra 2027")}</h3>
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{t("Povinná eFaktúra od 1.1.2027")}</p>
                <div className="mt-4 grid grid-cols-4 gap-2">
                  {[
                    { v: countdown.days, l: "dní" },
                    { v: countdown.hours, l: "hod" },
                    { v: countdown.mins, l: "min" },
                    { v: countdown.secs, l: "sek" },
                  ].map((x) => (
                    <div
                      key={x.l}
                      className="rounded-lg border border-border bg-muted/50 px-1 py-3 text-center"
                    >
                      <div className="suma text-2xl font-bold tracking-tight">
                        {String(x.v).padStart(2, "0")}
                      </div>
                      <div className="text-[12px] text-muted-foreground">{t(x.l)}</div>
                    </div>
                  ))}
                </div>
                <Link
                  to="/efaktura"
                  className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
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
                {/* Bez accessibilityLayer a s rootTabIndex -1: inak má graf aj koláč tabIndex=0 a fokus by skončil v skrytom prvku. */}
                <PieChart accessibilityLayer={false}>
                  <Pie
                    rootTabIndex={-1}
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    stroke="var(--card)"
                    strokeWidth={2}
                  >
                    {statusData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={(p: any) => <BublinaGrafu {...p} hodnota={(v) => String(v)} />}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-1 text-[13px]">
              {statusData.map((s) => (
                <li key={s.name} className="flex items-center justify-between gap-3 py-0.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                    <span className="truncate">{s.name}</span>
                  </span>
                  <span className="suma font-semibold">{s.value}</span>
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
                className="flex items-center justify-center rounded-lg border border-input bg-card px-3 py-2 text-center text-xs font-semibold text-primary transition-colors hover:bg-accent hover:text-primary-hover"
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
              className={`group flex items-center justify-between gap-4 rounded-xl border p-4 transition-colors ${lowStockCount > 0 ? "border-[var(--stav-pozor-bod)]/50 bg-[var(--stav-pozor-plocha)] hover:border-[var(--stav-pozor-bod)]" : "border-border bg-card shadow-sm hover:bg-accent/60"}`}
            >
              <div className="flex min-w-0 items-center gap-4">
                <div
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${lowStockCount > 0 ? "bg-card text-[var(--stav-pozor-text)]" : "bg-muted text-muted-foreground"}`}
                >
                  <Package className="h-5 w-5" />
                </div>
                <div className="min-w-0">
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
              <div className="flex shrink-0 items-center gap-3">
                <div
                  className={`suma text-2xl font-bold ${lowStockCount > 0 ? "text-[var(--stav-pozor-text)]" : "text-muted-foreground"}`}
                >
                  {lowStockCount}
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
              </div>
            </Link>
          </div>
          {/* Nemecká firma knihu jázd nemá (agendy-krajiny.ts). */}
          {agendaPreKrajinu("/jazdy", krajina) && (
          <div className="mb-6">
            <Link
              to="/jazdy"
              className="group flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-accent/60"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Car className="h-5 w-5" />
                </div>
                <div className="min-w-0">
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
              <div className="flex shrink-0 items-center gap-3">
                <div className="text-right">
                  <div className="suma text-2xl font-bold">
                    {(tripStats?.km_month ?? 0).toFixed(1).replace(".", ",")}
                  </div>
                  <div className="text-[12px] text-muted-foreground">{t("km tento mesiac")}</div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
              </div>
            </Link>
          </div>
          )}
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <Panel title="Opakované faktúry" icon={Repeat}>
              <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
                <div className="min-w-0 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
                  <div className="text-muted-foreground">{t("Posledný beh")}</div>
                  <div className="mt-0.5 font-semibold tabular-nums break-words">
                    {recurringStats?.last_success_at
                      ? new Date(recurringStats.last_success_at).toLocaleString("sk-SK")
                      : "—"}
                  </div>
                </div>
                <div className="min-w-0 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
                  <div className="text-muted-foreground">{t("Najbližší beh")}</div>
                  <div className="mt-0.5 font-semibold tabular-nums break-words">{recurringStats?.next_run ?? "—"}</div>
                </div>
                <div
                  className={`min-w-0 rounded-lg border px-2.5 py-2 ${(recurringStats?.failed_24h ?? 0) > 0 ? "border-destructive/40 bg-[var(--stav-chyba-plocha)]" : "border-border bg-muted/40"}`}
                >
                  <div className="text-muted-foreground">{t("Chyby (24h)")}</div>
                  <div className="suma mt-0.5">
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
                    <li
                      key={r.id}
                      {...klik({ to: "/opakovane/$id", params: { id: r.id } }, { klavesnica: false })}
                      className={cn(
                        "flex items-center justify-between gap-3 py-2.5 text-sm",
                        TRIEDA_KLIK_RIADKU,
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/opakovane/$id"
                          params={{ id: r.id }}
                          title={r.name}
                          className="block truncate font-medium hover:text-primary hover:underline"
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
                      <div className="suma shrink-0">
                        {fmt(Number(r.total), r.currency)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to="/opakovane"
                className="mt-3 inline-block text-xs font-semibold text-primary hover:text-primary-hover hover:underline"
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
                    <li
                      key={q.id}
                      {...klik({ to: "/ponuky/$id", params: { id: q.id } }, { klavesnica: false })}
                      className={cn(
                        "flex items-center justify-between gap-3 py-2.5 text-sm",
                        TRIEDA_KLIK_RIADKU,
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/ponuky/$id"
                          params={{ id: q.id }}
                          className="cislo-dokladu block truncate hover:text-primary hover:underline"
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
                      <div className="suma shrink-0">
                        {fmt(Number(q.total), q.currency)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to="/ponuky"
                className="mt-3 inline-block text-xs font-semibold text-primary hover:text-primary-hover hover:underline"
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
                    <time className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">{a.time}</time>
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
      className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
        up ? TON_CISLA.uspech : TON_CISLA.chyba
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
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-7 w-32 animate-pulse rounded bg-muted" />
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
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
        meta={`${faktur(metrics.overdueCount)} · ${odberatelov(metrics.overdueDebtorCount)}`}
      />
      <KpiKarta
        label="Dlžia mi zákazníci"
        value={fmt(metrics.receivables)}
        icon={HandCoins}
        meta={
          <Link
            to="/faktury"
            search={{ neuhradene: true } as any}
            className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-hover hover:underline"
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
    <div
      className={`min-w-0 rounded-xl border bg-card p-4 shadow-sm ${stav === "zle" ? "border-destructive/35" : "border-border"}`}
      data-w-kpi=""
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-muted-foreground">{t(label)}</div>
          <div
            className={`suma mt-1.5 text-2xl font-bold tracking-tight ${stav === "zle" ? "text-destructive" : ""}`}
          >
            {value}
          </div>
        </div>
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
            stav === "zle" ? "bg-[var(--stav-chyba-plocha)] text-destructive" : "bg-muted text-muted-foreground"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      {meta && <div className="mt-2 text-xs text-muted-foreground">{meta}</div>}
    </div>
  );
}

function EmptyDashboard() {
  const { t } = useT();
  return (
    <div className="rounded-xl border border-border bg-card px-6 py-16 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-border bg-card text-primary shadow-sm">
        <HandCoins className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-base font-semibold">{t("Zatiaľ tu nie sú žiadne dáta")}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {t("Vystavte prvú faktúru a prehľad sa naplní obratom, pohľadávkami a cash flow predikciou.")}
      </p>
      <Link
        to="/faktury/nova"
        className="mt-5 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
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
    <div className={`min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm ${className ?? ""}`}>
      <div className="mb-3 flex min-w-0 items-center gap-2">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <h2 className="min-w-0 text-sm font-semibold">{t(title)}</h2>
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
  value: ReactNode;
  strong?: boolean;
  tone?: "destructive";
}) {
  const { t } = useT();
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="min-w-0 text-muted-foreground">{t(label)}</span>
      <span
        className={`suma shrink-0 ${strong ? "font-bold" : "font-medium"} ${tone === "destructive" ? "text-destructive" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function MiniStat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  const { t } = useT();
  return (
    <div className="min-w-0 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Icon className="mt-0.5 h-3 w-3 shrink-0" /> <span className="min-w-0">{t(label)}</span>
      </div>
      <div className="suma mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  // Tóny sú spoločné pre všetky stavy webu (components/faktero/web/Stav.tsx).
  const label: Record<string, string> = {
    draft: "Koncept",
    issued: "Vystavená",
    sent: "Odoslaná",
    paid: "Uhradená",
    overdue: "Po splatnosti",
    cancelled: "Stornovaná",
  };
  return (
    <StavOdznak ton={tonStavu(TON_DOKLADU, status)}>
      {label[status] ? t(label[status]) : status}
    </StavOdznak>
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

  /* Každá udalosť so svojím časom (S-07) — odoslanie a storno bez času sa neukážu. */
  const VZHLAD = {
    vytvorena: { icon: FilePlus2, tone: "bg-primary/10 text-primary-hover", title: "Faktúra {cislo} vytvorená" },
    odoslana: { icon: Send, tone: "bg-primary/10 text-primary-hover", title: "Faktúra {cislo} odoslaná" },
    zaplatena: { icon: CheckCircle2, tone: "bg-[var(--stav-uspech-plocha)] text-[var(--stav-uspech-text)]", title: "Faktúra {cislo} zaplatená" },
    stornovana: { icon: Ban, tone: "bg-muted text-muted-foreground", title: "Faktúra {cislo} stornovaná" },
  } as const;
  invoices.slice(0, 30).forEach((i) => {
    for (const u of udalostiFaktury(i)) {
      const v = VZHLAD[u.druh];
      const suma = fmt(Number(i.total), i.currency || menaPrehladu);
      items.push({
        icon: v.icon,
        tone: v.tone,
        title: v.title,
        titleP: { cislo: i.invoice_number },
        subtitle: "{v}",
        subtitleP: {
          v:
            u.druh === "vytvorena"
              ? `${i.customer_name ?? "—"} · ${suma}`
              : u.druh === "zaplatena"
                ? suma
                : (i.customer_name ?? "—"),
        },
        time: fmtTime(u.cas),
        at: new Date(u.cas).getTime(),
      });
    }
  });

  customers.slice(0, 10).forEach((c) => {
    items.push({
      icon: Users,
      tone: "bg-[var(--stav-informacia-plocha)] text-[var(--stav-informacia-text)]",
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
      tone: "bg-[var(--stav-priebeh-plocha)] text-[var(--stav-priebeh-text)]",
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
      tone: "bg-[var(--stav-pozor-plocha)] text-[var(--stav-pozor-text)]",
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
      tone: TON_CISLA.uspech,
    },
    {
      key: "1_30",
      label: "1–30 dní",
      count: 0,
      amount: 0,
      tone: TON_CISLA.pozor,
    },
    {
      key: "31_60",
      label: "31–60 dní",
      count: 0,
      amount: 0,
      tone: TON_CISLA.pozor,
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
      farba: "bg-[var(--stav-uspech-bod)]",
      suma: sumaZa(buckets, ["current"]),
    },
    {
      kluc: "1_60",
      nazov: "1–60 dní",
      farba: "bg-[var(--stav-pozor-bod)]",
      suma: sumaZa(buckets, ["1_30", "31_60"]),
    },
    {
      kluc: "60_plus",
      nazov: "60+ dní",
      farba: "bg-[var(--stav-chyba-bod)]",
      suma: sumaZa(buckets, ["61_90", "90_plus"]),
    },
  ];

  return (
    <Panel title={title} icon={icon}>
      {loading ? (
        <div className="space-y-2">
          <div className="h-3 animate-pulse rounded-full bg-muted" />
          <div className="h-9 animate-pulse rounded-md bg-muted" />
        </div>
      ) : total === 0 ? (
        <div className="py-6 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-[var(--stav-uspech-plocha)]">
            <CheckCircle2 className="h-5 w-5 text-[var(--stav-uspech-text)]" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{t("Nič otvorené — všetko je vyrovnané.")}</p>
        </div>
      ) : (
        <>
          {/* Medzi pásmi je 2 px medzera vo farbe karty — susedné pásy sa nezlejú ani v tme. */}
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted">
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
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${p.farba}`} />
                <span className="min-w-0 flex-1 text-muted-foreground">{t(p.nazov)}</span>
                <span className="suma font-medium">{fmt(p.suma)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-2.5 text-sm">
            <span className="font-semibold">{t("Spolu · {n}", { n: pocetSpolu })}</span>
            <span className="suma font-bold">{fmt(total)}</span>
          </div>

          <button
            onClick={() => setRozpis((v) => !v)}
            aria-expanded={rozpis}
            className="mt-2 inline-flex items-center gap-1 rounded-md px-1 py-0.5 -mx-1 text-xs font-semibold text-primary hover:text-primary-hover hover:underline"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${rozpis ? "rotate-180" : ""}`}
              aria-hidden
            />
            {rozpis ? t("Skryť rozpis") : t("Zobraziť rozpis")}
          </button>

          {rozpis && (
            <div className="mt-2 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-1.5 font-semibold">{t("Obdobie")}</th>
                    <th className="py-1.5 text-right font-semibold">{t("Počet")}</th>
                    <th className="py-1.5 text-right font-semibold">{t("Suma")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {buckets.map((b) => (
                    <tr key={b.key}>
                      <td className={`whitespace-nowrap py-2 ${b.tone}`}>{t(b.label)}</td>
                      <td className="py-2 text-right tabular-nums">{b.count}</td>
                      <td className="suma py-2 text-right font-medium">{fmt(b.amount)}</td>
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
  const tone = dso.days < 30 ? TON_CISLA.uspech : dso.days <= 60 ? TON_CISLA.pozor : TON_CISLA.chyba;
  const tonOdznaku = dso.days < 30 ? "uspech" : dso.days <= 60 ? "pozor" : "chyba";
  const badge = dso.days < 30 ? "Vynikajúce" : dso.days <= 60 ? "Priemerné" : "Kritické";
  return (
    <Panel title="Doba inkasa (DSO)" icon={Clock}>
      {loading ? (
        <div className="space-y-3">
          <div className="h-12 w-32 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-48 animate-pulse rounded-md bg-muted" />
        </div>
      ) : (
        <>
          <div className={`suma text-4xl font-bold tracking-tight ${tone}`}>{dso.days.toFixed(1).replace(".", ",")}</div>
          <div className="mt-1 text-xs text-muted-foreground">{t("Priemerná doba inkasa (dní)")}</div>
          {hasPaid && (
            <StavOdznak ton={tonOdznaku} className="mt-3">
              {t(badge)}
            </StavOdznak>
          )}

          <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>{t("Pohľadávky")}</span>
              <span className="suma font-medium text-foreground">{fmt(dso.receivables)}</span>
            </div>
            <div className="flex justify-between">
              <span>{t("Obrat 365 dní")}</span>
              <span className="suma font-medium text-foreground">{fmt(dso.revenue365)}</span>
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
            <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0}>
          <table className="w-full min-w-[26rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-1.5 font-semibold">{t("Obdobie")}</th>
                <th className="py-1.5 text-right font-semibold">{t("Príjmy")}</th>
                <th className="py-1.5 text-right font-semibold">{t("Výdavky")}</th>
                <th className="py-1.5 text-right font-semibold">{t("Zostatok")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="py-2">
                    <div className="font-medium">{t("Týždeň {n}", { n: r.tyzden })}</div>
                    <div className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{r.range}</div>
                  </td>
                  <td className={`suma py-2 text-right font-medium ${TON_CISLA.uspech}`}>
                    {fmt(r.income)}
                  </td>
                  <td className="suma py-2 text-right font-medium text-destructive">
                    {r.expense > 0 ? `−${fmt(r.expense)}` : fmt(0)}
                  </td>
                  <td
                    className={`suma py-2 text-right font-bold ${r.balance >= 0 ? TON_CISLA.uspech : TON_CISLA.chyba}`}
                  >
                    {fmt(r.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td className="pt-2.5 text-xs font-semibold">{t("Spolu 4 týždne")}</td>
                <td className={`suma pt-2.5 text-right text-xs ${TON_CISLA.uspech}`}>
                  {fmt(rows.reduce((a, r) => a + r.income, 0))}
                </td>
                <td className="suma pt-2.5 text-right text-xs text-destructive">
                  {rows.some((r) => r.expense > 0) ? "−" : ""}
                  {fmt(rows.reduce((a, r) => a + r.expense, 0))}
                </td>
                <td
                  className={`suma pt-2.5 text-right font-bold ${rows.reduce((a, r) => a + r.balance, 0) >= 0 ? TON_CISLA.uspech : TON_CISLA.chyba}`}
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
