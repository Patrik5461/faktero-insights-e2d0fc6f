-- Pomocné funkcie pre správu účtov s plánom zadarmo.
--
-- `auth.users` nie je pre klienta viditeľná a server k nej ide cez servisný
-- kľúč; obe funkcie sú `security definer`, aby si admin obrazovka vedela
-- dohľadať používateľa podľa e-mailu a prepnúť jeho firmy jedným volaním.

-- Id používateľa podľa e-mailu (alebo NULL, keď taký účet ešte nevznikol).
create or replace function public.pouzivatel_podla_emailu(p_email text)
 returns uuid
 language sql
 security definer
 set search_path to 'public'
as $$
  select u.id from auth.users u where lower(u.email) = lower(p_email) limit 1;
$$;

revoke all on function public.pouzivatel_podla_emailu(text) from public;
grant execute on function public.pouzivatel_podla_emailu(text) to service_role;

-- Prepne firmy daného účtu na jeho plán zadarmo a vráti ich počet.
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
           is_post_trial_free = true,
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

revoke all on function public.zrovnaj_ucty_zdarma(text) from public;
grant execute on function public.zrovnaj_ucty_zdarma(text) to service_role;
