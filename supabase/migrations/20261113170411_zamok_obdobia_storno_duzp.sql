-- Uzamknuté obdobie (companies.locked_until) — oprava dvoch dier nájdených
-- naostro 13. 11. 2026:
--
-- 1. Storno vydanej faktúry v uzamknutom období prešlo (status a cancelled_at
--    zámok nestrážil). Rovnako prechod koncept ↔ vystavená a obnovenie
--    stornovanej — všetky menia podaný výkaz DPH.
-- 2. Prijatá faktúra v uzamknutom období sa dala presunúť (dátum dodania,
--    prijatia, režim DPH, odpočet, členenie, položky…) a zámok sa riadil
--    dátumom vystavenia, kým výkaz DPH dátumom odpočtu (neskorší z DUZP a
--    prijatia, samozdanenie DUZP, dobropis prijatie — `denOdpoctu` v
--    src/lib/faktero/datum-prijatia.ts).
--
-- Pravidlo po oprave (zrkadlo v src/lib/faktero/zamok-obdobia.ts, test drží
-- zhodu zoznamov polí aj názvov):
--
-- * Doklad je v uzavretom období, keď je v účtovníctve (vydaná/prijatá: nie
--   koncept, nie stornovaná, nie zmazaná; bloček: nie nespracovaný) a deň,
--   ktorým ide do výkazu, padá do zámku: vydaná — deň vystavenia alebo deň
--   dodania (opravná faktúra deň vystavenia); prijatá — LEN deň odpočtu
--   (vystavená v uzavretom období, prijatá neskôr sa dá zapísať aj upraviť);
--   bloček — deň vystavenia.
-- * Posudzuje sa starý aj nový stav — doklad sa nedá presunúť ani DO, ani Z
--   uzavretého obdobia.
-- * Vstup do účtovníctva (nový doklad, vystavenie konceptu, obnovenie storna,
--   spracovanie bločku) s dňom v zámku je zakázaný; odchod (storno, zmazanie,
--   návrat na koncept / medzi nespracované) tiež.
-- * Doklad v účtovníctve: zakázaná je zmena vymenovaných polí (argumenty
--   spúšťača) — sumy, dátumy, strany, DPH režim, členenie DPH a KV, položky.
-- * Voľné ostáva: úhrada (stav uhradená, paid_at, payment_date), predkontácia,
--   stredisko, činnosť, rozúčtovanie, poznámky, zákazka, štítky, odovzdanie do
--   Pohody (exported_at) a ostatné pracovné stĺpce. Koncept a stornovaná
--   faktúra nie sú vo výkaze, zámok ich neviaže.
--
-- Hlášky sú bez technických názvov stĺpcov (tie idú do DETAIL) — platí aj pre
-- zámok odovzdaného dokladu (`zamok_odovzdaneho_dokladu`), ktorý ukazoval
-- napr. „(due_date)“.

-- ------------------------------------------------------------------ názvy

create or replace function public.nazov_pola_dokladu(_pole text)
returns text
language sql
stable
set search_path to 'public'
as $$
  select case _pole
    when 'issue_date' then 'dátum vystavenia'
    when 'delivery_date' then 'dátum dodania'
    when 'received_date' then 'dátum prijatia'
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
$$;

-- --------------------------------------------------------- deň do výkazu

-- Vydaná faktúra: deň vzniku daňovej povinnosti (`denDaneVystavenej`) —
-- opravná faktúra (dobropis, ťarchopis) deň vystavenia, inak deň dodania.
create or replace function public.zamok_obdobia_den_dane_vystavenej(_r jsonb)
returns date
language sql
stable
set search_path to 'public'
as $$
  select case
    when _r ->> 'type' in ('credit_note', 'debit_note')
      or nullif(_r ->> 'opravuje_fakturu_id', '') is not null
    then coalesce(nullif(_r ->> 'issue_date', '')::date, nullif(_r ->> 'delivery_date', '')::date)
    else coalesce(nullif(_r ->> 'delivery_date', '')::date, nullif(_r ->> 'issue_date', '')::date)
  end
