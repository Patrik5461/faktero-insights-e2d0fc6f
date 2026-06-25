/**
 * Plan / subscription helpers. Pure read utilities that can run in
 * both server and client contexts; pass any Supabase client in.
 */

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "expired";

export type Feature =
  | "api"
  | "webhooks"
  | "recurring"
  | "efaktura"
  | "bank_matching";

export type CompanyPlanInfo = {
  plan_slug: string;
  plan_name: string;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  invoice_limit: number | null;
  user_limit: number | null;
  api_enabled: boolean;
  webhooks_enabled: boolean;
  recurring_enabled: boolean;
  efaktura_enabled: boolean;
  bank_matching_enabled: boolean;
  is_active: boolean; // can still write
  is_trialing: boolean;
  trial_days_left: number | null;
};

export function isActiveStatus(status: SubscriptionStatus): boolean {
  return status === "trialing" || status === "active" || status === "past_due";
}

export function trialDaysLeft(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

/**
 * Slovak grammar for "deň/dni/dní" — 0 → dní, 1 → deň, 2-4 → dni, 5+ → dní.
 */
export function plDni(n: number): string {
  if (n === 1) return "deň";
  if (n >= 2 && n <= 4) return "dni";
  return "dní";
}

export async function getCompanyPlan(
  supabase: any,
  companyId: string,
): Promise<CompanyPlanInfo | null> {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select(
      "status, trial_ends_at, current_period_end, plan, subscription_plans(slug, name, invoice_limit, user_limit, api_enabled, webhooks_enabled, recurring_enabled, efaktura_enabled, bank_matching_enabled)"
    )
    .eq("company_id", companyId)
    .maybeSingle();

  if (!sub) return null;
  const planRow = (sub as any).subscription_plans;
  // Fallback to plan slug lookup if join missing
  let plan = planRow;
  if (!plan) {
    const { data: p } = await supabase
      .from("subscription_plans")
      .select("slug, name, invoice_limit, user_limit, api_enabled, webhooks_enabled, recurring_enabled, efaktura_enabled, bank_matching_enabled")
      .eq("slug", (sub as any).plan ?? "business")
      .maybeSingle();
    plan = p;
  }
  const status = (sub as any).status as SubscriptionStatus;
  return {
    plan_slug: plan?.slug ?? (sub as any).plan ?? "business",
    plan_name: plan?.name ?? "—",
    status,
    trial_ends_at: (sub as any).trial_ends_at,
    current_period_end: (sub as any).current_period_end,
    invoice_limit: plan?.invoice_limit ?? null,
    user_limit: plan?.user_limit ?? null,
    api_enabled: !!plan?.api_enabled,
    webhooks_enabled: !!plan?.webhooks_enabled,
    recurring_enabled: !!plan?.recurring_enabled,
    efaktura_enabled: !!plan?.efaktura_enabled,
    bank_matching_enabled: !!plan?.bank_matching_enabled,
    is_active: isActiveStatus(status),
    is_trialing: status === "trialing",
    trial_days_left: trialDaysLeft((sub as any).trial_ends_at),
  };
}

export function hasFeature(info: CompanyPlanInfo | null, feature: Feature): boolean {
  if (!info || !info.is_active) return false;
  switch (feature) {
    case "api": return info.api_enabled;
    case "webhooks": return info.webhooks_enabled;
    case "recurring": return info.recurring_enabled;
    case "efaktura": return info.efaktura_enabled;
    case "bank_matching": return info.bank_matching_enabled;
  }
}