-- Testovacie firmy („Test – <názov firmy>“).
--
-- Každá skutočná firma dostane jednu testovaciu kópiu, ktorú vidia len jej
-- členovia (členstvo sa zrkadlí). V testovacej firme sa dá skúšať všetko bez
-- dopadu na skutočnú: nič sa neodosiela (stráže v kóde), predplatné je
-- zadarmo navždy, upomienky vypnuté.
--
-- IČO testovacej firmy je NULL — žiadne párovanie podľa IČO (prenos
-- z Doklada, registre, import, Nespracované, Pohoda) ju tak nevyberie
-- namiesto skutočnej. DIČ a IČ DPH sa kopírujú (aby faktúry vyzerali ako
-- skutočné) a párovanie podľa nich vynecháva `testovacia_pre is not null`.
--
-- Logo a pečiatka sa nekopírujú: `cesta_vo_firme` vyžaduje cestu pod id
-- vlastnej firmy.

-- 1. Stĺpec, jedinečnosť, pomocník -------------------------------------------

alter table public.companies
  add column if not exists testovacia_pre uuid
    references public.companies(id) on delete cascade;

comment on column public.companies.testovacia_pre is
  'Id skutočnej firmy, ku ktorej patrí táto testovacia firma; NULL = skutočná firma.';

create unique index if not exists companies_testovacia_pre_uniq
  on public.companies (testovacia_pre) where testovacia_pre is not null;

alter table public.companies drop constraint if exists companies_testovacia_nie_sama_sebe;
alter table public.companies
  add constraint companies_testovacia_nie_sama_sebe
  check (testovacia_pre is null or testovacia_pre <> id);

create or replace function public.faktero_je_testovacia(_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.companies where id = _company_id and testovacia_pre is not null
  );
$$;

revoke execute on function public.faktero_je_testovacia(uuid) from public;
grant execute on function public.faktero_je_testovacia(uuid) to authenticated, service_role;

-- 2. Klient nesmie testovaciu firmu založiť ani z nej spraviť skutočnú --------
--    (rozšírenie existujúceho spúšťača; pôvodné riadky bez zmeny)

create or replace function public.companies_chran_odosielanie()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.odosielanie_overene := false;
    new.odosielanie_pozastavene := false;
    new.odosielanie_pozastavene_at := null;
    new.odosielanie_pozastavene_dovod := null;
    new.created_at := now();
    new.suspended_at := null;
    new.testovacia_pre := null;
  else
    new.odosielanie_overene := old.odosielanie_overene;
    new.odosielanie_pozastavene := old.odosielanie_pozastavene;
    new.odosielanie_pozastavene_at := old.odosielanie_pozastavene_at;
    new.odosielanie_pozastavene_dovod := old.odosielanie_pozastavene_dovod;
    new.created_at := old.created_at;
    new.suspended_at := old.suspended_at;
    new.testovacia_pre := old.testovacia_pre;
    -- Testovacia firma nemá IČO, upomienky ani automatické overenie DPH.
    if old.testovacia_pre is not null then
      new.ico := null;
      new.reminders_enabled := false;
      new.dph_auto_overenie := false;
    end if;
  end if;
  return new;
end;
$function$;

-- Overenie platiteľa DPH v registri FS sa pre testovaciu firmu nespúšťa.
create or replace function public.companies_dph_na_overenie()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.testovacia_pre is not null then
    new.dph_overit_od := null;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.dph_overit_od is null then
      new.dph_overit_od := now();
    end if;
    return new;
  end if;
  if (new.ico is distinct from old.ico
      or new.ic_dph is distinct from old.ic_dph
      or new.dic is distinct from old.dic
      or new.country is distinct from old.country)
     and new.dph_overit_od is not distinct from old.dph_overit_od then
    new.dph_overit_od := now();
  end if;
  return new;
end;
$function$;

