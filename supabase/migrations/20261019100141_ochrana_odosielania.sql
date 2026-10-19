-- Aplikované 2026-10-19 v desiatich častiach (20261019100141_ochrana_odosielania_firmy … 20261019100335_ochrana_odosielania_spatne).
-- Zoznam jednorazových domén (9 899) nahral skript scripts/nahraj-jednorazove-domeny.mjs, nie táto migrácia.

-- Ochrana odosielania e-mailov v mene firmy (po phishingovom útoku 17. 10. 2026)
--
-- 1. companies: odosielanie_overene / odosielanie_pozastavene (+ kedy, prečo).
--    Klient si ich nesmie prepnúť sám — chráni ich spúšťač, rovnako ako
--    created_at (vek firmy rozhoduje o strope) — to doteraz mohol firemný admin
--    prepísať cez PostgREST.
-- 2. odosielanie_mailov — jeden riadok za každý odoslaný e-mail firmy (všetky
--    druhy: faktúra, ponuka, upomienka, samofaktúra, pozvánka…). Z neho sa
--    počítajú stropy. Rezervácia ide cez funkciu so zámkom na firmu, aby
--    sto súbežných volaní neprešlo naraz pod strop.
-- 3. odosielanie_zablokovane — zastavené pokusy a výstrahy pre admina.
-- 4. blokovane_domeny + spúšťač na auth.users — jednorazové e-maily sa
--    nedajú použiť na registráciu ani na zmenu e-mailu.
--
-- Všetky nové tabuľky číta a píše len server (service_role); klient k nim
-- nemá žiadne právo.

-- ─────────────────────────── 1. companies ───────────────────────────
alter table public.companies
  add column if not exists odosielanie_overene boolean not null default false,
  add column if not exists odosielanie_pozastavene boolean not null default false,
  add column if not exists odosielanie_pozastavene_at timestamptz,
  add column if not exists odosielanie_pozastavene_dovod text;

comment on column public.companies.odosielanie_overene is
  'Admin platformy firmu preveril: má stropy staršej firmy aj keď je nová, a značka v jej názve nie je podozrivá.';
comment on column public.companies.odosielanie_pozastavene is
  'Odosielanie e-mailov je zastavené (strážca alebo admin). Zrušiť ho smie len admin platformy.';

create or replace function public.companies_chran_odosielanie()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Server (service_role) a migrácie smú všetko; klient nič z tohto.
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
  else
    new.odosielanie_overene := old.odosielanie_overene;
    new.odosielanie_pozastavene := old.odosielanie_pozastavene;
    new.odosielanie_pozastavene_at := old.odosielanie_pozastavene_at;
    new.odosielanie_pozastavene_dovod := old.odosielanie_pozastavene_dovod;
    new.created_at := old.created_at;
    -- Pozastavenie firmy adminom platformy si firemný admin nesmie zrušiť.
    new.suspended_at := old.suspended_at;
  end if;
  return new;
end;
$$;

drop trigger if exists companies_chran_odosielanie on public.companies;
create trigger companies_chran_odosielanie
  before insert or update on public.companies
  for each row execute function public.companies_chran_odosielanie();

-- ─────────────────────────── 2. odosielanie_mailov ───────────────────────────
create table if not exists public.odosielanie_mailov (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid,
  druh text not null,
  doklad_id uuid,
  adresati text[] not null,
  pocet integer not null,
  predmet text,
  stav text not null default 'rezervovane' check (stav in ('rezervovane', 'odoslane', 'zlyhalo')),
  created_at timestamptz not null default now()
);
create index if not exists odosielanie_mailov_firma_cas
  on public.odosielanie_mailov (company_id, created_at desc);
create index if not exists odosielanie_mailov_doklad
  on public.odosielanie_mailov (doklad_id, created_at desc) where doklad_id is not null;

