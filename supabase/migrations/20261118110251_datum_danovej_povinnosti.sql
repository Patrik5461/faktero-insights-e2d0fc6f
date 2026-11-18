-- Dátum daňovej povinnosti (2026-11-18, požiadavka účtovníčky).
--
-- Explicitný, viditeľný a upraviteľný deň, ktorým doklad vstupuje do DPH:
--  * prijatá faktúra — obdobie odpočtu, dátum v KV, Pohoda dateTax + dateKVDPH,
--  * vystavená faktúra — obdobie dane, KV, Pohoda dateTax.
-- NULL = doterajšie pravidlo (prijatá: neskorší z DUZP a prijatia, samozdanenie
-- DUZP, dobropis prijatie; vystavená: DUZP, opravná faktúra dátum vyhotovenia),
-- takže existujúce doklady sa nemenia.

alter table public.purchase_invoices add column if not exists datum_dph date null;
alter table public.invoices add column if not exists datum_dph date null;

comment on column public.purchase_invoices.datum_dph is
  'Dátum daňovej povinnosti (odpočtu DPH) zadaný na doklade. Ak je vyplnený, určuje obdobie odpočtu, dátum v kontrolnom výkaze aj Pohoda dateTax/dateKVDPH. NULL = neskorší z DUZP a dátumu prijatia (samozdanenie DUZP, dobropis prijatie).';
comment on column public.invoices.datum_dph is
  'Dátum vzniku daňovej povinnosti vystaveného dokladu. Ak je vyplnený, určuje obdobie DPH, kontrolný výkaz aj Pohoda dateTax. NULL = DUZP (opravná faktúra dátum vyhotovenia).';

-- Zámok obdobia: deň odpočtu prijatej faktúry berie najprv datum_dph.
create or replace function public.zamok_obdobia_den_odpoctu_prijatej(_r jsonb)
 returns date
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare
  _vystavenie date := nullif(_r ->> 'issue_date', '')::date;
  _dodanie date := nullif(_r ->> 'delivery_date', '')::date;
  _prijatie date := nullif(_r ->> 'received_date', '')::date;
  _datum_dph date := nullif(_r ->> 'datum_dph', '')::date;
  _plnenie date;
  _dan numeric := coalesce(nullif(_r ->> 'vat_amount', '')::numeric, 0);
begin
  if _r is null then return null; end if;
  if _datum_dph is not null then return _datum_dph; end if;
  _plnenie := coalesce(_dodanie, _vystavenie);
  if coalesce(_r ->> 'opravuje_cislo', '') <> ''
     or coalesce(nullif(_r ->> 'amount_total', '')::numeric, 0) < 0 then
    return coalesce(_prijatie, _vystavenie, _dodanie);
  end if;
  if _r ->> 'dph_rezim' in ('samozdanenie', 'nadobudnutie')
     or (_dan = 0 and (
           coalesce((_r ->> 'reverse_charge')::boolean, false)
           or upper(btrim(coalesce(_r ->> 'pohoda_clenenie_dph', ''))) ~ '^(PD|DD)(SLUZ|TOVAR|PDP)'))
  then
    return _plnenie;
  end if;
  return greatest(_plnenie, _prijatie);
end
$function$;

-- Zámok obdobia: deň dane vystavenej faktúry berie najprv datum_dph.
create or replace function public.zamok_obdobia_den_dane_vystavenej(_r jsonb)
 returns date
 language sql
 stable
 set search_path to 'public'
as $function$
  select case
    when nullif(_r ->> 'datum_dph', '') is not null
    then (_r ->> 'datum_dph')::date
    when _r ->> 'type' in ('credit_note', 'debit_note')
      or nullif(_r ->> 'opravuje_fakturu_id', '') is not null
    then coalesce(nullif(_r ->> 'issue_date', '')::date, nullif(_r ->> 'delivery_date', '')::date)
    else coalesce(nullif(_r ->> 'delivery_date', '')::date, nullif(_r ->> 'issue_date', '')::date)
  end
$function$;

