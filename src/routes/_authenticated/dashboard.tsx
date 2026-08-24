import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { jeOtvorena, jePoSplatnosti, sucetDokladov } from "@/lib/faktero/faktury-sumy";
import { FAKTURY, ODBERATELIA, sPoctom } from "@/lib/faktero/mnozne";
import { useServerFn } from "@tanstack/react-start";
import { getRecurringWidgetStats } from "@/lib/faktero/recurring.functions";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { BankWidget } from "@/components/faktero/BankWidget";
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
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Prehľad — Faktero" }] }),
  component: Dashboard,
});

function fmt(n: number, currency = "EUR") {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency }).format(n);
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
  issued: "oklch(0.78 0.14 162)",
  sent: "oklch(0.85 0.13 85)",
  paid: "oklch(0.68 0.16 162)",
  overdue: "hsl(var(--destructive))",
  cancelled: "oklch(0.60 0.02 250)",
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [, m] = key.split("-");
  return ["Jan", "Feb", "Mar", "Apr", "Máj", "Jún", "Júl", "Aug", "Sep", "Okt", "Nov", "Dec"][
    Number(m) - 1
  ];
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
  const [payments, setPayments] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [company, setCompany] = useState<any | null>(null);
  const [apiLogs, setApiLogs] = useState<any[]>([]);
  const [apiKeysCount, setApiKeysCount] = useState(0);
  const [webhooksCount, setWebhooksCount] = useState(0);
  const [webhookDeliveries, setWebhookDeliveries] = useState<any[]>([]);
  const [lowStockCount, setLowStockCount] = useState<number>(0);
  const [tripStats, setTripStats] = useState<{ km_month: number; last: any | null } | null>(null);
  const [payables, setPayables] = useState<{
    unpaid: number;
    overdueCount: number;
    count: number;
  } | null>(null);
  const [purchaseInvoices, setPurchaseInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const companyId = getActiveCompanyId();
    if (!companyId) return;
    (async () => {
      const yearAgo = new Date();
      yearAgo.setMonth(yearAgo.getMonth() - 13);
      const yearAgoISO = yearAgo.toISOString().slice(0, 10);
      const todayISO = new Date().toISOString().slice(0, 10);
      const monthStartISO = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      ).toISOString();

      const [inv, pay, cust, comp, logs, keys, hooks, deliv, recur, quotesPend] = await Promise.all(
        [
          supabase
            .from("invoices")
            .select(
              "id, invoice_number, customer_name, customer_id, total, subtotal, vat_total, currency, status, type, issue_date, due_date, paid_at, created_at",
            )
            .eq("company_id", companyId)
            .is("deleted_at", null)
            .gte("issue_date", yearAgoISO)
            .order("created_at", { ascending: false }),
          supabase
            .from("payments")
            .select("amount, paid_at, invoice_id")
            .eq("company_id", companyId)
            .gte("paid_at", yearAgoISO),
          supabase.from("customers").select("id, name, created_at").eq("company_id", companyId),
          supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
          supabase
            .from("api_logs")
            .select("id, status, created_at, path")
            .eq("company_id", companyId)
            .gte("created_at", new Date(Date.now() - 31 * 86400000).toISOString())
            .order("created_at", { ascending: false })
            .limit(1000),
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
            .eq("active", true)
            .order("next_run", { ascending: true })
            .limit(5),
          supabase
            .from("quotes")
            .select("id, quote_number, customer_name, total, currency, valid_until, status")
            .eq("company_id", companyId)
            .in("status", ["draft", "sent"])
            .order("created_at", { ascending: false })
            .limit(5),
        ],
      );

      setAllInvoices(inv.data ?? []);
      setPayments(pay.data ?? []);
      setCustomers(cust.data ?? []);
      setCompany(comp.data ?? null);
      setApiLogs(logs.data ?? []);
      setApiKeysCount(keys.count ?? 0);
      setWebhooksCount(hooks.count ?? 0);
      setWebhookDeliveries(deliv.data ?? []);
      setActiveRecurring(recur.data ?? []);
      setPendingQuotes(quotesPend.data ?? []);
      setLoading(false);
      // keep refs to avoid unused warnings
      void todayISO;
      void monthStartISO;
    })();
    fetchRecurringStats()
      .then(setRecurringStats)
      .catch(() => {});
    (async () => {
      const cid = getActiveCompanyId();
      if (!cid) return;
      const [{ data: items }, { data: lvl }] = await Promise.all([
        supabase
          .from("stock_items")
          .select("id, min_stock, track_stock")
          .eq("company_id", cid)
          .eq("track_stock", true),
        supabase.from("stock_levels").select("stock_item_id, quantity").eq("company_id", cid),
      ]);
      const qty: Record<string, number> = {};
      (lvl ?? []).forEach((l: any) => {
        qty[l.stock_item_id] = (qty[l.stock_item_id] ?? 0) + Number(l.quantity);
      });
      const low = (items ?? []).filter(
        (s: any) => (qty[s.id] ?? 0) < Number(s.min_stock ?? 0),
      ).length;
      setLowStockCount(low);
    })();
    (async () => {
      const cid = getActiveCompanyId();
      if (!cid) return;
      const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
      const [{ data: month }, { data: last }] = await Promise.all([
        supabase
          .from("trips")
          .select("distance_km")
          .eq("company_id", cid)
          .gte("trip_date", monthStart),
        supabase
          .from("trips")
          .select("trip_date, distance_km, start_location, end_location")
          .eq("company_id", cid)
          .order("trip_date", { ascending: false })
          .limit(1),
      ]);
      const km = (month ?? []).reduce((a: number, r: any) => a + Number(r.distance_km), 0);
      setTripStats({ km_month: km, last: last?.[0] ?? null });
    })();
    (async () => {
      const cid = getActiveCompanyId();
      if (!cid) return;
      const { data } = await supabase
        .from("purchase_invoices")
        .select("id, amount_total, status, due_date, supplier_name, invoice_number")
        .eq("company_id", cid)
        .is("deleted_at", null);
      setPurchaseInvoices(data ?? []);
      const today = new Date().toISOString().slice(0, 10);
      let unpaid = 0,
        overdueCount = 0;
      (data ?? []).forEach((r: any) => {
        if (r.status !== "paid" && r.status !== "cancelled") {
          unpaid += Number(r.amount_total ?? 0);
          if (r.due_date < today) overdueCount++;
        }
      });
      setPayables({ unpaid, overdueCount, count: data?.length ?? 0 });
    })();
  }, []);

  const metrics = useMemo(
    () => computeMetrics(allInvoices, payments, customers),
    [allInvoices, payments, customers],
  );
  const chartData = useMemo(() => buildRevenueChart(allInvoices), [allInvoices]);
  const statusData = useMemo(() => buildStatusDistribution(allInvoices), [allInvoices]);
  const topDebtors = useMemo(() => buildTopDebtors(allInvoices), [allInvoices]);
  const activity = useMemo(
    () => buildActivity(allInvoices, customers, webhookDeliveries, apiLogs),
    [allInvoices, customers, webhookDeliveries, apiLogs],
  );
  const apiStats = useMemo(() => computeApiStats(apiLogs), [apiLogs]);
  const agingReceivables = useMemo(() => buildAging(allInvoices, "receivable"), [allInvoices]);
  const agingPayables = useMemo(() => buildAging(purchaseInvoices, "payable"), [purchaseInvoices]);
  const dso = useMemo(() => computeDSO(allInvoices), [allInvoices]);
  const forecast = useMemo(
    () => buildCashflowForecast(allInvoices, purchaseInvoices),
    [allInvoices, purchaseInvoices],
  );

  const countdown = useCountdown(new Date("2027-01-01T00:00:00"));

  const isEmpty = !loading && allInvoices.length === 0;
  const hasPaidInvoice = useMemo(() => allInvoices.some((i) => i.status === "paid"), [allInvoices]);

  return (
    <>
      <PageHeader
        title="Prehľad"
        description="Finančný prehľad vašej firmy v reálnom čase."
        action={
          <div className="flex flex-wrap gap-2">
            <QuickAction to="/faktury/nova" icon={Plus} label="Nová faktúra" primary />
            <QuickAction to="/odberatelia" search={{ new: "1" }} icon={Users} label="Nový odberateľ" />
            <QuickAction to="/ponuky/nova" icon={FilePlus2} label="Nová ponuka" />
            <QuickAction to="/opakovane/nova" icon={Repeat} label="Opakovaná faktúra" />
          </div>
        }
      />
      <PageBody>
        {isEmpty ? (
          <EmptyDashboard />
        ) : (
          <>
            {/* Overview stat strip */}
            <StatStrip metrics={metrics} loading={loading} />

            {/* CRM: Aging + DSO + Forecast */}
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <AgingPanel
                title="Aging pohľadávok"
                icon={HandCoins}
                buckets={agingReceivables}
                loading={loading}
              />
              <AgingPanel
                title="Aging záväzkov"
                icon={TrendingDown}
                buckets={agingPayables}
                loading={loading}
              />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <DsoCard dso={dso} loading={loading} hasPaid={hasPaidInvoice} />
              <ForecastPanel rows={forecast} loading={loading} className="lg:col-span-2" />
            </div>
          </>
        )}

        <div className="mt-6">
          <BankWidget />
        </div>

        {/* MAIN CHARTS */}
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <Panel className="lg:col-span-2" title="Obrat (posledných 12 mesiacov)" icon={TrendingUp}>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gIssued" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gPaid" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(160 70% 45%)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="hsl(160 70% 45%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gOverdue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={fmtCompact}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: any) => fmt(Number(v))}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="issued"
                    name="Vystavené"
                    stroke="hsl(var(--primary))"
                    fill="url(#gIssued)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="paid"
                    name="Zaplatené"
                    stroke="hsl(160 70% 45%)"
                    fill="url(#gPaid)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="overdue"
                    name="Po splatnosti"
                    stroke="hsl(var(--destructive))"
                    fill="url(#gOverdue)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Rozdelenie faktúr" icon={Activity}>
            <div className="h-72">
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
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
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
        </div>

        {/* SECOND ROW */}
        <div className="mt-8 grid gap-6 lg:grid-cols-4">
          <Panel title="Pohľadávky" icon={HandCoins}>
            <Row label="Celkové pohľadávky" value={fmt(metrics.receivables)} strong />
            <Row label="Po splatnosti" value={fmt(metrics.overdueAmount)} tone="destructive" />
            <Row label="Priemerná doba úhrady" value={`${metrics.avgPayDays.toFixed(0)} dní`} />
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                Najväčší dlžníci
              </div>
              {topDebtors.length === 0 ? (
                <div className="text-xs text-muted-foreground">Žiadni dlžníci.</div>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {topDebtors.map((d) => (
                    <li key={d.name} className="flex items-center justify-between">
                      <span className="truncate">{d.name}</span>
                      <span className="ml-2 font-medium tabular-nums">{fmt(d.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>

          <Panel title="DPH prehľad" icon={Receipt}>
            <Row label="DPH na odvod" value={fmt(metrics.vatOut)} />
            <Row label="DPH na odpočet" value={fmt(metrics.vatIn)} />
            <Row
              label="Rozdiel"
              value={fmt(metrics.vatOut - metrics.vatIn)}
              strong
              tone={metrics.vatOut - metrics.vatIn > 0 ? "destructive" : undefined}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              {company?.ic_dph ? "Ste platiteľ DPH." : "Nie ste platiteľ DPH."}
            </p>
          </Panel>

          <Panel title="Daňový odhad" icon={Calculator}>
            <Row label="Príjmy (rok)" value={fmt(metrics.yearIncome)} />
            <Row label="Výdavky (odhad)" value={fmt(metrics.yearExpenses)} />
            <Row
              label="Odhad základu dane"
              value={fmt(Math.max(0, metrics.yearIncome - metrics.yearExpenses))}
              strong
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Indikatívny výpočet — nenahrádza účtovníka.
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
                Otvoriť prijaté faktúry <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </Panel>
        </div>

        {/* THIRD ROW */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6">
            <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">eFaktúra 2027</h3>
                </div>
                <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                  Pripravujeme
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Povinná eFaktúra od 1.1.2027</p>
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
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {x.l}
                    </div>
                  </div>
                ))}
              </div>
              <Link
                to="/efaktura"
                className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Zobraziť eFaktúru <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <Panel title="API & integrácie" icon={KeyRound}>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="API calls dnes" value={String(apiStats.today)} icon={Activity} />
              <MiniStat label="API calls / mesiac" value={String(apiStats.month)} icon={Activity} />
              <MiniStat
                label="Úspešnosť"
                value={`${apiStats.successRate.toFixed(1)}%`}
                icon={CheckCircle2}
              />
              <MiniStat label="Aktívne kľúče" value={String(apiKeysCount)} icon={KeyRound} />
              <MiniStat label="Aktívne webhooky" value={String(webhooksCount)} icon={Webhook} />
              <Link
                to="/api-kluce"
                className="flex items-center justify-center rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-medium hover:bg-muted/60"
              >
                Spravovať API →
              </Link>
            </div>
          </Panel>
        </div>

        {/* ACTIVITY FEED */}
        <div className="mt-6">
          <div className="mb-6">
            <Link
              to="/sklad/produkty"
              search={{ filter: "low_stock" }}
              className={`group flex items-center justify-between rounded-2xl border p-5 transition-colors ${lowStockCount > 0 ? "border-amber-400/40 bg-amber-500/5 hover:bg-amber-500/10" : "border-border bg-card hover:bg-muted/30"}`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`grid h-12 w-12 place-items-center rounded-xl ${lowStockCount > 0 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}
                >
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Nízky stav skladu</div>
                  <div className="text-xs text-muted-foreground">
                    {lowStockCount > 0
                      ? `${lowStockCount} položiek pod minimom`
                      : "Všetky položky nad minimálnym stavom."}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className={`text-2xl font-bold tabular-nums ${lowStockCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
                >
                  {lowStockCount}
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </Link>
          </div>
          <div className="mb-6">
            <Link
              to="/jazdy"
              className="group flex items-center justify-between rounded-2xl border border-border/60 bg-card p-6 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Car className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Kniha jázd</div>
                  <div className="text-xs text-muted-foreground">
                    {tripStats?.last
                      ? `Posledná jazda ${tripStats.last.trip_date} · ${tripStats.last.start_location ?? "—"} → ${tripStats.last.end_location ?? "—"}`
                      : "Zatiaľ žiadne jazdy."}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-2xl font-bold tabular-nums">
                    {(tripStats?.km_month ?? 0).toFixed(1)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    km tento mesiac
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </Link>
          </div>
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <Panel title="Opakované faktúry" icon={Repeat}>
              <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg border border-border bg-muted/30 px-2 py-1.5">
                  <div className="text-muted-foreground">Posledný beh</div>
                  <div className="mt-0.5 font-medium">
                    {recurringStats?.last_success_at
                      ? new Date(recurringStats.last_success_at).toLocaleString("sk-SK")
                      : "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 px-2 py-1.5">
                  <div className="text-muted-foreground">Najbližší beh</div>
                  <div className="mt-0.5 font-medium">{recurringStats?.next_run ?? "—"}</div>
                </div>
                <div
                  className={`rounded-lg border px-2 py-1.5 ${(recurringStats?.failed_24h ?? 0) > 0 ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/30"}`}
                >
                  <div className="text-muted-foreground">Chyby (24h)</div>
                  <div className="mt-0.5 font-medium tabular-nums">
                    {recurringStats?.failed_24h ?? 0}
                  </div>
                </div>
              </div>
              {activeRecurring.length === 0 ? (
                <div className="py-4 text-sm text-muted-foreground">
                  Žiadne aktívne šablóny.{" "}
                  <Link to="/opakovane/nova" className="text-primary hover:underline">
                    Vytvoriť
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
                          {r.customer_name ?? "—"} · ďalší beh {r.next_run}
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
                Zobraziť všetky →
              </Link>
            </Panel>
            <Panel title="Ponuky čakajúce na odpoveď" icon={ClipboardList}>
              {pendingQuotes.length === 0 ? (
                <div className="py-4 text-sm text-muted-foreground">
                  Žiadne otvorené ponuky.{" "}
                  <Link to="/ponuky/nova" className="text-primary hover:underline">
                    Vytvoriť
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
                          {q.customer_name ?? "—"} · platná do {q.valid_until}
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
                Zobraziť všetky →
              </Link>
            </Panel>
          </div>
          <Panel title="Posledná aktivita" icon={Activity}>
            {activity.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {loading ? "Načítavam…" : "Zatiaľ žiadna aktivita."}
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
                      <div className="truncate text-sm font-medium">{a.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{a.subtitle}</div>
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
      <Icon className="h-4 w-4" /> {label}
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
        up ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
      }`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(pct).toFixed(1)} %
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
  const valueTone =
    tone === "destructive" ? "text-destructive" : tone === "primary" ? "text-primary" : "";
  return (
    <div className={`min-w-0 px-5 py-4 ${className ?? ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueTone}`}>{value}</div>
      <div className="mt-1 min-h-4 text-xs text-muted-foreground">{meta}</div>
    </div>
  );
}

function StatStrip({ metrics, loading }: { metrics: any; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid divide-y divide-border/60 rounded-xl border border-border/60 bg-card sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 px-5 py-4">
            <div className="h-3 w-24 animate-pulse rounded bg-muted/60" />
            <div className="h-7 w-32 animate-pulse rounded bg-muted/60" />
            <div className="h-3 w-20 animate-pulse rounded bg-muted/60" />
          </div>
        ))}
      </div>
    );
  }

  const revenueDelta = metrics.prevMonthRevenue > 0 ? (metrics.monthRevenueDelta as number) : null;

  return (
    <div className="grid divide-y divide-border/60 rounded-xl border border-border/60 bg-card sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
      <Segment
        label="Obrat tento mesiac"
        value={fmt(metrics.monthRevenue)}
        meta={<Delta pct={revenueDelta} />}
      />
      <Segment
        label="Neuhradené"
        value={fmt(metrics.unpaidAmount)}
        meta={sPoctom(metrics.unpaidCount, FAKTURY)}
      />
      <Segment
        label="Po splatnosti"
        value={fmt(metrics.overdueAmount)}
        tone={metrics.overdueAmount > 0 ? "destructive" : undefined}
        meta={`${sPoctom(metrics.overdueCount, FAKTURY)} · ${sPoctom(metrics.debtorCount, ODBERATELIA)}`}
      />
      <Segment
        label="Dlžia mi zákazníci"
        value={fmt(metrics.receivables)}
        tone="primary"
        meta={
          <Link
            to="/faktury"
            search={{ neuhradene: true } as any}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Zobraziť pohľadávky <ArrowUpRight className="h-3 w-3" />
          </Link>
        }
      />
    </div>
  );
}

function EmptyDashboard() {
  return (
    <div className="rounded-xl border border-border/60 bg-card px-6 py-16 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10">
        <HandCoins className="h-5 w-5 text-primary" />
      </div>
      <h2 className="mt-4 text-base font-semibold">Zatiaľ tu nie sú žiadne dáta</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Vystavte prvú faktúru a prehľad sa naplní obratom, pohľadávkami a cash flow predikciou.
      </p>
      <Link
        to="/faktury/nova"
        className="mt-5 inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Vytvoriť faktúru
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
  return (
    <div className={`rounded-2xl border border-border/60 bg-card p-6 ${className ?? ""}`}>
      <div className="mb-4 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
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
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`tabular-nums ${strong ? "font-semibold" : ""} ${tone === "destructive" ? "text-destructive" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function MiniStat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    issued: "bg-secondary text-secondary-foreground",
    sent: "bg-secondary text-secondary-foreground",
    paid: "bg-primary/15 text-primary",
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
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${map[status] ?? "bg-muted"}`}>
      {label[status] ?? status}
    </span>
  );
}

/* ---------- Pure data helpers ---------- */

function computeMetrics(invoices: any[], payments: any[], customers: any[]) {
  const now = new Date();
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const pmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const pmEnd = mStart;
  const yStart = new Date(now.getFullYear(), 0, 1);

  const inMonth = (d: string, a: Date, b: Date) => {
    const x = new Date(d);
    return x >= a && x < b;
  };

  /*
   * Obrat sa počíta cez spoločné pravidlá: koncept ešte nie je doklad,
   * zálohová faktúra to isté plnenie zdvojuje a dobropis sumu znižuje.
   */
  const monthRevenue = sucetDokladov(
    invoices.filter((i) => new Date(i.issue_date) >= mStart),
    "total",
  );
  const prevMonthRevenue = sucetDokladov(
    invoices.filter((i) => inMonth(i.issue_date, pmStart, pmEnd)),
    "total",
  );
  const monthRevenueDelta =
    prevMonthRevenue > 0 ? ((monthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100 : 0;

  const unpaid = invoices.filter(jeOtvorena);
  const unpaidAmount = sucetDokladov(unpaid, "total");
  // Po splatnosti podľa dátumu — stav `overdue` do databázy nikto nezapisuje,
  // takže filter podľa neho ukazoval nulu aj pri kope dlžníkov.
  const dnesISO = new Date().toISOString().slice(0, 10);
  const overdueArr = invoices.filter((i) => jePoSplatnosti(i, dnesISO));
  const overdueAmount = sucetDokladov(overdueArr, "total");

  const last30 = Date.now() - 30 * 86400000;
  const paidLast30 = payments
    .filter((p) => new Date(p.paid_at).getTime() >= last30)
    .reduce((a, p) => a + Number(p.amount ?? 0), 0);
  const cashflow = paidLast30 - overdueAmount;
  const cashflowDelta = paidLast30 > 0 ? ((paidLast30 - overdueAmount) / paidLast30) * 100 : 0;

  const receivables = unpaidAmount;
  const debtorIds = new Set(unpaid.map((i) => i.customer_id ?? i.customer_name).filter(Boolean));
  const debtorCount = debtorIds.size;

  // avg payment days
  const paid = invoices.filter((i) => i.status === "paid" && i.paid_at && i.issue_date);
  const avgPayDays = paid.length
    ? paid.reduce(
        (a, i) => a + (new Date(i.paid_at).getTime() - new Date(i.issue_date).getTime()) / 86400000,
        0,
      ) / paid.length
    : 0;

  // VAT — YTD
  const ytd = invoices.filter((i) => new Date(i.issue_date) >= yStart && i.status !== "cancelled");
  const vatOut = ytd.reduce((a, i) => a + Number(i.vat_total ?? 0), 0);
  const vatIn = vatOut * 0.35; // heuristic estimate (no expenses table)

  const yearIncome = ytd.reduce((a, i) => a + Number(i.subtotal ?? i.total ?? 0), 0);
  const yearExpenses = yearIncome * 0.4; // flat-rate estimate for SK

  void customers;
  return {
    monthRevenue,
    prevMonthRevenue,
    monthRevenueDelta,
    unpaidAmount,
    unpaidCount: unpaid.length,
    overdueAmount,
    overdueCount: overdueArr.length,
    cashflow,
    cashflowDelta,
    receivables,
    debtorCount,
    avgPayDays,
    vatOut,
    vatIn,
    yearIncome,
    yearExpenses,
  };
}

function buildRevenueChart(invoices: any[]) {
  const buckets: Record<string, { month: string; issued: number; paid: number; overdue: number }> =
    {};
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = monthKey(d);
    buckets[k] = { month: monthLabel(k), issued: 0, paid: 0, overdue: 0 };
  }
  invoices.forEach((inv) => {
    const k = monthKey(new Date(inv.issue_date));
    if (!buckets[k]) return;
    const total = Number(inv.total ?? 0);
    if (inv.status === "cancelled") return;
    buckets[k].issued += total;
    if (inv.status === "paid") buckets[k].paid += total;
    if (inv.status === "overdue") buckets[k].overdue += total;
  });
  return Object.values(buckets);
}

function buildStatusDistribution(invoices: any[]) {
  const counts: Record<string, number> = {
    draft: 0,
    issued: 0,
    sent: 0,
    paid: 0,
    overdue: 0,
    cancelled: 0,
  };
  invoices.forEach((i) => {
    counts[i.status] = (counts[i.status] ?? 0) + 1;
  });
  return Object.entries(counts).map(([k, v]) => ({
    name: STATUS_LABEL[k] ?? k,
    value: v,
    color: STATUS_COLOR[k] ?? "hsl(var(--muted-foreground))",
  }));
}

function buildTopDebtors(invoices: any[]) {
  const map = new Map<string, number>();
  invoices
    .filter((i) => ["issued", "sent", "overdue"].includes(i.status))
    .forEach((i) => {
      const name = i.customer_name || "Neznámy";
      map.set(name, (map.get(name) ?? 0) + Number(i.total ?? 0));
    });
  return [...map.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4);
}

function buildActivity(invoices: any[], customers: any[], deliveries: any[], apiLogs: any[]) {
  type Item = {
    icon: any;
    tone: string;
    title: string;
    subtitle: string;
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
      tone: "bg-primary/15 text-primary",
      title: `Faktúra ${i.invoice_number} vytvorená`,
      subtitle: `${i.customer_name ?? "—"} · ${fmt(Number(i.total), i.currency || "EUR")}`,
      time: fmtTime(i.created_at),
      at: new Date(i.created_at).getTime(),
    });
    if (i.status === "sent" || i.status === "paid") {
      items.push({
        icon: Send,
        tone: "bg-primary/15 text-primary",
        title: `Faktúra ${i.invoice_number} odoslaná`,
        subtitle: i.customer_name ?? "—",
        time: fmtTime(i.created_at),
        at: new Date(i.created_at).getTime() + 1,
      });
    }
    if (i.status === "paid" && i.paid_at) {
      items.push({
        icon: CheckCircle2,
        tone: "bg-emerald-500/15 text-emerald-500",
        title: `Faktúra ${i.invoice_number} zaplatená`,
        subtitle: fmt(Number(i.total), i.currency || "EUR"),
        time: fmtTime(i.paid_at),
        at: new Date(i.paid_at).getTime(),
      });
    }
    if (i.status === "cancelled") {
      items.push({
        icon: Ban,
        tone: "bg-muted text-muted-foreground",
        title: `Faktúra ${i.invoice_number} stornovaná`,
        subtitle: i.customer_name ?? "—",
        time: fmtTime(i.created_at),
        at: new Date(i.created_at).getTime(),
      });
    }
  });

  customers.slice(0, 10).forEach((c) => {
    items.push({
      icon: Users,
      tone: "bg-purple-500/15 text-purple-500",
      title: `Nový odberateľ: ${c.name}`,
      subtitle: "Vytvorený v systéme",
      time: fmtTime(c.created_at),
      at: new Date(c.created_at).getTime(),
    });
  });

  deliveries.slice(0, 10).forEach((w) => {
    items.push({
      icon: Webhook,
      tone: "bg-cyan-500/15 text-cyan-500",
      title: `Webhook ${w.event_type ?? "delivered"}`,
      subtitle: `Status ${w.response_status ?? "—"}`,
      time: fmtTime(w.created_at),
      at: new Date(w.created_at).getTime(),
    });
  });

  apiLogs.slice(0, 5).forEach((l) => {
    items.push({
      icon: KeyRound,
      tone: "bg-amber-500/15 text-amber-500",
      title: `API ${l.path ?? "request"}`,
      subtitle: `Status ${l.status ?? "—"}`,
      time: fmtTime(l.created_at),
      at: new Date(l.created_at).getTime(),
    });
  });

  return items.sort((a, b) => b.at - a.at).slice(0, 12);
}

function computeApiStats(logs: any[]) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const today = logs.filter((l) => new Date(l.created_at) >= todayStart).length;
  const month = logs.length;
  const success = logs.filter((l) => Number(l.status) >= 200 && Number(l.status) < 400).length;
  const successRate = month > 0 ? (success / month) * 100 : 100;
  return { today, month, successRate };
}

/* ---------- Aging / DSO / Forecast ---------- */

type AgingBucket = { key: string; label: string; count: number; amount: number; tone: string };

function buildAging(rows: any[], kind: "receivable" | "payable"): AgingBucket[] {
  const openStatuses =
    kind === "receivable"
      ? new Set(["issued", "sent", "overdue"])
      : new Set(["received", "booked"]);
  const amountField = kind === "receivable" ? "total" : "amount_total";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets: AgingBucket[] = [
    {
      key: "current",
      label: "V termíne",
      count: 0,
      amount: 0,
      tone: "text-emerald-600 dark:text-emerald-400",
    },
    {
      key: "1_30",
      label: "1–30 dní",
      count: 0,
      amount: 0,
      tone: "text-amber-600 dark:text-amber-400",
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

  rows.forEach((r) => {
    if (!openStatuses.has(r.status)) return;
    // Zálohová faktúra ani dobropis nie sú pohľadávka po splatnosti.
    if (kind === "receivable" && (r.type === "proforma" || r.type === "credit_note")) return;
    if (!r.due_date) return;
    const due = new Date(r.due_date);
    due.setHours(0, 0, 0, 0);
    const daysOver = Math.floor((today.getTime() - due.getTime()) / 86400000);
    const amt = Number(r[amountField] ?? 0);
    let idx = 0;
    if (daysOver <= 0) idx = 0;
    else if (daysOver <= 30) idx = 1;
    else if (daysOver <= 60) idx = 2;
    else if (daysOver <= 90) idx = 3;
    else idx = 4;
    buckets[idx].count += 1;
    buckets[idx].amount += amt;
  });

  return buckets;
}

function computeDSO(invoices: any[]) {
  const now = Date.now();
  const yearAgo = now - 365 * 86400000;
  const receivables = sucetDokladov(invoices.filter(jeOtvorena), "total");
  const revenue365 = sucetDokladov(
    invoices.filter((i) => new Date(i.issue_date).getTime() >= yearAgo),
    "total",
  );
  const days = revenue365 > 0 ? (receivables / revenue365) * 365 : 0;
  return { days, receivables, revenue365 };
}

type ForecastRow = {
  label: string;
  range: string;
  income: number;
  expense: number;
  balance: number;
};

function buildCashflowForecast(invoices: any[], purchases: any[]): ForecastRow[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const openInv = new Set(["issued", "sent", "overdue"]);
  const openPur = new Set(["received", "booked"]);
  const rows: ForecastRow[] = [];
  for (let w = 0; w < 4; w++) {
    const start = new Date(today.getTime() + w * 7 * 86400000);
    const end = new Date(today.getTime() + (w + 1) * 7 * 86400000);
    const inRange = (d?: string) => {
      if (!d) return false;
      const x = new Date(d).getTime();
      return x >= start.getTime() && x < end.getTime();
    };
    const income = invoices
      .filter((i) => openInv.has(i.status) && inRange(i.due_date))
      .reduce((a, i) => a + Number(i.total ?? 0), 0);
    const expense = purchases
      .filter((p) => openPur.has(p.status) && inRange(p.due_date))
      .reduce((a, p) => a + Number(p.amount_total ?? 0), 0);
    const fmtD = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`;
    rows.push({
      label: `Týždeň ${w + 1}`,
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
  const total = buckets.reduce((a, b) => a + b.amount, 0);
  return (
    <Panel title={title} icon={icon}>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-muted/50" />
          ))}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 font-medium">Bucket</th>
                  <th className="py-1.5 text-right font-medium">Počet</th>
                  <th className="py-1.5 text-right font-medium">Suma</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {buckets.map((b) => (
                  <tr key={b.key}>
                    <td className={`py-2 ${b.tone}`}>{b.label}</td>
                    <td className="py-2 text-right tabular-nums">{b.count}</td>
                    <td className={`py-2 text-right tabular-nums ${b.tone}`}>{fmt(b.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td className="pt-2 text-xs uppercase tracking-wide text-muted-foreground">
                    Spolu
                  </td>
                  <td className="pt-2 text-right text-xs text-muted-foreground tabular-nums">
                    {buckets.reduce((a, b) => a + b.count, 0)}
                  </td>
                  <td className="pt-2 text-right font-semibold tabular-nums">{fmt(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
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
  const tone =
    dso.days < 30
      ? "text-emerald-600 dark:text-emerald-400"
      : dso.days <= 60
        ? "text-amber-600 dark:text-amber-400"
        : "text-destructive";
  const badge = dso.days < 30 ? "Vynikajúce" : dso.days <= 60 ? "Priemerné" : "Kritické";
  return (
    <Panel title="DSO" icon={Clock}>
      {loading ? (
        <div className="space-y-3">
          <div className="h-12 w-32 animate-pulse rounded-md bg-muted/50" />
          <div className="h-4 w-48 animate-pulse rounded-md bg-muted/50" />
        </div>
      ) : (
        <>
          <div className={`text-4xl font-bold tabular-nums ${tone}`}>{dso.days.toFixed(1)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Priemerná doba inkasa (dní)</div>
          {hasPaid && (
            <div
              className={`mt-3 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tone} bg-muted/40`}
            >
              {badge}
            </div>
          )}

          <div className="mt-4 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Pohľadávky</span>
              <span className="tabular-nums">{fmt(dso.receivables)}</span>
            </div>
            <div className="flex justify-between">
              <span>Obrat 365 dní</span>
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
  return (
    <Panel title="Cash flow forecast (4 týždne)" icon={Wallet} className={className}>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-muted/50" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 font-medium">Obdobie</th>
                <th className="py-1.5 text-right font-medium">Príjmy</th>
                <th className="py-1.5 text-right font-medium">Výdavky</th>
                <th className="py-1.5 text-right font-medium">Zostatok</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="py-2">
                    <div className="font-medium">{r.label}</div>
                    <div className="text-xs text-muted-foreground">{r.range}</div>
                  </td>
                  <td className="py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    {fmt(r.income)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-destructive">
                    {r.expense > 0 ? `−${fmt(r.expense)}` : fmt(0)}
                  </td>
                  <td
                    className={`py-2 text-right font-semibold tabular-nums ${r.balance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
                  >
                    {fmt(r.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td className="pt-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Spolu 4 týždne
                </td>
                <td className="pt-2 text-right text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                  {fmt(rows.reduce((a, r) => a + r.income, 0))}
                </td>
                <td className="pt-2 text-right text-xs tabular-nums text-destructive">
                  −{fmt(rows.reduce((a, r) => a + r.expense, 0))}
                </td>
                <td
                  className={`pt-2 text-right font-bold tabular-nums ${rows.reduce((a, r) => a + r.balance, 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
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