alter table public.odosielanie_mailov enable row level security;
revoke all on public.odosielanie_mailov from public, anon, authenticated;
grant select, insert, update, delete on public.odosielanie_mailov to service_role;

-- Spätne posledné 2 dni odoslaní, aby stropy platili hneď od nasadenia.
insert into public.odosielanie_mailov (company_id, druh, doklad_id, adresati, pocet, predmet, stav, created_at)
select company_id, 'faktura', invoice_id, array[lower(recipient_email)], 1, subject, 'odoslane', created_at
  from public.invoice_email_logs
 where status in ('sent', 'pending') and created_at > now() - interval '2 days';
insert into public.odosielanie_mailov (company_id, druh, doklad_id, adresati, pocet, predmet, stav, created_at)
select company_id, 'ponuka', quote_id, array[lower(recipient_email)], 1, subject, 'odoslane', created_at
  from public.quote_email_logs
 where status = 'sent' and created_at > now() - interval '2 days';
insert into public.odosielanie_mailov (company_id, druh, doklad_id, adresati, pocet, predmet, stav, created_at)
select company_id, 'upomienka', invoice_id, array[lower(email_to)], 1, subject, 'odoslane', created_at
  from public.invoice_reminders
 where status = 'sent' and created_at > now() - interval '2 days';

