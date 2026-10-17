-- Firma so sídlom v Nemecku (krajina DE) — fáza 1.
--
-- Steuernummer sa ukladá do `dic`, USt-IdNr. do `ic_dph` (nové stĺpce na to
-- netreba). Pribúdajú údaje z obchodného registra, ktoré patria na nemecké
-- obchodné listy (§ 35a GmbHG, § 37a HGB), a dve schémy DPH:
-- Regelbesteuerung (platiteľ) a Kleinunternehmer podľa § 19 UStG.
alter table public.companies
  add column if not exists registergericht text,
  add column if not exists handelsregister_nr text,
  add column if not exists geschaeftsfuehrer text;

comment on column public.companies.registergericht is
  'Registrový súd nemeckej firmy, napr. „Amtsgericht München“.';
comment on column public.companies.handelsregister_nr is
  'Číslo v Handelsregister, napr. „HRB 123456“ — nemecká firma IČO nemá.';
comment on column public.companies.geschaeftsfuehrer is
  'Konateľ (Geschäftsführer) — do päty nemeckej faktúry.';

alter table public.companies drop constraint if exists companies_vat_scheme_chk;
alter table public.companies add constraint companies_vat_scheme_chk
  check (vat_scheme is null or vat_scheme in (
    'sk_neplatitel', 'sk_4', 'sk_4b', 'sk_5', 'sk_7', 'sk_7a',
    'cz_neplatce', 'cz_platce', 'cz_identifikovana',
    'de_regel', 'de_kleinunternehmer'
  ));

-- Zakladanie firmy: nemecká schéma sa musí dať prijať aj dopočítať. Signatúra
-- ostáva rovnaká, mení sa len telo.
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
  _je_de boolean := upper(btrim(coalesce(_country, ''))) in ('DE', 'DEU', 'DEUTSCHLAND', 'NEMECKO', 'GERMANY');
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
    case when _schema is not null then _schema in ('sk_4', 'sk_4b', 'sk_5', 'cz_platce', 'de_regel') else null end,
    _vat_payer,
    false
  );
  if _schema is null then
    _schema := case
      when _je_cz then (case when _platitel then 'cz_platce' else 'cz_neplatce' end)
      when _je_de then (case when _platitel then 'de_regel' else 'de_kleinunternehmer' end)
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

-- create or replace ponechá práva, ale pre istotu (PUBLIC drží EXECUTE, viď
-- poznámku o `revoke from anon`):
revoke all on function public.create_company_with_owner(text, text, text, text, text, text, text, text, text, text, text, text, boolean, text) from public;
grant execute on function public.create_company_with_owner(text, text, text, text, text, text, text, text, text, text, text, text, boolean, text) to authenticated;