$$;

-- Prijatá faktúra: deň odpočtu (`denOdpoctu` v datum-prijatia.ts).
create or replace function public.zamok_obdobia_den_odpoctu_prijatej(_r jsonb)
returns date
language plpgsql
stable
set search_path to 'public'
as $$
declare
  _vystavenie date := nullif(_r ->> 'issue_date', '')::date;
  _dodanie date := nullif(_r ->> 'delivery_date', '')::date;
  _prijatie date := nullif(_r ->> 'received_date', '')::date;
  _plnenie date;
  _dan numeric := coalesce(nullif(_r ->> 'vat_amount', '')::numeric, 0);
begin
  if _r is null then return null; end if;
  _plnenie := coalesce(_dodanie, _vystavenie);
  -- Dobropis opravuje odpočet v období prijatia (§ 53 ods. 2).
  if coalesce(_r ->> 'opravuje_cislo', '') <> ''
     or coalesce(nullif(_r ->> 'amount_total', '')::numeric, 0) < 0 then
    return coalesce(_prijatie, _vystavenie, _dodanie);
  end if;
  -- Samozdanenie: daň aj odpočet podľa dodania.
  if _r ->> 'dph_rezim' in ('samozdanenie', 'nadobudnutie')
     or (_dan = 0 and (
           coalesce((_r ->> 'reverse_charge')::boolean, false)
           or upper(btrim(coalesce(_r ->> 'pohoda_clenenie_dph', ''))) ~ '^(PD|DD)(SLUZ|TOVAR|PDP)'))
  then
    return _plnenie;
  end if;
  -- Inak neskorší z dodania a prijatia (greatest ignoruje null).
  return greatest(_plnenie, _prijatie);
end
$$;

-- Deň dokladu, ktorý rozhoduje o zámku. Vydaná: skorší z dňa vystavenia a dňa
-- dodania (deň dane); prijatá: len deň odpočtu; bloček: deň vystavenia.
create or replace function public.zamok_obdobia_den(_tabulka text, _r jsonb)
returns date
language sql
stable
set search_path to 'public'
as $$
  select case _tabulka
    when 'invoices' then least(nullif(_r ->> 'issue_date', '')::date,
                               public.zamok_obdobia_den_dane_vystavenej(_r))
    -- Prijatá: len deň odpočtu — faktúra vystavená v uzavretom období, ale
    -- prijatá (a odpočítaná) neskôr, sa musí dať zapísať aj upraviť.
    when 'purchase_invoices' then public.zamok_obdobia_den_odpoctu_prijatej(_r)
    else nullif(_r ->> 'issue_date', '')::date
  end
$$;

-- Je doklad v účtovníctve (a teda vo výkaze DPH)? Koncept, stornovaná a
-- zmazaná faktúra nie (NEPLATNE_STAVY v dph-vykazy.server.ts), nespracovaný
-- bloček nie.
create or replace function public.zamok_obdobia_v_uctovnictve(_tabulka text, _r jsonb)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select case
    when _r is null then false
    when _tabulka = 'expense_documents' then coalesce(_r ->> 'status', 'new') <> 'new'
    else coalesce(_r ->> 'status', '') not in ('draft', 'cancelled')
         and nullif(_r ->> 'deleted_at', '') is null
  end
$$;

-- Položky (jsonb) bez zaúčtovacích údajov riadku — predkontácia, stredisko a
-- činnosť sa po riadkoch smú doplniť aj po uzávierke.
create or replace function public.zamok_obdobia_polozky(_items jsonb)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select case
    when jsonb_typeof(_items) = 'array' then (
      select coalesce(jsonb_agg(
               case when jsonb_typeof(x) = 'object'
                    then x - 'predkontacia' - 'pohoda_predkontacia' - 'stredisko' - 'cinnost'
                    else x end
               order by n), '[]'::jsonb)
        from jsonb_array_elements(_items) with ordinality as t(x, n))
    else _items
  end
$$;

