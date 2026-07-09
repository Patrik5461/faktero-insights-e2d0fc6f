import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Check, CreditCard, Crown, ShieldCheck, Zap, Loader2, Info, FileText, Car } from "lucide-react";
import { getActiveCompanyId, fetchMyCompanies } from "@/lib/faktero/active-company";
import {
  listPlans,
  getMyBilling,
  getPaymentHistory,
  createCheckout,
  cancelSubscription,
  reactivateSubscription,
  syncMyLatestPayment,
} from "@/lib/faktero/billing.functions";
import { plDni } from "@/lib/faktero/plan-enforcement";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getActiveProduct } from "@/lib/faktero/active-product";

type ProductMode = "invoicing" | "logbook" | "both";
type ProductTab = "invoicing" | "logbook";

const LOGBOOK_PLANS = [
  {
    slug: "logbook_mini",
    name: "Kniha jázd Mini",
    price: "5 €",
    tagline: "Pre živnostníkov s jedným či dvoma vozidlami.",
    features: [
      "Do 2 vozidiel",
      "Manuálne aj GPS jazdy",
      "Mesačné prehľady a exporty",
      "PDF kniha jázd",
      "E-mail podpora",
    ],
    featured: false,
  },
  {
    slug: "logbook_pro",
    name: "Kniha jázd Pro",
    price: "9 €",
    tagline: "Pre firmy s flotilou a GPS integráciami.",
    features: [
      "Neobmedzene vozidiel",
      "Commander GPS integrácia",
      "Tesla Fleet API",
      "Automatické importy jázd",
      "Pokročilé reporty",
      "Prioritná podpora",
    ],
    featured: true,
  },
];

export const Route = createFileRoute("/_authenticated/predplatne")({
  head: () => ({ meta: [{ title: "Predplatné — Faktero" }] }),
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Chyba: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Nenájdené</div>,
  component: PredplatnePage,
});

function fmtEur(cents: number | null | undefined) {
  if (cents == null) return "—";
  return `${(cents / 100).toFixed(2)} €`;
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("sk-SK"); } catch { return "—"; }
}

const STATUS_LABEL: Record<string, string> = {
  trialing: "Skúšobná verzia",
  active: "Aktívne",
  past_due: "Po splatnosti",
  cancelled: "Zrušené",
  expired: "Neaktívne",
};