-- 3. Predplatné: testovacia firma je zadarmo navždy, nikdy sa neplatí --------

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
  -- Testovacia firma: Premium bez limitov, aktívne, zadarmo, bez platobnej brány.
  IF NEW.testovacia_pre IS NOT NULL THEN
    SELECT id INTO _plan_id FROM public.subscription_plans WHERE slug = 'premium';
    INSERT INTO public.subscriptions (
      company_id, plan, plan_id, status, trial_ends_at,
      current_period_start, current_period_end, next_billing_at,
      monthly_price_cents, payment_provider, is_post_trial_free, free_forever
    ) VALUES (
      NEW.id, 'premium', _plan_id, 'active', NULL,
      now(), NULL, NULL,
      0, NULL, false, true
    )
    ON CONFLICT (company_id) DO NOTHING;
    RETURN NEW;
  END IF;

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

-- Predplatné testovacej firmy nemení klient ani cron (status, cena, brána).
create or replace function public.subscriptions_testovacia_zadarmo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if exists (select 1 from public.companies where id = new.company_id and testovacia_pre is not null) then
    new.status := 'active';
    new.free_forever := true;
    new.monthly_price_cents := 0;
    new.payment_provider := null;
    new.trial_ends_at := null;
    new.current_period_end := null;
    new.next_billing_at := null;
    new.billing_suspended := false;
    new.cancel_at_period_end := false;
  end if;
  return new;
end;
$function$;

revoke execute on function public.subscriptions_testovacia_zadarmo() from public;

drop trigger if exists subscriptions_testovacia_zadarmo on public.subscriptions;
create trigger subscriptions_testovacia_zadarmo
  before insert or update on public.subscriptions
  for each row execute function public.subscriptions_testovacia_zadarmo();

-- 4. Založenie testovacej firmy --------------------------------------------