-- --------------------------------------------------------------- hlášky

create or replace function public.zamok_obdobia_hlaska(
  _tabulka text, _dovod text, _zamok date, _pole text default null)
returns text
language plpgsql
stable
set search_path to 'public'
as $$
declare
  _uvod text := 'Obdobie je uzamknuté do ' || to_char(_zamok, 'DD.MM.YYYY') || '. ';
  _oprava text;
begin
  _oprava := case _tabulka
    when 'invoices' then 'Odomknite obdobie, alebo vystavte dobropis v otvorenom období.'
    when 'invoice_items' then 'Odomknite obdobie, alebo vystavte dobropis v otvorenom období.'
    when 'purchase_invoices' then 'Odomknite obdobie, alebo zaevidujte dobropis od dodávateľa v otvorenom období.'
    else 'Odomknite obdobie, alebo opravu zaevidujte v otvorenom období.'
  end;
  if _dovod = 'storno' then
    return _uvod || 'Faktúru z uzavretého obdobia už nemožno stornovať. ' || _oprava;
  elsif _dovod = 'zmazanie' then
    return _uvod || 'Doklad z uzavretého obdobia sa už nedá meniť ani mazať. ' || _oprava;
  elsif _dovod = 'vstup' then
    return _uvod || 'Doklad, ktorý patrí do uzavretého obdobia, sa už nedá pridať ani vystaviť — zmeňte dátum na otvorené obdobie, alebo obdobie odomknite.';
  elsif _dovod = 'odchod' then
    return _uvod || 'Doklad z uzavretého obdobia už nemožno vrátiť medzi koncepty ani nespracované. ' || _oprava;
  elsif _tabulka = 'invoice_items' then
    return _uvod || 'Položky faktúry z uzavretého obdobia sa už nedajú meniť (' || public.nazov_pola_dokladu(_pole) || '). ' || _oprava;
  end if;
  return _uvod || 'Doklad z uzavretého obdobia sa už nedá meniť ani mazať (' || public.nazov_pola_dokladu(_pole) || '). ' || _oprava;
end
$$;

-- ------------------------------------------------- spúšťač dokladov

-- Argumenty spúšťača = chránené stĺpce. Platí pre invoices, purchase_invoices
-- a expense_documents (deň aj „v účtovníctve“ podľa tg_table_name).
create or replace function public.guard_locked_period_dokladu()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _t text := tg_table_name;
  _novy jsonb := null;
  _stary jsonb := null;
  _zamok date;
  _s_ucty boolean;
  _n_ucty boolean;
  _s_zam boolean;
  _n_zam boolean;
  _pole text;
  _a jsonb;
  _b jsonb;
