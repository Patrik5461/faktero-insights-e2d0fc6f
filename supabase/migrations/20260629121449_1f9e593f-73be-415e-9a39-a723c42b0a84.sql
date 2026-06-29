
-- Add new feature flag columns
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS import_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS audit_log_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS company_limit integer,
  ADD COLUMN IF NOT EXISTS accountant_seats integer NOT NULL DEFAULT 0;

-- Update Starter
UPDATE public.subscription_plans SET
  price_monthly_cents = 900,
  user_limit = 2,
  accountant_seats = 1,
  company_limit = 1,
  api_enabled = false,
  webhooks_enabled = false,
  recurring_enabled = true,
  efaktura_enabled = true,
  bank_matching_enabled = true,
  import_enabled = false,
  audit_log_enabled = false,
  priority_support = false,
  sort_order = 10,
  active = true
WHERE slug = 'starter';

-- Migrate existing Business subscriptions to Premium
UPDATE public.subscriptions SET
  plan = 'premium',
  plan_id = (SELECT id FROM public.subscription_plans WHERE slug = 'premium'),
  monthly_price_cents = 1900
WHERE plan = 'business';

-- Update Premium: 19€ with full features
UPDATE public.subscription_plans SET
  name = 'Premium',
  price_monthly_cents = 1900,
  user_limit = NULL,
  accountant_seats = 0,
  company_limit = NULL,
  api_enabled = true,
  webhooks_enabled = true,
  recurring_enabled = true,
  efaktura_enabled = true,
  bank_matching_enabled = true,
  import_enabled = true,
  audit_log_enabled = true,
  priority_support = true,
  sort_order = 20,
  active = true
WHERE slug = 'premium';

-- Deactivate Business (keep row for FK integrity / history)
UPDATE public.subscription_plans SET
  active = false,
  sort_order = 999
WHERE slug = 'business';

-- Update Enterprise
UPDATE public.subscription_plans SET
  name = 'Enterprise',
  price_monthly_cents = NULL,
  user_limit = NULL,
  accountant_seats = 0,
  company_limit = NULL,
  api_enabled = true,
  webhooks_enabled = true,
  recurring_enabled = true,
  efaktura_enabled = true,
  bank_matching_enabled = true,
  import_enabled = true,
  audit_log_enabled = true,
  priority_support = true,
  sort_order = 30,
  active = true
WHERE slug = 'enterprise';

-- Update trial-create function to default to Premium (Business removed)
CREATE OR REPLACE FUNCTION public.create_trial_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _plan_id uuid;
  _price integer;
BEGIN
  SELECT id, price_monthly_cents INTO _plan_id, _price
  FROM public.subscription_plans WHERE slug = 'premium';

  INSERT INTO public.subscriptions (
    company_id, plan, plan_id, status, trial_ends_at,
    current_period_start, current_period_end,
    monthly_price_cents, payment_provider
  ) VALUES (
    NEW.id, 'premium', _plan_id, 'trialing',
    now() + interval '14 days',
    now(), now() + interval '14 days',
    _price, 'gopay'
  )
  ON CONFLICT (company_id) DO NOTHING;

  RETURN NEW;
END;
$function$;
