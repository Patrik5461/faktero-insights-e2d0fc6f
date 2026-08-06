import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, Zap } from "lucide-react";
import { getMyBilling } from "@/lib/faktero/billing.functions";
import { plDni } from "@/lib/faktero/plan-enforcement";

type Billing = any;

/**
 * Global banner shown above app pages. Detects subscription state and
 * route context to surface the most relevant upgrade/expiry message:
 * - Trial expired / billing suspended → read-only mode
 * - Invoice limit reached → upgrade to higher plan
 * - On /api-kluce or /webhooky without entitlement → upgrade from Starter
 * - On /opakovane without entitlement → upgrade from Starter
 */
export function PlanGateBanner({ companyId }: { companyId: string | null }) {
  const fetchBilling = useServerFn(getMyBilling);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: billing } = useQuery<Billing>({
    queryKey: ["plan-gate-billing", companyId],
    queryFn: () => fetchBilling({ data: { companyId: companyId as string } }),
    enabled: !!companyId,
    staleTime: 60_000,
    retry: false,
  });
  if (!billing?.plan) return null;
  const plan = billing.plan;

  // 1. Hard inactive (expired trial / cancelled / suspended)
  if (!plan.is_active) {
    return (
      <Banner tone="destructive" icon={<AlertTriangle className="h-4 w-4" />}>
        <strong>Predplatné je neaktívne.</strong> Aplikácia je v režime len na čítanie — môžete
        prezerať a sťahovať PDF, no nemôžete vytvárať nové záznamy.{" "}
        <Link to="/predplatne" className="underline">
          Aktivovať plán
        </Link>
      </Banner>
    );
  }

  // 1b. Trial ended → auto-downgraded to Starter (free)
  if ((plan as any).is_post_trial_free) {
    return (
      <Banner tone="warning" icon={<Clock className="h-4 w-4" />}>
        <strong>Vaša 30-dňová skúšobná verzia skončila.</strong> Účet pokračuje na bezplatnom pláne
        Starter. Pre plný prístup k Premium funkciám si aktivujte plán.{" "}
        <Link to="/predplatne" className="underline">
          Vybrať plán
        </Link>
      </Banner>
    );
  }

  // 2. Trial ending soon
  if (plan.is_trialing && plan.trial_days_left != null && plan.trial_days_left <= 3) {
    return (
      <Banner tone="warning" icon={<Clock className="h-4 w-4" />}>
        <strong>Skúšobná verzia končí</strong> o {plan.trial_days_left}{" "}
        {plDni(plan.trial_days_left)}.{" "}
        <Link to="/predplatne" className="underline">
          Aktivovať plán
        </Link>
      </Banner>
    );
  }

  // 3. Invoice limit reached
  const used = billing?.usage?.invoices_this_month ?? 0;
  const limit = plan.invoice_limit;
  if (
    limit != null &&
    used >= limit &&
    (pathname.startsWith("/faktury") || pathname.startsWith("/dashboard"))
  ) {
    return (
      <Banner tone="destructive" icon={<AlertTriangle className="h-4 w-4" />}>
        <strong>Limit faktúr dosiahnutý</strong> ({used}/{limit} tento mesiac).{" "}
        <Link to="/predplatne" className="underline">
          Prejsť na vyšší plán
        </Link>
      </Banner>
    );
  }

  // 4. Feature not on plan
  if (
    (pathname.startsWith("/api-kluce") ||
      pathname.startsWith("/api-dokumentacia") ||
      pathname.startsWith("/api-playground")) &&
    !plan.api_enabled
  ) {
    return (
      <Banner tone="warning" icon={<Zap className="h-4 w-4" />}>
        <strong>API nie je dostupné na pláne {plan.plan_name}.</strong>{" "}
        <Link to="/predplatne" className="underline">
          Prejsť na Business alebo vyšší
        </Link>
      </Banner>
    );
  }
  if (pathname.startsWith("/webhooky") && !plan.webhooks_enabled) {
    return (
      <Banner tone="warning" icon={<Zap className="h-4 w-4" />}>
        <strong>Webhooky nie sú dostupné na pláne {plan.plan_name}.</strong>{" "}
        <Link to="/predplatne" className="underline">
          Prejsť na vyšší plán
        </Link>
      </Banner>
    );
  }
  if (pathname.startsWith("/opakovane") && !plan.recurring_enabled) {
    return (
      <Banner tone="warning" icon={<Zap className="h-4 w-4" />}>
        <strong>Opakované faktúry nie sú dostupné na pláne {plan.plan_name}.</strong>{" "}
        <Link to="/predplatne" className="underline">
          Prejsť na vyšší plán
        </Link>
      </Banner>
    );
  }

  return null;
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: "destructive" | "warning";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const cls =
    tone === "destructive"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200";
  return (
    <div className={`flex items-start gap-2 border-b px-4 py-2 text-sm sm:px-6 ${cls}`}>
      <span className="mt-0.5">{icon}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}