function PredplatnePage() {
  const fetchBilling = useServerFn(getMyBilling);
  const fetchPlans = useServerFn(listPlans);
  const fetchHistory = useServerFn(getPaymentHistory);
  const checkoutFn = useServerFn(createCheckout);
  const cancelFn = useServerFn(cancelSubscription);
  const reactivateFn = useServerFn(reactivateSubscription);
  const syncFn = useServerFn(syncMyLatestPayment);
  const queryClient = useQueryClient();

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [billing, setBilling] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [productMode, setProductMode] = useState<ProductMode>("invoicing");
  const [tab, setTab] = useState<ProductTab>(() => getActiveProduct() ?? "invoicing");

  useEffect(() => {
    // Detect ?payment=return
    const params = new URLSearchParams(window.location.search);
    const p = params.get("payment");
    if (p === "return") {
      toast.info("Spracúvame výsledok platby. Stav sa aktualizuje po potvrdení z GoPay.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Load user's product_mode from profile
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user || cancelled) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("product_mode")
        .eq("id", data.user.id)
        .maybeSingle();
      if (cancelled) return;
      const mode = (p?.product_mode ?? "invoicing") as ProductMode;
      setProductMode(mode);
      // If user only has logbook access, default tab to logbook
      if (mode === "logbook") setTab("logbook");
      else if (mode === "invoicing") setTab("invoicing");
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let cid = getActiveCompanyId();
        if (!cid) {
          const list = await fetchMyCompanies();
          cid = list[0]?.id ?? null;
        }
        if (!cid) {
          if (!cancelled) setLoading(false);
          return;
        }
        const [b, p, h] = await Promise.all([
          fetchBilling({ data: { companyId: cid } }),
          fetchPlans(),
          fetchHistory({ data: { companyId: cid } }),
        ]);
        if (!cancelled) {
          setCompanyId(cid);
          setBilling(b);
          setPlans(p as any[]);
          setHistory(h as any[]);
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Nepodarilo sa načítať predplatné");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchBilling, fetchPlans, fetchHistory]);

  async function refresh() {
    if (!companyId) return;
    const [b, h] = await Promise.all([
      fetchBilling({ data: { companyId } }),
      fetchHistory({ data: { companyId } }),
    ]);
    setBilling(b);
    setHistory(h as any[]);
  }

  async function selectPlan(slug: string) {
    if (!companyId) return;
    if (slug === "enterprise") {
      window.location.href = "mailto:obchod@faktero.sk?subject=Záujem o Enterprise plán";
      return;
    }
    setBusySlug(slug);
    try {
      const res = await checkoutFn({ data: { companyId, planSlug: slug as any } });
      window.location.href = (res as any).gw_url;
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa spustiť platbu");
    } finally {
      setBusySlug(null);
    }
  }

  async function doCancel() {
    if (!companyId) return;
    if (!confirm("Naozaj zrušiť predplatné na konci aktuálneho obdobia?")) return;
    try {
      await cancelFn({ data: { companyId } });
      toast.success("Predplatné bude zrušené na konci obdobia");
      await refresh();
    } catch (e: any) { toast.error(e?.message ?? "Chyba"); }
  }
  async function doReactivate() {
    if (!companyId) return;
    try {
      await reactivateFn({ data: { companyId } });
      toast.success("Predplatné obnovené");
      await refresh();
    } catch (e: any) { toast.error(e?.message ?? "Chyba"); }
  }
  const [syncing, setSyncing] = useState(false);
  async function doSync() {
    if (!companyId) return;
    setSyncing(true);
    try {
      const r: any = await syncFn({ data: { companyId } });
      if (r?.reason === "no_payment") toast.info("Žiadna platba na synchronizáciu.");
      else if (r?.reason === "missing_payment_id") toast.error(r.error ?? "Posledná platba nemá GoPay ID.");
      else toast.success(`Stav platby: ${r?.state ?? "—"}`);
      await refresh();
      queryClient.invalidateQueries({ queryKey: ["plan-gate-billing"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Synchronizácia zlyhala");
    } finally {
      setSyncing(false);
    }
  }

  const planUsageInvoices = useMemo(() => {
    const used = billing?.usage?.invoices_this_month ?? 0;
    const limit = billing?.plan?.invoice_limit;
    if (limit == null) return { used, limit: null, pct: 0 };
    return { used, limit, pct: Math.min(100, Math.round((used / limit) * 100)) };
  }, [billing]);

  const planUsageUsers = useMemo(() => {
    const used = billing?.usage?.users_count ?? 0;
    const limit = billing?.plan?.user_limit;
    if (limit == null) return { used, limit: null, pct: 0 };
    return { used, limit, pct: Math.min(100, Math.round((used / limit) * 100)) };
  }, [billing]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const plan = billing?.plan;
  const isAdminLike = billing?.role === "owner" || billing?.role === "admin";

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Predplatné</h1>
        <p className="text-sm text-muted-foreground">
          Spravujte plán a fakturáciu vašej firmy.
        </p>
      </header>

      {/* Current plan card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base">Aktuálny plán</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {plan?.plan_name ?? "—"} ·{" "}
              <Badge variant={plan?.is_active ? "default" : "destructive"} className="ml-1">
                {STATUS_LABEL[plan?.status ?? ""] ?? plan?.status ?? "—"}
              </Badge>
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold">
              {plan?.plan_slug === "enterprise" ? "—" : fmtEur(planPriceFromSlug(plans, plan?.plan_slug))}
            </div>
            <div className="text-xs text-muted-foreground">/ mesiac</div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {plan?.is_trialing && plan.trial_days_left != null && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
              <strong>Skúšobná verzia končí</strong> o {plan.trial_days_left}{" "}
              {plDni(plan.trial_days_left)} ·{" "}
              {fmtDate(plan.trial_ends_at)}
            </div>
          )}
          {!plan?.is_active && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              Predplatné je neaktívne. Aplikácia je v režime len na čítanie. Aktivujte plán nižšie.
            </div>
          )}

          {plan?.is_active && (
            <div className="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-900 dark:text-blue-100">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
              <p>
                Predplatné sa automaticky obnovuje každý mesiac. Platba je spracovaná cez GoPay (Visa/Mastercard). Zrušiť môžete kedykoľvek kliknutím na „Zrušiť predplatné“.
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <UsageRow
              label="Faktúry tento mesiac"
              used={planUsageInvoices.used}
              limit={planUsageInvoices.limit}
              pct={planUsageInvoices.pct}
            />
            <UsageRow
              label="Používatelia"
              used={planUsageUsers.used}
              limit={planUsageUsers.limit}
              pct={planUsageUsers.pct}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
            <FeaturePill enabled={plan?.api_enabled} label="API" />
            <FeaturePill enabled={plan?.webhooks_enabled} label="Webhooky" />
            <FeaturePill enabled={plan?.recurring_enabled} label="Opakované faktúry" />
            <FeaturePill enabled={plan?.efaktura_enabled} label="eFaktúra" />
            <FeaturePill enabled={plan?.bank_matching_enabled} label="Bankové párovanie" />
          </div>

          {isAdminLike && plan?.status === "active" && (
            <div className="flex flex-wrap gap-2 pt-3">
              <Button variant="outline" size="sm" onClick={doCancel}>
                Zrušiť predplatné
              </Button>
            </div>
          )}
          {isAdminLike && plan?.status === "cancelled" && (
            <Button variant="outline" size="sm" onClick={doReactivate}>
              Obnoviť predplatné
            </Button>
          )}
          {isAdminLike && (
            <div className="flex flex-wrap gap-2 pt-3">
              <Button variant="secondary" size="sm" onClick={doSync} disabled={syncing}>
                {syncing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Synchronizovať stav platby
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plans grid */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Zmeniť plán</h2>
          {productMode === "both" && (
            <div className="inline-flex rounded-lg border border-border bg-muted p-1 text-sm">
              <button
                type="button"
                onClick={() => setTab("invoicing")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${tab === "invoicing" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                <FileText className="h-3.5 w-3.5" /> Fakturačný systém
              </button>
              <button
                type="button"
                onClick={() => setTab("logbook")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${tab === "logbook" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Car className="h-3.5 w-3.5" /> Kniha jázd
              </button>
            </div>
          )}
        </div>

        {tab === "invoicing" ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => (
              <PlanCard
                key={p.slug}
                p={p}
                current={p.slug === plan?.plan_slug}
                loading={busySlug === p.slug}
                disabled={!isAdminLike || busySlug !== null}
                onSelect={() => selectPlan(p.slug)}
              />
            ))}
          </div>
        ) : (
          <LogbookPlans isAdminLike={isAdminLike} />
        )}

        {!isAdminLike && (
          <p className="text-xs text-muted-foreground">
            Plán môže meniť iba majiteľ alebo administrátor firmy.
          </p>
        )}
      </section>

      {/* Payment history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">História platieb</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Zatiaľ žiadne platby.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Dátum</th>
                    <th className="px-3 py-2">Plán</th>
                    <th className="px-3 py-2">Suma</th>
                    <th className="px-3 py-2">Stav</th>
                    <th className="px-3 py-2">GoPay ID</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-t border-border">
                      <td className="px-3 py-2">{fmtDate(h.paid_at ?? h.created_at)}</td>
                      <td className="px-3 py-2">{h.plan_slug ?? "—"}</td>
                      <td className="px-3 py-2">{fmtEur(h.amount_cents)}</td>
                      <td className="px-3 py-2">
                        <Badge variant={h.status === "PAID" ? "default" : "secondary"}>
                          {h.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{h.provider_payment_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground space-y-1.5">
        <p><strong className="text-foreground">Ceny a DPH:</strong> Uvedené ceny sú bez DPH. Prevádzkovateľ je platca DPH; k cene sa uplatňuje sadzba <strong>23 %</strong> (Starter 9 € → 11,07 € s DPH; Premium 19 € → 23,37 € s DPH).</p>
        <p><strong className="text-foreground">Automatické obnovenie:</strong> Predplatné sa po skončení obdobia automaticky obnovuje, kým ho nezrušíte. Zrušiť môžete kedykoľvek — prístup ostáva do konca zaplateného obdobia.</p>
        <p><strong className="text-foreground">Platba:</strong> Bezpečne cez GoPay (Visa, Mastercard, 3-D Secure, bankový prevod). Údaje karty spracúva výhradne GoPay.</p>
        <p>Kliknutím na „Aktivovať plán“ potvrdzujete súhlas s <a href="/pravne/obchodne-podmienky" target="_blank" rel="noopener" className="underline">Obchodnými podmienkami</a> a <a href="/pravne/gopay-podmienky" target="_blank" rel="noopener" className="underline">GoPay podmienkami</a>.</p>
      </div>

      <p className="pt-2 text-center text-xs text-muted-foreground">
        Platby spracováva GoPay. <Link to={"/" as any} className="underline">Späť na úvod</Link>
      </p>

    </div>
  );
}

function planPriceFromSlug(plans: any[], slug: string | undefined) {
  return plans.find((p) => p.slug === slug)?.price_monthly_cents ?? null;
}

function UsageRow({ label, used, limit, pct }: { label: string; used: number; limit: number | null; pct: number }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {used}
          {limit != null && <span className="text-muted-foreground"> / {limit}</span>}
          {limit == null && <span className="text-muted-foreground"> · neobmedzené</span>}
        </span>
      </div>
      {limit != null && <Progress value={pct} className="h-1.5" />}
    </div>
  );
}

function FeaturePill({ enabled, label }: { enabled: boolean | undefined; label: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs " +
        (enabled
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "bg-muted text-muted-foreground line-through")
      }
    >
      <Check className="h-3 w-3" /> {label}
    </span>
  );
}

function PlanCard({
  p, current, loading, disabled, onSelect,
}: {
  p: any;
  current: boolean;
  loading: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const icon = p.slug === "premium" ? <Crown className="h-4 w-4" />
    : p.slug === "enterprise" ? <ShieldCheck className="h-4 w-4" />
    : p.slug === "starter" ? <Zap className="h-4 w-4" />
    : <CreditCard className="h-4 w-4" />;

  const features: string[] = [];
  if (p.invoice_limit == null) features.push("Neobmedzené faktúry");
  else features.push(`${p.invoice_limit} faktúr / mesiac`);
  if (p.user_limit == null) features.push("Neobmedzene používateľov");
  else features.push(`${p.user_limit} používateľ${p.user_limit === 1 ? "" : "ia"}`);
  if (p.api_enabled) features.push("API");
  if (p.webhooks_enabled) features.push("Webhooky");
  if (p.recurring_enabled) features.push("Opakované faktúry");
  if (p.efaktura_enabled) features.push("eFaktúra");
  if (p.bank_matching_enabled) features.push("Bankové párovanie");
  if (p.priority_support) features.push("Prioritná podpora");

  return (
    <Card className={current ? "border-primary ring-1 ring-primary/30" : ""}>
      <CardHeader>
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon} {p.name}
        </div>
        <div className="pt-2">
          {p.price_monthly_cents == null ? (
            <div className="text-2xl font-semibold">Individuálne</div>
          ) : (
            <>
              <span className="text-3xl font-semibold">{fmtEur(p.price_monthly_cents)}</span>
              <span className="text-sm text-muted-foreground"> / mes.</span>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1.5 text-sm">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <Button
          className="w-full"
          variant={current ? "secondary" : "default"}
          disabled={disabled || current}
          onClick={onSelect}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" />
            : current ? "Aktuálny plán"
            : p.slug === "enterprise" ? "Kontaktovať obchod"
            : "Aktivovať plán"}
        </Button>
      </CardContent>
    </Card>
  );
}