begin
  if tg_op <> 'DELETE' then _novy := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then _stary := to_jsonb(old); end if;

  select c.locked_until into _zamok
    from public.companies c
   where c.id = (coalesce(_novy, _stary) ->> 'company_id')::uuid;

  if _zamok is not null then
    _s_ucty := public.zamok_obdobia_v_uctovnictve(_t, _stary);
    _n_ucty := public.zamok_obdobia_v_uctovnictve(_t, _novy);
    _s_zam := _s_ucty and coalesce(public.zamok_obdobia_den(_t, _stary) <= _zamok, false);
    _n_zam := _n_ucty and coalesce(public.zamok_obdobia_den(_t, _novy) <= _zamok, false);

    if _s_zam or _n_zam then
      if tg_op = 'DELETE' then
        raise exception '%', public.zamok_obdobia_hlaska(_t, 'zmazanie', _zamok)
          using errcode = 'P0001', detail = '_zmazanie';
      end if;

      if not _s_ucty then
        -- Vstup do účtovníctva: nový doklad, vystavenie konceptu, obnovenie
        -- storna, spracovanie bločku.
        raise exception '%', public.zamok_obdobia_hlaska(_t, 'vstup', _zamok)
          using errcode = 'P0001', detail = '_vstup';
      end if;

      if not _n_ucty then
        -- Odchod z účtovníctva: storno, zmazanie, návrat na koncept.
        if _t <> 'expense_documents' and _novy ->> 'status' = 'cancelled' then
          raise exception '%', public.zamok_obdobia_hlaska(_t, 'storno', _zamok)
            using errcode = 'P0001', detail = '_storno';
        elsif nullif(_novy ->> 'deleted_at', '') is not null then
          raise exception '%', public.zamok_obdobia_hlaska(_t, 'zmazanie', _zamok)
            using errcode = 'P0001', detail = '_zmazanie';
        end if;
        raise exception '%', public.zamok_obdobia_hlaska(_t, 'odchod', _zamok)
          using errcode = 'P0001', detail = '_odchod';
      end if;

      foreach _pole in array tg_argv loop
        _a := _stary -> _pole;
        _b := _novy -> _pole;
        if _pole = 'items' then
          _a := public.zamok_obdobia_polozky(_a);
          _b := public.zamok_obdobia_polozky(_b);
        end if;
        if _a is distinct from _b then
          if _pole = 'cancelled_at' then
            raise exception '%', public.zamok_obdobia_hlaska(_t, 'storno', _zamok)
              using errcode = 'P0001', detail = '_storno';
          end if;
          raise exception '%', public.zamok_obdobia_hlaska(_t, 'pole', _zamok, _pole)
            using errcode = 'P0001', detail = _pole;
        end if;
      end loop;

      -- Poistka: deň do výkazu sa nesmie pohnúť ani cez stĺpec mimo zoznamu.
      if public.zamok_obdobia_den(_t, _stary) is distinct from public.zamok_obdobia_den(_t, _novy) then
        raise exception '%', public.zamok_obdobia_hlaska(_t, 'pole', _zamok, 'delivery_date')
          using errcode = 'P0001', detail = '_den';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

drop trigger if exists invoices_locked_period on public.invoices;
create trigger invoices_locked_period
  before insert or update or delete on public.invoices
  for each row execute function public.guard_locked_period_dokladu(
    'issue_date', 'delivery_date', 'povodna_splatnost', 'invoice_number', 'type', 'currency',
    'exchange_rate', 'exchange_rate_date', 'customer_id', 'customer_name', 'customer_ico',
    'customer_dic', 'customer_ic_dph', 'customer_country', 'subtotal', 'vat_total', 'total',
    'subtotal_eur', 'vat_total_eur', 'total_eur', 'discount_total', 'discount_type',
    'discount_value', 'rounding_mode', 'reverse_charge', 'reverse_charge_type', 'pdp_druh',
    'eu_plnenie', 'oss', 'oss_country', 'osobitna_uprava', 'oprava_25a', 'opravuje_fakturu_id',
    'advance_invoice_id', 'advance_amount', 'pohoda_clenenie_dph', 'kv_clenenie', 'cancelled_at',
    'deleted_at');

drop trigger if exists purchase_invoices_locked_period on public.purchase_invoices;
create trigger purchase_invoices_locked_period
  before insert or update or delete on public.purchase_invoices
  for each row execute function public.guard_locked_period_dokladu(
    'type', 'invoice_number', 'issue_date', 'delivery_date', 'received_date', 'povodna_splatnost',
    'supplier_name', 'supplier_ico', 'supplier_dic', 'supplier_ic_dph', 'supplier_country',
    'amount_without_vat', 'vat_amount', 'amount_total', 'amount_without_vat_eur',
    'vat_amount_eur', 'discount_total', 'items', 'vat_breakdown', 'currency', 'exchange_rate',
    'dph_rezim', 'reverse_charge', 'reverse_charge_type', 'eu_plnenie', 'osobitna_uprava',
    'odpocet', 'opravuje_cislo', 'opravuje_id', 'advance_invoice_id', 'advance_amount',
    'samofakturacia', 'pohoda_clenenie_dph', 'kv_clenenie', 'deleted_at');