create or replace function public.faktero_zaloz_testovaciu_firmu(_parent uuid, _id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _p public.companies;
  _novy public.companies;
  _existuje uuid;
begin
  select * into _p from public.companies where id = _parent;
  if not found then
    raise exception 'Firma % neexistuje.', _parent;
  end if;
  if _p.testovacia_pre is not null then
    raise exception 'Testovacia firma nemôže mať vlastnú testovaciu firmu.';
  end if;

  select id into _existuje from public.companies where testovacia_pre = _parent;
  if _existuje is not null then
    return _existuje;
  end if;

  -- Kópia všetkých stĺpcov rodiča (aj budúcich), s výnimkami nižšie.
  _novy := jsonb_populate_record(
    null::public.companies,
    to_jsonb(_p) || jsonb_build_object(
      'id', coalesce(_id, gen_random_uuid()),
      'name', left('Test – ' || _p.name, 200),
      'ico', null,
      'testovacia_pre', _parent,
      'created_at', now(),
      'updated_at', now(),
      'logo_url', null,
      'stamp_url', null,
      'suspended_at', null,
      'suspended_reason', null,
      'odosielanie_overene', false,
      'odosielanie_pozastavene', false,
      'odosielanie_pozastavene_at', null,
      'odosielanie_pozastavene_dovod', null,
      'reminders_enabled', false,
      'online_payments_enabled', false,
      'uctovnik_email', null,
      'odovzdanie_automaticky', false,
      'pohoda_konektor_upozorneny_at', null,
      'pohoda_nacitat_ciselniky', false,
      'pohoda_ciselniky_nacitane_at', null,
      'dph_auto_overenie', false,
      'dph_overit_od', null,
      'dph_overene_at', null,
      'efaktura_upozornenie_email', false,
      'mail_povoleni_odosielatelia', '{}'::text[],
      'locked_until', null,
      'auto_uctovanie_od', now()
    )
  );

  insert into public.companies select (_novy).*;

  -- Členovia ako v skutočnej firme (prístup podpory sa nekopíruje).
  insert into public.company_users (company_id, user_id, role, permissions, schvalovanie_prava)
  select _novy.id, cu.user_id, cu.role, cu.permissions, cu.schvalovanie_prava
    from public.company_users cu
   where cu.company_id = _parent
     and cu.podpora_pristup_id is null
  on conflict (company_id, user_id) do nothing;

  return _novy.id;
end;
$function$;

revoke execute on function public.faktero_zaloz_testovaciu_firmu(uuid, uuid) from public;
grant execute on function public.faktero_zaloz_testovaciu_firmu(uuid, uuid) to service_role;

-- Nová skutočná firma → hneď aj testovacia (členovia sa doplnia zrkadlením,
-- keď vznikne riadok majiteľa). Skript, ktorý ju nechce, nastaví v transakcii
-- `set local faktero.bez_testovacej_firmy = 'on'`.
create or replace function public.companies_zaloz_testovaciu()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.testovacia_pre is null
     and coalesce(current_setting('faktero.bez_testovacej_firmy', true), '') <> 'on' then
    perform public.faktero_zaloz_testovaciu_firmu(new.id);
  end if;
  return null;
end;
$function$;

revoke execute on function public.companies_zaloz_testovaciu() from public;

drop trigger if exists companies_zz_zaloz_testovaciu on public.companies;
create trigger companies_zz_zaloz_testovaciu
  after insert on public.companies
  for each row execute function public.companies_zaloz_testovaciu();

-- 5. Zrkadlenie členov skutočnej firmy do testovacej --------------------------

create or replace function public.company_users_zrkadli_testovaciu()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _test uuid;
begin
  if tg_op = 'DELETE' then
    select id into _test from public.companies where testovacia_pre = old.company_id;
    if _test is not null then
      delete from public.company_users where company_id = _test and user_id = old.user_id;
    end if;
    return old;
  end if;

  -- Dočasný prístup technickej podpory sa do testovacej firmy nezrkadlí.
  if new.podpora_pristup_id is not null then
    return new;
  end if;

  select id into _test from public.companies where testovacia_pre = new.company_id;
  if _test is null then
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.role is distinct from old.role
     or new.permissions is distinct from old.permissions
     or new.schvalovanie_prava is distinct from old.schvalovanie_prava then
    insert into public.company_users (company_id, user_id, role, permissions, schvalovanie_prava)
    values (_test, new.user_id, new.role, new.permissions, new.schvalovanie_prava)
    on conflict (company_id, user_id) do update
      set role = excluded.role,
          permissions = excluded.permissions,
          schvalovanie_prava = excluded.schvalovanie_prava;
  end if;
  return new;
end;
$function$;

revoke execute on function public.company_users_zrkadli_testovaciu() from public;

drop trigger if exists company_users_zrkadli_testovaciu on public.company_users;
create trigger company_users_zrkadli_testovaciu
  after insert or update or delete on public.company_users
  for each row execute function public.company_users_zrkadli_testovaciu();

-- 6. Mazanie: najprv testovacia firma, potom skutočná -------------------------

create or replace function public.faktero_zmaz_firmu(_company_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  _test uuid;
BEGIN
  -- Testovacia firma by sa zmazala kaskádou, ale tá nevie upratať sklad
  -- a jazdy (RESTRICT, nemenné pohyby) — preto sa maže rovnakou cestou.
  FOR _test IN SELECT id FROM public.companies WHERE testovacia_pre = _company_id LOOP
    PERFORM public.faktero_zmaz_firmu(_test);
  END LOOP;

  PERFORM set_config('faktero.mazanie_firmy', 'on', true);

  DELETE FROM public.inventory_count_items
   WHERE inventory_count_id IN (
     SELECT id FROM public.inventory_counts WHERE company_id = _company_id
   );
  DELETE FROM public.inventory_counts WHERE company_id = _company_id;

  DELETE FROM public.stock_transfer_items
   WHERE transfer_id IN (
     SELECT id FROM public.stock_transfers
      WHERE company_id = _company_id OR target_company_id = _company_id
   );
  DELETE FROM public.stock_transfers
   WHERE company_id = _company_id OR target_company_id = _company_id;

  DELETE FROM public.stock_movements WHERE company_id = _company_id;

  DELETE FROM public.fuel_records WHERE company_id = _company_id;
  DELETE FROM public.trips WHERE company_id = _company_id;

  DELETE FROM public.companies WHERE id = _company_id;

  PERFORM set_config('faktero.mazanie_firmy', 'off', true);
END
$function$;

revoke execute on function public.faktero_zmaz_firmu(uuid) from public;
grant execute on function public.faktero_zmaz_firmu(uuid) to service_role;

-- 7. Vymazanie údajov testovacej firmy (tlačidlo v Nastaveniach) -------------
--    Zmaže firmu so všetkým a založí ju znova s TÝM ISTÝM id. Prílohy
--    v Storage maže server pred volaním (storage.protect_delete).

create or replace function public.faktero_obnov_testovaciu_firmu(_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _parent uuid;
begin
  select testovacia_pre into _parent from public.companies where id = _company_id;
  if _parent is null then
    raise exception 'Vymazať údaje sa dá len v testovacej firme.';
  end if;
  perform public.faktero_zmaz_firmu(_company_id);
  return public.faktero_zaloz_testovaciu_firmu(_parent, _company_id);
end;
$function$;

revoke execute on function public.faktero_obnov_testovaciu_firmu(uuid) from public;
grant execute on function public.faktero_obnov_testovaciu_firmu(uuid) to service_role;

-- 8a. Webhook sa zakladá z klienta cez RLS — v testovacej firme ho zastaví DB.
--     (Aj keby vznikol, triggerEvent a fronta ho pre testovaciu firmu neodošlú.)

create or replace function public.faktero_webhook_nie_v_testovacej()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if exists (select 1 from public.companies where id = new.company_id and testovacia_pre is not null) then
    raise exception 'Testovacia firma — webhooky sa v testovacej firme nezakladajú (náhľad).'
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

revoke execute on function public.faktero_webhook_nie_v_testovacej() from public;

drop trigger if exists trg_webhook_nie_v_testovacej on public.webhooks;
create trigger trg_webhook_nie_v_testovacej
  before insert or update of company_id, url, active on public.webhooks
  for each row execute function public.faktero_webhook_nie_v_testovacej();

-- 8b. Doplnenie pre existujúce firmy ---------------------------------------
--    Bez QA/skúšobných firiem (Faktero Demo, QA Česká, Test, Test Zmazanie,
--    test2, Testovacia firma) a bez zablokovaných firiem (suspended_at).

do $$
declare
  _r record;
  _n integer := 0;
begin
  for _r in
    select c.id
      from public.companies c
     where c.testovacia_pre is null
       and c.suspended_at is null
       and c.id not in (
         '6161ba4f-98b1-44d5-8fe7-5ffde2d76369', -- Faktero Demo s.r.o.
         'bf72406d-e40a-43c9-ada2-40c9330fae80', -- QA Česká s.r.o.
         'ec3ff79b-1bbc-4726-80e3-93577751a123', -- Test
         '6f22edcc-a110-43bd-8a92-6f36f4aaec48', -- Test Zmazanie s.r.o.
         'dfe7e0d7-77a9-4ede-b978-d3ee8f896f15', -- test2
         '4a7a8ff8-488f-402d-975f-cf5fbb8290df'  -- Testovacia firma
       )
       and not exists (select 1 from public.companies t where t.testovacia_pre = c.id)
     order by c.created_at
  loop
    perform public.faktero_zaloz_testovaciu_firmu(_r.id);
    _n := _n + 1;
  end loop;
  raise notice 'Založených testovacích firiem: %', _n;
end $$;