-- ─────────────────────────── 3. odosielanie_zablokovane ───────────────────────────
create table if not exists public.odosielanie_zablokovane (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid,
  druh text,
  dovod text not null,
  detail text,
  predmet text,
  adresati_pocet integer not null default 0,
  ukazka text,
  -- true = nezastavené, len výstraha adminovi (napr. značka v maili staršej firmy)
  len_vystraha boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists odosielanie_zablokovane_firma_cas
  on public.odosielanie_zablokovane (company_id, created_at desc);
create index if not exists odosielanie_zablokovane_cas
  on public.odosielanie_zablokovane (created_at desc);

alter table public.odosielanie_zablokovane enable row level security;
revoke all on public.odosielanie_zablokovane from public, anon, authenticated;
grant select, insert, update, delete on public.odosielanie_zablokovane to service_role;

-- ─────────────────────────── funkcie strážcu ───────────────────────────

/*
  Rezervuje odoslanie pod zámkom firmy. Vráti:
    {ok: true, id}                                — môže sa posielať
    {ok: false, dovod: 'pozastavene'}             — firma má odosielanie zastavené
    {ok: false, dovod: 'strop_den', pocet}        — rôznych adresátov za 24 h
    {ok: false, dovod: 'strop_doklad', pocet}     — rôznych adresátov jedného dokladu za 24 h
    {ok: false, dovod: 'hodina', pocet, prave_pozastavene} — nad hodinový prah → firma sa pozastaví
*/
create or replace function public.odosielanie_rezervuj(
  p_company uuid,
  p_user uuid,
  p_druh text,
  p_doklad uuid,
  p_adresati text[],
  p_predmet text,
  p_max_den integer,
  p_max_doklad integer,
  p_max_hodina integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adresati text[];
  v_pozastavene boolean;
  v_den integer;
  v_doklad integer;
  v_hodina integer;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('odosielanie:' || p_company::text, 0));

  select coalesce(array_agg(distinct lower(trim(a))), '{}')
    into v_adresati
    from unnest(p_adresati) a
   where coalesce(trim(a), '') <> '';

  select odosielanie_pozastavene into v_pozastavene from companies where id = p_company;
  if coalesce(v_pozastavene, false) then
    return jsonb_build_object('ok', false, 'dovod', 'pozastavene');
  end if;

  select count(distinct a) into v_den
    from (
      select unnest(adresati) a from odosielanie_mailov
       where company_id = p_company and stav <> 'zlyhalo' and created_at > now() - interval '24 hours'
      union all
      select unnest(v_adresati)
    ) x;
  if v_den > p_max_den then
    return jsonb_build_object('ok', false, 'dovod', 'strop_den', 'pocet', v_den);
  end if;

  if p_doklad is not null then
    select count(distinct a) into v_doklad
      from (
        select unnest(adresati) a from odosielanie_mailov
         where company_id = p_company and doklad_id = p_doklad and stav <> 'zlyhalo'
           and created_at > now() - interval '24 hours'
        union all
        select unnest(v_adresati)
      ) x;
    if v_doklad > p_max_doklad then
      return jsonb_build_object('ok', false, 'dovod', 'strop_doklad', 'pocet', v_doklad);
    end if;
  end if;

  select coalesce(sum(pocet), 0) + coalesce(array_length(v_adresati, 1), 0) into v_hodina
    from odosielanie_mailov
   where company_id = p_company and stav <> 'zlyhalo' and created_at > now() - interval '1 hour';
  if v_hodina > p_max_hodina then
    update companies
       set odosielanie_pozastavene = true,
           odosielanie_pozastavene_at = now(),
           odosielanie_pozastavene_dovod = format('Strážca: %s adresátov za hodinu (prah %s)', v_hodina, p_max_hodina)
     where id = p_company;
    return jsonb_build_object('ok', false, 'dovod', 'hodina', 'pocet', v_hodina, 'prave_pozastavene', true);
  end if;

  insert into odosielanie_mailov (company_id, user_id, druh, doklad_id, adresati, pocet, predmet)
  values (p_company, p_user, p_druh, p_doklad, v_adresati, coalesce(array_length(v_adresati, 1), 0), left(p_predmet, 500))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

/*
  Zapíše zastavený pokus (alebo výstrahu). Keď má firma za hodinu aspoň
  p_prah zastavených pokusov, odosielanie sa jej pozastaví — vráti
  prave_pozastavene = true len raz, aby admin dostal jeden e-mail.
*/
create or replace function public.odosielanie_zapis_blok(
  p_company uuid,
  p_user uuid,
  p_druh text,
  p_dovod text,
  p_detail text,
  p_predmet text,
  p_pocet integer,
  p_ukazka text,
  p_len_vystraha boolean,
  p_prah integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pocet integer;
  v_pozastavene boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('odosielanie:' || p_company::text, 0));
  insert into odosielanie_zablokovane (company_id, user_id, druh, dovod, detail, predmet, adresati_pocet, ukazka, len_vystraha)
  values (p_company, p_user, p_druh, p_dovod, left(p_detail, 1000), left(p_predmet, 500), coalesce(p_pocet, 0), left(p_ukazka, 1000), coalesce(p_len_vystraha, false));
  if coalesce(p_len_vystraha, false) then
    return jsonb_build_object('prave_pozastavene', false);
  end if;

  select count(*) into v_pocet from odosielanie_zablokovane
   where company_id = p_company and not len_vystraha and created_at > now() - interval '1 hour';
  select odosielanie_pozastavene into v_pozastavene from companies where id = p_company;
  if v_pocet >= p_prah and not coalesce(v_pozastavene, false) then
    update companies
       set odosielanie_pozastavene = true,
           odosielanie_pozastavene_at = now(),
           odosielanie_pozastavene_dovod = format('Strážca: %s zastavených pokusov za hodinu', v_pocet)
     where id = p_company;
    return jsonb_build_object('prave_pozastavene', true, 'pocet', v_pocet);
  end if;
  return jsonb_build_object('prave_pozastavene', false, 'pocet', v_pocet);
end;
$$;

revoke all on function public.odosielanie_rezervuj(uuid, uuid, text, uuid, text[], text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.odosielanie_zapis_blok(uuid, uuid, text, text, text, text, integer, text, boolean, integer) from public, anon, authenticated;
grant execute on function public.odosielanie_rezervuj(uuid, uuid, text, uuid, text[], text, integer, integer, integer) to service_role;
grant execute on function public.odosielanie_zapis_blok(uuid, uuid, text, text, text, text, integer, text, boolean, integer) to service_role;

-- ─────────────────────────── 4. jednorazové e-maily ───────────────────────────
create table if not exists public.blokovane_domeny (
  domena text primary key check (domena = lower(domena) and domena ~ '^[a-z0-9.-]+$'),
  zdroj text not null default 'disposable-email-domains',
  created_at timestamptz not null default now()
);
alter table public.blokovane_domeny enable row level security;
revoke all on public.blokovane_domeny from public, anon, authenticated;
grant select, insert, update, delete on public.blokovane_domeny to service_role;

/* Doména e-mailu alebo ktorákoľvek jej nadradená je v zozname (beta.pendulum.cyou → pendulum.cyou). */
create or replace function public.je_blokovana_domena(p_email text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dom text := rtrim(lower(split_part(trim(coalesce(p_email, '')), '@', 2)), '.');
  v_casti text[];
  v_kandidati text[] := '{}';
  i integer;
begin
  if v_dom = '' then
    return false;
  end if;
  v_casti := string_to_array(v_dom, '.');
  for i in 1 .. coalesce(array_length(v_casti, 1), 0) loop
    v_kandidati := v_kandidati || array_to_string(v_casti[i:array_length(v_casti, 1)], '.');
  end loop;
  return exists (select 1 from blokovane_domeny where domena = any (v_kandidati));
end;
$$;
-- Volá ju aj kontrola pred registráciou (server s verejným kľúčom, bez
-- prihlásenia) — vráti len áno/nie nad verejným zoznamom, tabuľku nevidí.
revoke all on function public.je_blokovana_domena(text) from public;
grant execute on function public.je_blokovana_domena(text) to anon, authenticated, service_role;

/*
  Spúšťač na auth.users: registrácia (signUp z webu aj z appky ide priamo do
  Supabase, server Faktera ju nevidí) a zmena e-mailu (email_change sa zapíše
  pri žiadosti, email po potvrdení). Auth Hook „before user created" by bol
  čistejší, ale nastavuje sa len v dashboarde / cez Management API, ktoré
  nemáme — spúšťač vznikne migráciou a nedá sa obísť ani priamym volaním API.
*/
create or replace function public.auth_users_blokuj_jednorazove()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.email is not null and public.je_blokovana_domena(new.email) then
      raise exception 'Jednorazova e-mailova adresa (%) sa neda pouzit.', split_part(new.email, '@', 2)
        using errcode = 'P0001';
    end if;
  else
    if new.email is distinct from old.email and new.email is not null
       and public.je_blokovana_domena(new.email) then
      raise exception 'Jednorazova e-mailova adresa (%) sa neda pouzit.', split_part(new.email, '@', 2)
        using errcode = 'P0001';
    end if;
    if new.email_change is distinct from old.email_change and coalesce(new.email_change, '') <> ''
       and public.je_blokovana_domena(new.email_change) then
      raise exception 'Jednorazova e-mailova adresa (%) sa neda pouzit.', split_part(new.email_change, '@', 2)
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.auth_users_blokuj_jednorazove() from public, anon, authenticated;

drop trigger if exists auth_users_jednorazove on auth.users;
create trigger auth_users_jednorazove
  before insert or update of email, email_change on auth.users
  for each row execute function public.auth_users_blokuj_jednorazove();

-- Zoznam: supabase/data/jednorazove-domeny.txt (github.com/disposable-email-domains,
-- stiahnuté 2026-10-17) + supabase/data/jednorazove-domeny-vlastne.txt.
-- Obnova: scripts/nahraj-jednorazove-domeny.mjs.

insert into public.blokovane_domeny (domena, zdroj) select d, 'faktero' from (values ('kuromee.com'),('mikrotikx.com'),('beta.pendulum.cyou'),('pendulum.cyou'),('app.gozora.site'),('gozora.site')) v(d) on conflict (domena) do nothing;
