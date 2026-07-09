
-- 1) Trial length: 14 → 60 days
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
    now() + interval '60 days',
    now(), now() + interval '60 days',
    _price, 'gopay'
  )
  ON CONFLICT (company_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_trial_subscription() FROM PUBLIC, anon, authenticated;

-- 2) New columns for post-trial state + reminder idempotency
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS is_post_trial_free boolean NOT NULL DEFAULT false;
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_reminder_sent_at timestamptz;

-- 3) Extend existing active trials to 60 days from company creation (never shorten)
UPDATE public.subscriptions s
SET trial_ends_at = c.created_at + interval '60 days',
    current_period_end = GREATEST(s.current_period_end, c.created_at + interval '60 days')
FROM public.companies c
WHERE s.company_id = c.id
  AND s.status = 'trialing'
  AND s.trial_ends_at IS NOT NULL
  AND (c.created_at + interval '60 days') > s.trial_ends_at;

-- 4) Trial expiry processor — downgrades expired trials to Starter (keeps app writable)
CREATE OR REPLACE FUNCTION public.faktero_process_trial_expiry()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _starter_id uuid;
  _starter_price integer;
  _count integer;
BEGIN
  SELECT id, price_monthly_cents INTO _starter_id, _starter_price
  FROM public.subscription_plans WHERE slug = 'starter';

  IF _starter_id IS NULL THEN
    RAISE EXCEPTION 'starter plan missing';
  END IF;

  WITH upd AS (
    UPDATE public.subscriptions
       SET status = 'active',
           plan = 'starter',
           plan_id = _starter_id,
           monthly_price_cents = _starter_price,
           is_post_trial_free = true,
           current_period_start = now(),
           current_period_end = now() + interval '30 days'
     WHERE status = 'trialing'
       AND trial_ends_at IS NOT NULL
       AND trial_ends_at < now()
     RETURNING 1
  )
  SELECT count(*) INTO _count FROM upd;

  RETURN COALESCE(_count, 0);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.faktero_process_trial_expiry() FROM PUBLIC, anon, authenticated;