drop trigger if exists expense_documents_locked_period on public.expense_documents;
create trigger expense_documents_locked_period
  before insert or update or delete on public.expense_documents
  for each row execute function public.guard_locked_period_dokladu(
    'issue_date', 'document_number', 'supplier_name', 'supplier_ico', 'supplier_dic',
    'supplier_ic_dph', 'supplier_country', 'total_amount', 'net_amount', 'vat_amount', 'vat_rate',
    'vat_breakdown', 'items', 'currency', 'exchange_rate', 'odpocet', 'pohoda_clenenie_dph',
    'kv_clenenie');

-- Starý spúšťač bločkov nahradil spoločný guard_locked_period_dokladu.
drop function if exists public.guard_locked_period_expense();

-- ------------------------------------------------------- položky faktúry

-- Položky nemajú vlastný dátum ani firmu — berú sa z faktúry (deň vystavenia aj
-- deň dodania, ako pri faktúre). Zamknuté len vymenované stĺpce; predkontácia,
-- stredisko a činnosť položky ostávajú voľné. Koncept a stornovaná faktúra
-- zámok nemajú.
create or replace function public.guard_locked_period_invoice_items()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _novy jsonb := null;
  _stary jsonb := null;
  _pole text := null;
  _faktura uuid;
  _f jsonb;
  _zamok date;
begin
  if tg_op <> 'DELETE' then _novy := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then _stary := to_jsonb(old); end if;

  if tg_op = 'UPDATE' then
    foreach _pole in array tg_argv loop
      exit when (_stary -> _pole) is distinct from (_novy -> _pole);
      _pole := null;
    end loop;
    if _pole is null then return new; end if;
  elsif tg_op = 'INSERT' then
    _pole := '_vlozenie';
  else
    _pole := '_zmazanie';
  end if;

  foreach _faktura in array array_remove(array[
      (_stary ->> 'invoice_id')::uuid, (_novy ->> 'invoice_id')::uuid], null) loop
    select to_jsonb(i), c.locked_until into _f, _zamok
      from public.invoices i
      join public.companies c on c.id = i.company_id
     where i.id = _faktura;
    if _zamok is not null
       and public.zamok_obdobia_v_uctovnictve('invoices', _f)
       and coalesce(public.zamok_obdobia_den('invoices', _f) <= _zamok, false) then
      raise exception '%', public.zamok_obdobia_hlaska('invoice_items', 'pole', _zamok,
          case when _pole like '\_%' then 'items' else _pole end)
        using errcode = 'P0001', detail = _pole;
    end if;
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

drop trigger if exists invoice_items_locked_period on public.invoice_items;
create trigger invoice_items_locked_period
  before insert or update or delete on public.invoice_items
  for each row execute function public.guard_locked_period_invoice_items(
    'invoice_id', 'name', 'description', 'quantity', 'unit', 'unit_price', 'discount_percent',
    'vat_rate', 'subtotal', 'vat_amount', 'total', 'prenesenie', 'pohoda_clenenie_dph',
    'kv_clenenie', 'colny_kod', 'krajina_povodu', 'hmotnost_kg');

-- ------------------------------------- kniha jázd a pokladňa (bez zmeny polí)

-- Rovnaké správanie ako doteraz (prvý argument je stĺpec s dátumom), len hláška
-- povie ľudsky, čo sa zmenilo.
create or replace function public.guard_locked_period()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  novy jsonb := null;
  stary jsonb := null;
  zamok date;
  d_novy date;
  d_stary date;
  i int;
  pole text := null;
