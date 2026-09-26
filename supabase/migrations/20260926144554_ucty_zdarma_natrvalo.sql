-- Účty, ktoré majú plán natrvalo zadarmo.
--
-- Doteraz sa taká firma musela prepnúť ručne a pri každej novej firme toho
-- istého človeka znovu — a keď sa zabudlo, predplatné jej po mesiaci uplynulo
-- a cron ju označil za neplatiča. Zoznam je podľa e-mailu zakladateľa, takže
-- pravidlo platí aj pre firmy, ktoré ešte len vzniknú.
create table if not exists public.platform_free_accounts (
  email text primary key,
  plan_slug text not null default 'enterprise',
  note text,
  created_at timestamptz not null default now()
);

alter table public.platform_free_accounts enable row level security;

-- Tabuľku číta a mení len platforma (server cez service_role) a superadmin;
-- bežný používateľ o nej nemá vedieť vôbec.
revoke all on public.platform_free_accounts from public;
grant select, insert, update, delete on public.platform_free_accounts to service_role;

drop policy if exists platform_free_accounts_admin on public.platform_free_accounts;
create policy platform_free_accounts_admin on public.platform_free_accounts
  for all to authenticated
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()))
  with check (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));

insert into public.platform_free_accounts (email, plan_slug, note)
values ('info@paliera.sk', 'enterprise', 'Vlastné firmy prevádzkovateľa — Enterprise natrvalo.')
on conflict (email) do update set plan_slug = excluded.plan_slug, note = excluded.note;

-- Nová firma: buď 30-dňová skúšobná verzia, alebo rovno plán zadarmo.
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
      monthly_price_cents, payment_provider, is_post_trial_free
    ) VALUES (
      NEW.id, _zdarma, _plan_id, 'active', NULL,
      now(), NULL, NULL,
      0, NULL, true
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

-- Existujúce firmy takého účtu sa zrovnajú hneď.
update public.subscriptions s
   set plan = f.plan_slug,
       plan_id = (select id from public.subscription_plans p where p.slug = f.plan_slug),
       status = 'active',
       trial_ends_at = null,
       current_period_end = null,
       next_billing_at = null,
       monthly_price_cents = 0,
       payment_provider = null,
       is_post_trial_free = true,
       cancel_at_period_end = false,
       billing_suspended = false,
       renewal_attempts = 0,
       last_renewal_error = null
  from public.companies c
  join auth.users u on u.id = c.created_by
  join public.platform_free_accounts f on lower(f.email) = lower(u.email)
 where s.company_id = c.id;
