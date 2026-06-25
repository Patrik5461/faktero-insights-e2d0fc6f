
-- 1. Extend status enum
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'expired';

-- 2. subscription_plans catalog
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  price_monthly_cents integer,
  invoice_limit integer,
  user_limit integer,
  api_enabled boolean NOT NULL DEFAULT false,
  webhooks_enabled boolean NOT NULL DEFAULT false,
  recurring_enabled boolean NOT NULL DEFAULT false,
  efaktura_enabled boolean NOT NULL DEFAULT false,
  bank_matching_enabled boolean NOT NULL DEFAULT false,
  priority_support boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscription_plans TO authenticated, anon;
GRANT ALL ON public.subscription_plans TO service_role;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active plans" ON public.subscription_plans
  FOR SELECT USING (active = true);
CREATE POLICY "Platform admins manage plans" ON public.subscription_plans
  FOR ALL USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER trg_subscription_plans_updated BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed plans
INSERT INTO public.subscription_plans (slug, name, price_monthly_cents, invoice_limit, user_limit, api_enabled, webhooks_enabled, recurring_enabled, efaktura_enabled, bank_matching_enabled, priority_support, sort_order)
VALUES
  ('starter',    'Starter',    900,  100,  1,    false, false, false, false, false, false, 10),
  ('business',   'Business',   1900, NULL, 10,   true,  true,  true,  false, false, false, 20),
  ('premium',    'Premium',    3900, NULL, NULL, true,  true,  true,  true,  true,  true,  30),
  ('enterprise', 'Enterprise', NULL, NULL, NULL, true,  true,  true,  true,  true,  true,  40)
ON CONFLICT (slug) DO NOTHING;

-- 3. Extend subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.subscription_plans(id),
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS gopay_payment_id text,
  ADD COLUMN IF NOT EXISTS gopay_subscription_id text,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

-- 4. billing_payments
CREATE TABLE IF NOT EXISTS public.billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  plan_slug text,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  status text NOT NULL,
  provider text NOT NULL DEFAULT 'gopay',
  provider_payment_id text NOT NULL,
  paid_at timestamptz,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_payment_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_payments_company ON public.billing_payments(company_id, created_at DESC);

GRANT SELECT ON public.billing_payments TO authenticated;
GRANT ALL ON public.billing_payments TO service_role;

ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read billing payments" ON public.billing_payments
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()) OR public.is_platform_admin(auth.uid()));

CREATE TRIGGER trg_billing_payments_updated BEFORE UPDATE ON public.billing_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. billing_events
CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_company ON public.billing_events(company_id, created_at DESC);

GRANT SELECT ON public.billing_events TO authenticated;
GRANT ALL ON public.billing_events TO service_role;

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read billing events" ON public.billing_events
  FOR SELECT TO authenticated
  USING (
    (company_id IS NOT NULL AND public.is_company_member(company_id, auth.uid()))
    OR public.is_platform_admin(auth.uid())
  );

-- 6. Auto-create 14-day trial subscription on new company
CREATE OR REPLACE FUNCTION public.create_trial_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _business_plan_id uuid;
  _business_price integer;
BEGIN
  SELECT id, price_monthly_cents INTO _business_plan_id, _business_price
  FROM public.subscription_plans WHERE slug = 'business';

  INSERT INTO public.subscriptions (
    company_id, plan, plan_id, status, trial_ends_at,
    current_period_start, current_period_end,
    monthly_price_cents, payment_provider
  ) VALUES (
    NEW.id, 'business', _business_plan_id, 'trialing',
    now() + interval '14 days',
    now(), now() + interval '14 days',
    _business_price, 'gopay'
  )
  ON CONFLICT (company_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_create_trial ON public.companies;
CREATE TRIGGER trg_companies_create_trial
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.create_trial_subscription();

-- Backfill trial for existing companies without subscription
INSERT INTO public.subscriptions (company_id, plan, plan_id, status, trial_ends_at, current_period_start, current_period_end, monthly_price_cents, payment_provider)
SELECT
  c.id, 'business',
  (SELECT id FROM public.subscription_plans WHERE slug='business'),
  'trialing',
  now() + interval '14 days',
  now(), now() + interval '14 days',
  1900, 'gopay'
FROM public.companies c
LEFT JOIN public.subscriptions s ON s.company_id = c.id
WHERE s.id IS NULL;
