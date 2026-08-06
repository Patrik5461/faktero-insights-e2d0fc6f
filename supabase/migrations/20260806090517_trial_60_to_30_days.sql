-- Skúšobné obdobie: 60 → 30 dní.
-- Mení sa dĺžka trialu pre nové registrácie + SEO text na /cennik.
-- Overené pred aplikovaním: 0 predplatných v stave 'trialing', takže sa nikomu neskracuje bežiaci trial.

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
    now() + interval '30 days',
    now(), now() + interval '30 days',
    _price, 'gopay'
  )
  ON CONFLICT (company_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_trial_subscription() FROM PUBLIC, anon, authenticated;

UPDATE public.seo_pages
   SET description = replace(description, '60 dní zadarmo', '30 dní zadarmo')
 WHERE description LIKE '%60 dní zadarmo%';