begin
  if tg_op <> 'DELETE' then novy := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then stary := to_jsonb(old); end if;

  select c.locked_until into zamok
    from public.companies c
   where c.id = (coalesce(novy, stary) ->> 'company_id')::uuid;

  if zamok is not null then
    d_novy := nullif(novy ->> tg_argv[0], '')::date;
    d_stary := nullif(stary ->> tg_argv[0], '')::date;

    -- Chránený je aj presun dokladu DO uzavretého obdobia, nielen zmena
    -- dokladu, ktorý v ňom už je.
    if coalesce(d_novy <= zamok, false) or coalesce(d_stary <= zamok, false) then
      if tg_op = 'UPDATE' then
        for i in 1 .. array_length(tg_argv, 1) - 1 loop
          if (novy -> tg_argv[i]) is distinct from (stary -> tg_argv[i]) then
            pole := tg_argv[i];
            exit;
          end if;
        end loop;
      elsif tg_op = 'INSERT' then
        pole := '_vstup';
      else
        pole := '_zmazanie';
      end if;

      if pole = '_vstup' then
        raise exception '%', public.zamok_obdobia_hlaska(tg_table_name, 'vstup', zamok)
          using errcode = 'P0001', detail = pole;
      elsif pole = '_zmazanie' then
        raise exception '%', public.zamok_obdobia_hlaska(tg_table_name, 'zmazanie', zamok)
          using errcode = 'P0001', detail = pole;
      elsif pole is not null then
        raise exception '%', public.zamok_obdobia_hlaska(tg_table_name, 'pole', zamok, pole)
          using errcode = 'P0001', detail = pole;
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $function$;

-- ------------------------------------ zámok odovzdaného dokladu: ľudská hláška

-- Tá istá logika ako doteraz; v hláške je namiesto názvu stĺpca (napr.
-- „due_date“) ľudský názov poľa, technický ide do DETAIL.
create or replace function public.zamok_odovzdaneho_dokladu()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  _stlpce text[] := tg_argv;
  _s text;
  _stare jsonb := to_jsonb(old);
  _nove jsonb;
  _odovzdany boolean;
  _zamknuty boolean;
  _oprava boolean;
  _polia_opravy text[] := array['pohoda_predkontacia', 'pohoda_clenenie_dph', 'kv_clenenie', 'stredisko', 'cinnost', 'int_poznamka'];
  _nazov text;
begin
  if current_user not in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if old.exported_at is not null and (_stare ->> 'export_job_id') is not null then
    select public.nazov_programu_exportu(j.format) into _nazov
      from public.export_jobs j where j.id = (_stare ->> 'export_job_id')::uuid;
  end if;
  if tg_op = 'DELETE' then
    if old.exported_at is not null then
      if _nazov is not null then
        raise exception 'Doklad je odovzdaný do účtovníctva (%) — najprv ho vráťte, potom ho zmažte.', _nazov using errcode = 'P0001', detail = '_zmazanie';
      end if;
      raise exception 'Doklad je odovzdaný do Pohody — najprv ho vráťte z Pohody, potom ho zmažte.' using errcode = 'P0001', detail = '_zmazanie';
    end if;
    return old;
  end if;
  _nove := to_jsonb(new);
  _odovzdany := old.exported_at is not null and new.exported_at is not null;
  _zamknuty := (_stare ->> 'locked_at') is not null and (_nove ->> 'locked_at') is not null;
  if not _odovzdany and not _zamknuty then
    return new;
  end if;
  -- „Opraviť zaúčtovanie“ pustí len zaúčtovacie polia (zamknutý doklad nie).
  _oprava := _odovzdany and not _zamknuty and (_nove ->> 'oprava_zauctovania_at') is not null;
  foreach _s in array _stlpce loop
    if _oprava and _s = any(_polia_opravy) then continue; end if;
    if (_stare -> _s) is distinct from (_nove -> _s) then
      if _odovzdany and _nazov is not null then
        raise exception 'Doklad je odovzdaný do účtovníctva (%) — najprv ho vráťte (zmena: %).', _nazov, public.nazov_pola_dokladu(_s) using errcode = 'P0001', detail = _s;
      elsif _odovzdany then
        raise exception 'Doklad je odovzdaný do Pohody — najprv ho vráťte z Pohody (zmena: %).', public.nazov_pola_dokladu(_s) using errcode = 'P0001', detail = _s;
      else
        raise exception 'Doklad je zamknutý — najprv ho odomknite (zmena: %).', public.nazov_pola_dokladu(_s) using errcode = 'P0001', detail = _s;
      end if;
    end if;
  end loop;
  return new;
end
$function$;
