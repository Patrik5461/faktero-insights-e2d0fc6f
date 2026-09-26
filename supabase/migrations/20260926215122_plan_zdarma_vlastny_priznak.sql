-- Pridelený plán zadarmo má vlastný príznak.
--
-- Doteraz sa na to použilo `is_post_trial_free`, lenže to znamená niečo iné:
-- „skúšobná verzia skončila a účet spadol na bezplatný Starter". Pruh nad
-- aplikáciou sa podľa neho riadi, takže firmám s prideleným Enterprise písal,
-- že im skončil trial a bežia na Starteri — presný opak pravdy.
alter table public.subscriptions
  add column if not exists free_forever boolean not null default false;

comment on column public.subscriptions.free_forever is
  'Plán pridelený natrvalo zadarmo (zoznam platform_free_accounts). Neúčtuje sa a nie je to dôsledok skončeného trialu.';

-- Firmy z dnešného prepnutia dostanú správny príznak.
update public.subscriptions s
   set free_forever = true,
       is_post_trial_free = false
  from public.companies c
  join auth.users u on u.id = c.created_by
  join public.platform_free_accounts f on lower(f.email) = lower(u.email)
 where s.company_id = c.id;

-- Nová firma účtu zadarmo.
create or replace function public.create_trial_subscription()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  _plan_id uuid;
  _price integer;
  _zdarma text;
  _email text;
BEGIN
  SELECT u.email INTO _email FROM auth.users u WHERE u.id = NEW.created_by;
  SELECT f.plan_slug INTO _zdarma
    FROM public.platform_free_accounts f
   WHERE lower(f.email) = lower(coalesce(_email, ''));

  IF _zdarma IS NOT NULL THEN
    SELECT id INTO _plan_id FROM public.subscription_plans WHERE slug = _zdarma;
    INSERT INTO public.subscriptions (
      company_id, plan, plan_id, status, trial_ends_at,
      current_period_start, current_period_end, next_billing_at,
      monthly_price_cents, payment_provider, is_post_trial_free, free_forever
    ) VALUES (
      NEW.id, _zdarma, _plan_id, 'active', NULL,
      now(), NULL, NULL,
      0, NULL, false, true
    )
    ON CONFLICT (company_id) DO NOTHING;
    RETURN NEW;
  END IF;

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

-- Prepnutie existujúcich firiem z admin obrazovky.
create or replace function public.zrovnaj_ucty_zdarma(p_email text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  _pocet integer;
begin
  with dotknute as (
    update public.subscriptions s
       set plan = f.plan_slug,
           plan_id = (select id from public.subscription_plans p where p.slug = f.plan_slug),
           status = 'active',
           trial_ends_at = null,
           current_period_end = null,
           next_billing_at = null,
           monthly_price_cents = 0,
           payment_provider = null,
           is_post_trial_free = false,
           free_forever = true,
           cancel_at_period_end = false,
           billing_suspended = false,
           renewal_attempts = 0,
           last_renewal_error = null
      from public.companies c
      join auth.users u on u.id = c.created_by
      join public.platform_free_accounts f on lower(f.email) = lower(u.email)
     where s.company_id = c.id
       and lower(u.email) = lower(p_email)
    returning s.company_id
  )
  select count(*) into _pocet from dotknute;
  return coalesce(_pocet, 0);
end;
$$;