-- datum_dph je chránený stĺpec ako ostatné dátumy dokladu.
drop trigger if exists purchase_invoices_locked_period on public.purchase_invoices;
create trigger purchase_invoices_locked_period
  before insert or delete or update on public.purchase_invoices
  for each row execute function public.guard_locked_period_dokladu(
    'type', 'invoice_number', 'issue_date', 'delivery_date', 'received_date', 'datum_dph',
    'povodna_splatnost', 'supplier_name', 'supplier_ico', 'supplier_dic', 'supplier_ic_dph',
    'supplier_country', 'amount_without_vat', 'vat_amount', 'amount_total',
    'amount_without_vat_eur', 'vat_amount_eur', 'discount_total', 'items', 'vat_breakdown',
    'currency', 'exchange_rate', 'dph_rezim', 'reverse_charge', 'reverse_charge_type',
    'eu_plnenie', 'osobitna_uprava', 'odpocet', 'opravuje_cislo', 'opravuje_id',
    'advance_invoice_id', 'advance_amount', 'samofakturacia', 'pohoda_clenenie_dph',
    'kv_clenenie', 'deleted_at');

drop trigger if exists invoices_locked_period on public.invoices;
create trigger invoices_locked_period
  before insert or delete or update on public.invoices
  for each row execute function public.guard_locked_period_dokladu(
    'issue_date', 'delivery_date', 'datum_dph', 'povodna_splatnost', 'invoice_number', 'type',
    'currency', 'exchange_rate', 'exchange_rate_date', 'customer_id', 'customer_name',
    'customer_ico', 'customer_dic', 'customer_ic_dph', 'customer_country', 'subtotal',
    'vat_total', 'total', 'subtotal_eur', 'vat_total_eur', 'total_eur', 'discount_total',
    'discount_type', 'discount_value', 'rounding_mode', 'reverse_charge', 'reverse_charge_type',
    'pdp_druh', 'eu_plnenie', 'oss', 'oss_country', 'osobitna_uprava', 'oprava_25a',
    'opravuje_fakturu_id', 'advance_invoice_id', 'advance_amount', 'pohoda_clenenie_dph',
    'kv_clenenie', 'cancelled_at', 'deleted_at');

-- Názov poľa v hláške zámku obdobia (doplnený datum_dph, inak bez zmeny).
create or replace function public.nazov_pola_dokladu(_pole text)
 returns text
 language sql
 stable
 set search_path to 'public'
