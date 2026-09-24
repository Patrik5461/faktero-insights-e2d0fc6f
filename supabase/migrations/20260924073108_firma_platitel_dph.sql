-- Či je firma platiteľ DPH a podľa akého paragrafu je registrovaná.
--
-- Doteraz sa to odvodzovalo z vyplneného IČ DPH, lenže to nestačí: osoba
-- registrovaná podľa § 7 alebo § 7a IČ DPH má, a platiteľom pritom nie je —
-- faktúry vystavuje bez dane. Z registrov (FinStat, ARES) sa navyše ťahá len
-- IČ DPH, typ registrácie v nich nie je, takže ho musí povedať človek.
alter table public.companies
  add column if not exists vat_payer boolean not null default false,
  add column if not exists vat_scheme text;

-- Existujúce firmy: platiteľ je ten, kto má IČ DPH alebo už vystavil doklad
-- s daňou. Druhá podmienka je dôležitá — inak by firme, ktorá IČ DPH len
-- nevyplnila, začali chodiť faktúry bez DPH.
update public.companies c
set vat_payer = true
where coalesce(btrim(c.ic_dph), '') <> ''
   or exists (
     select 1 from public.invoices i
     where i.company_id = c.id and coalesce(i.vat_total, 0) > 0
   );

update public.companies c
set vat_scheme = case
  when upper(coalesce(c.country, 'SK')) like 'CZ%' then (case when c.vat_payer then 'cz_platce' else 'cz_neplatce' end)
  else (case when c.vat_payer then 'sk_4' else 'sk_neplatitel' end)
end
where c.vat_scheme is null;

alter table public.companies drop constraint if exists companies_vat_scheme_chk;
alter table public.companies add constraint companies_vat_scheme_chk
  check (vat_scheme is null or vat_scheme in (
    'sk_neplatitel', 'sk_4', 'sk_4b', 'sk_5', 'sk_7', 'sk_7a',
    'cz_neplatce', 'cz_platce', 'cz_identifikovana'
  ));

-- Zakladanie firmy musí vedieť oboje prijať. Stará signatúra sa ruší, inak by
-- vznikli dve funkcie s rovnakým menom a PostgREST by nevedel, ktorú volať.
drop function if exists public.create_company_with_owner(text, text, text, text, text, text, text, text, text, text, text, text);

create or replace function public.create_company_with_owner(
  _name text,
  _ico text default null,
  _dic text default null,
  _ic_dph text default null,
  _street text default null,
  _city text default null,
  _zip text default null,
  _country text default 'SK',
  _email text default null,
  _phone text default null,
  _iban text default null,
  _default_currency text default 'EUR',
  _vat_payer boolean default null,
  _vat_scheme text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _uid uuid := auth.uid();
  _company_id uuid;
  _schema text := nullif(btrim(coalesce(_vat_scheme, '')), '');
  _je_cz boolean := upper(coalesce(_country, 'SK')) like 'CZ%';
  _platitel boolean;
begin
  if _uid is null then
    raise exception 'Not authenticated';
  end if;
  if _name is null or length(btrim(_name)) = 0 then
    raise exception 'Company name is required';
  end if;

  -- Keď príde len jedno z dvojice, druhé sa dopočíta: schéma je pravda, zaškrtnutie
  -- je len jej zjednodušenie.
  _platitel := coalesce(
    case when _schema is not null then _schema in ('sk_4', 'sk_4b', 'sk_5', 'cz_platce') else null end,
    _vat_payer,
    false
  );
  if _schema is null then
    _schema := case
      when _je_cz then (case when _platitel then 'cz_platce' else 'cz_neplatce' end)
      else (case when _platitel then 'sk_4' else 'sk_neplatitel' end)
    end;
  end if;

  insert into public.companies (
    name, ico, dic, ic_dph, street, city, zip, country, email, phone, iban, default_currency,
    vat_payer, vat_scheme, created_by
  ) values (
    btrim(_name), nullif(_ico, ''), nullif(_dic, ''), nullif(_ic_dph, ''),
    nullif(_street, ''), nullif(_city, ''), nullif(_zip, ''), coalesce(nullif(_country, ''), 'SK'),
    nullif(_email, ''), nullif(_phone, ''), nullif(_iban, ''),
    coalesce(nullif(_default_currency, ''), 'EUR'),
    _platitel, _schema,
    _uid
  )
  returning id into _company_id;

  insert into public.company_users (company_id, user_id, role)
  values (_company_id, _uid, 'owner');

  return _company_id;
end;
$function$;

revoke all on function public.create_company_with_owner(text, text, text, text, text, text, text, text, text, text, text, text, boolean, text) from public;
grant execute on function public.create_company_with_owner(text, text, text, text, text, text, text, text, text, text, text, text, boolean, text) to authenticated;