as $function$
  select case _pole
    when 'issue_date' then 'dátum vystavenia'
    when 'delivery_date' then 'dátum dodania'
    when 'received_date' then 'dátum prijatia'
    when 'datum_dph' then 'dátum daňovej povinnosti'
    when 'due_date' then 'splatnosť'
    when 'povodna_splatnost' then 'pôvodná splatnosť'
    when 'invoice_number' then 'číslo dokladu'
    when 'document_number' then 'číslo dokladu'
    when 'number_series_id' then 'číselný rad'
    when 'sequence_number' then 'poradové číslo'
    when 'type' then 'druh dokladu'
    when 'status' then 'stav dokladu'
    when 'currency' then 'mena'
    when 'exchange_rate' then 'kurz'
    when 'exchange_rate_date' then 'dátum kurzu'
    when 'subtotal' then 'základ dane'
    when 'amount_without_vat' then 'základ dane'
    when 'net_amount' then 'základ dane'
    when 'vat_total' then 'DPH'
    when 'vat_amount' then 'DPH'
    when 'total' then 'suma spolu'
    when 'amount_total' then 'suma spolu'
    when 'total_amount' then 'suma spolu'
    when 'subtotal_eur' then 'základ dane v eurách'
    when 'amount_without_vat_eur' then 'základ dane v eurách'
    when 'vat_total_eur' then 'DPH v eurách'
    when 'vat_amount_eur' then 'DPH v eurách'
    when 'total_eur' then 'suma v eurách'
    when 'discount_total' then 'zľava'
    when 'discount_type' then 'zľava'
    when 'discount_value' then 'zľava'
    when 'discount_percent' then 'zľava položky'
    when 'rounding_mode' then 'zaokrúhlenie'
    when 'customer_id' then 'odberateľ'
    when 'customer_name' then 'názov odberateľa'
    when 'customer_ico' then 'IČO odberateľa'
    when 'customer_dic' then 'DIČ odberateľa'
    when 'customer_ic_dph' then 'IČ DPH odberateľa'
    when 'customer_country' then 'krajina odberateľa'
    when 'customer_street' then 'adresa odberateľa'
    when 'customer_city' then 'adresa odberateľa'
    when 'customer_zip' then 'adresa odberateľa'
    when 'customer_email' then 'e-mail odberateľa'
    when 'supplier_name' then 'názov dodávateľa'
    when 'supplier_ico' then 'IČO dodávateľa'
    when 'supplier_dic' then 'DIČ dodávateľa'
    when 'supplier_ic_dph' then 'IČ DPH dodávateľa'
    when 'supplier_country' then 'krajina dodávateľa'
    when 'supplier_street' then 'adresa dodávateľa'
    when 'supplier_city' then 'adresa dodávateľa'
    when 'supplier_zip' then 'adresa dodávateľa'
    when 'supplier_iban' then 'IBAN dodávateľa'
    when 'variable_symbol' then 'variabilný symbol'
    when 'constant_symbol' then 'konštantný symbol'
    when 'specific_symbol' then 'špecifický symbol'
    when 'order_number' then 'číslo objednávky'
    when 'delivery_note_number' then 'číslo dodacieho listu'
    when 'reverse_charge' then 'prenesenie daňovej povinnosti'
    when 'reverse_charge_type' then 'druh prenesenia daňovej povinnosti'
    when 'pdp_druh' then 'druh prenesenia daňovej povinnosti'
    when 'prenesenie' then 'prenesenie daňovej povinnosti'
    when 'eu_plnenie' then 'plnenie v rámci EÚ'
    when 'oss' then 'režim OSS'
    when 'oss_country' then 'krajina OSS'
    when 'osobitna_uprava' then 'osobitná úprava DPH'
    when 'oprava_25a' then 'oprava podľa § 25a'
    when 'opravuje_fakturu_id' then 'opravovaná faktúra'
    when 'opravuje_cislo' then 'opravovaná faktúra'
    when 'opravuje_id' then 'opravovaná faktúra'
    when 'advance_invoice_id' then 'zálohová faktúra'
    when 'advance_amount' then 'odpočet zálohy'
    when 'dph_rezim' then 'režim DPH'
    when 'odpocet' then 'odpočet DPH'
    when 'samofakturacia' then 'samofakturácia'
    when 'items' then 'položky'
    when 'vat_breakdown' then 'rozpis DPH'
    when 'vat_rate' then 'sadzba DPH'
    when 'pohoda_clenenie_dph' then 'členenie DPH'
    when 'kv_clenenie' then 'členenie kontrolného výkazu'
    when 'pohoda_predkontacia' then 'predkontácia'
    when 'rozuctovanie' then 'rozúčtovanie'
    when 'stredisko' then 'stredisko'
    when 'cinnost' then 'činnosť'
    when 'pohoda_rad' then 'číselný rad v Pohode'
    when 'pohoda_pokladna' then 'pokladňa v Pohode'
    when 'vyuctovanie_id' then 'vyúčtovanie'
    when 'job_id' then 'zákazka'
    when 'category' then 'kategória'
    when 'payment_method' then 'spôsob úhrady'
    when 'intro_note' then 'úvodný text'
    when 'notes' then 'poznámka'
    when 'note' then 'poznámka'
    when 'cancelled_at' then 'storno'
    when 'deleted_at' then 'zmazanie'
    when 'invoice_id' then 'faktúra položky'
    when 'position' then 'poradie položky'
    when 'name' then 'názov položky'
    when 'description' then 'popis položky'
    when 'quantity' then 'množstvo'
    when 'unit' then 'jednotka'
    when 'unit_price' then 'jednotková cena'
    when 'colny_kod' then 'colný kód'
    when 'krajina_povodu' then 'krajina pôvodu'
    when 'hmotnost_kg' then 'hmotnosť'
    when 'entry_date' then 'dátum'
    when 'entry_number' then 'číslo dokladu'
    when 'amount' then 'suma'
    when 'trip_date' then 'dátum jazdy'
    when 'vehicle_id' then 'vozidlo'
    when 'driver_name' then 'vodič'
    when 'start_location' then 'miesto odchodu'
    when 'end_location' then 'miesto príchodu'
    when 'purpose' then 'účel jazdy'
    when 'start_odometer' then 'stav tachometra'
    when 'end_odometer' then 'stav tachometra'
    when 'distance_km' then 'vzdialenosť'
    when 'fuel_price' then 'cena paliva'
    when 'fuel_consumption' then 'spotreba'
    else 'údaje dokladu'
  end
$function$;

notify pgrst, 'reload schema';
