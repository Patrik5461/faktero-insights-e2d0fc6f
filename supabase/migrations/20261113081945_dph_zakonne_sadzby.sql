-- DPH na prijatých dokladoch len po zákonných sadzbách (Patrik 13. 11. 2026).
--
-- Spúšťač odmietne uloženie prijatej faktúry (purchase_invoices) alebo bločku
-- (expense_documents), keď:
--   1. rozpis (vat_breakdown) nesie sadzbu, ktorá pre krajinu firmy a deň
--      dodania neplatí (SK od 2025 23/19/5/0, do 2024 20/10/0; CZ od 2024
--      21/12/0, predtým aj 15/10; DE 19/7/0, 2. polrok 2020 16/5/0),
--   2. DPH riadku nesedí so základ × sadzba (tolerancia 0,10 € — spúšťač
--      nepozná počet položiek; server kontroluje prísnejšie cez dph-pravidlo.ts),
--      a riadok v prenesení / oslobodený / mimo predmetu nesie DPH,
--   3. súčet rozpisu nesedí s hlavičkou nad 0,02,
--   4. rozpis chýba a pomer DPH k základu nie je zákonná sadzba (±0,3 p. b.
--      alebo do 0,02 € na centovom zaokrúhlení).
--
-- Výnimky: zálohová faktúra (type = 'proforma'), koncept (status = 'draft'),
-- samofaktúra (samofakturacia = true — vzniká z položiek s výberom zákonných
-- sadzieb a pri prenesení nesie samozdanenú daň v hlavičke) a UPDATE, ktorý sumy, rozpis ani dátumy nemení — existujúci zlý riadok sa
-- tak dá zaúčtovať, odovzdať, uhradiť. Prechod z konceptu/zálohovej na
-- ostrý doklad sa kontroluje.
--
-- Doklad prenesený z Doklada (doklado_id), ktorý je na kontrole
-- (na_kontrolu_at), sa nekontroluje — migrácia ho tak zapíše, keď sa rozpis
-- DPH nedal zostaviť (inak by sa neprenesol vôbec). Zrušenie príznaku
-- (na_kontrolu_at → null) sa kontroluje celé, ako prechod z konceptu.
--
-- Krajina dodávateľa: supplier_country (ISO kód), keď chýba, prefix
-- supplier_ic_dph (bločky majú supplier_country prázdnu; EL = GR).
--
-- Záporný riadok (odpočet zdanenej zálohy, dobropis) smie niesť ktorúkoľvek
-- sadzbu, ktorá v krajine niekedy platila. Dodávateľ z inej krajiny
-- (supplier_country ≠ krajina firmy) môže mať sadzby svojho štátu — pri ňom
-- sa sadzba nekontroluje, len výpočet a súčty.
--
-- Chyba: errcode P0001, text „FAKTERO_DPH: <slovenská veta>“ (aplikácia
-- prefix odstráni, src/lib/faktero/dph-pravidlo.ts → hlaskaSpustacaDph).

create or replace function public.faktero_krajina_dane(_country text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when upper(btrim(coalesce(_country, ''))) ~ '^(CZ|CZE|ČESK|CESK|CZECH)' then 'CZ'
    when upper(btrim(coalesce(_country, ''))) in ('DE', 'DEU')
      or upper(btrim(coalesce(_country, ''))) ~ '^(DEUTSCHLAND|NEMECK|NĚMECK|GERMANY|BUNDESREPUBLIK)' then 'DE'
    else 'SK'
  end
$$;

-- Krajina dodávateľa: ISO kód zo supplier_country, inak prefix IČ DPH; inak null.
create or replace function public.faktero_krajina_dodavatela(_country text, _ic_dph text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when upper(btrim(coalesce(_country, ''))) ~ '^[A-Z]{2}$' then
      case when upper(btrim(_country)) = 'EL' then 'GR' else upper(btrim(_country)) end
    when upper(regexp_replace(coalesce(_ic_dph, ''), '\s', '', 'g')) ~ '^[A-Z]{2}[0-9A-Z]{2,}' then
      case when upper(left(regexp_replace(_ic_dph, '\s', '', 'g'), 2)) = 'EL' then 'GR'
           else upper(left(regexp_replace(_ic_dph, '\s', '', 'g'), 2)) end
    else null
  end
$$;

-- Zákonné sadzby pre krajinu a deň; bez dňa všetko, čo v krajine platilo.
create or replace function public.faktero_zakonne_sadzby(_krajina text, _den date)
returns numeric[]
language sql
immutable
set search_path = ''
as $$
  select case _krajina
    when 'CZ' then case
      when _den is null then array[0, 10, 12, 15, 21]::numeric[]
      when _den >= date '2024-01-01' then array[0, 12, 21]::numeric[]
      else array[0, 10, 15, 21]::numeric[] end
    when 'DE' then case
      when _den is null then array[0, 5, 7, 16, 19]::numeric[]
      when _den >= date '2021-01-01' then array[0, 7, 19]::numeric[]
      when _den >= date '2020-07-01' then array[0, 5, 16]::numeric[]
      when _den >= date '2007-01-01' then array[0, 7, 19]::numeric[]
      else array[0, 7, 16]::numeric[] end
    else case
      when _den is null then array[0, 5, 10, 19, 20, 23]::numeric[]
      when _den >= date '2025-01-01' then array[0, 5, 19, 23]::numeric[]
      else array[0, 10, 20]::numeric[] end
  end
$$;

-- Číslo z jsonb hodnoty (aj „10,50“); nečíselné → 0.
create or replace function public.faktero_jsonb_cislo(_v jsonb)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  if _v is null or jsonb_typeof(_v) = 'null' then
    return 0;
  end if;
  if jsonb_typeof(_v) = 'number' then
    return (_v #>> '{}')::numeric;
  end if;
  return coalesce(nullif(replace(btrim(_v #>> '{}'), ',', '.'), '')::numeric, 0);
exception when others then
  return 0;
end
$$;

-- Suma po slovensky: „1 326,09“.
create or replace function public.faktero_fmt_sumy(_n numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(btrim(to_char(round(coalesce(_n, 0), 2), 'FM999G999G999G990D00')), ',', ' '), '.', ',')
$$;

-- Čistá kontrola: vráti prvú chybu ako vetu, alebo null.
create or replace function public.faktero_chyba_dph(
  _rozpis jsonb,
  _zaklad numeric,
  _dph numeric,
  _krajina text,
  _den date,
  _krajina_dodavatela text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  _povolene numeric[] := public.faktero_zakonne_sadzby(_krajina, _den);
  _historicke numeric[] := public.faktero_zakonne_sadzby(_krajina, null);
  _cudzi boolean := nullif(upper(btrim(coalesce(_krajina_dodavatela, ''))), '') is not null
                    and upper(btrim(_krajina_dodavatela)) <> _krajina;
  _r jsonb;
  _i int := 0;
  _n int;
  _sadzba numeric;
  _z numeric;
  _d numeric;
  _kat text;
  _bez_dane boolean;
  _sum_z numeric := 0;
  _sum_d numeric := 0;
  _pomer numeric;
  _ok boolean;
  _pred text;
  _zoznam text := array_to_string(_povolene, ', ');
begin
  _zaklad := coalesce(_zaklad, 0);
  _dph := coalesce(_dph, 0);

  if jsonb_typeof(_rozpis) is distinct from 'array' or jsonb_array_length(_rozpis) = 0 then
    if abs(_dph) < 0.005 then
      return null;
    end if;
    if abs(_zaklad) < 0.005 then
      return format('doklad má DPH %s bez základu dane — doplňte rozpis DPH po sadzbách.', public.faktero_fmt_sumy(_dph));
    end if;
    if _cudzi then
      return null;
    end if;
    _pomer := _dph / _zaklad * 100;
    select exists (
      select 1 from unnest(_povolene) s
       where s > 0 and (abs(_pomer - s) <= 0.3 or abs(round(_zaklad * s / 100, 2) - _dph) <= 0.02)
    ) into _ok;
    if not _ok then
      return format(
        'DPH %s zo základu %s je %s %%, a to nie je zákonná sadzba (%s %%). Doplňte rozpis DPH po sadzbách.',
        public.faktero_fmt_sumy(_dph), public.faktero_fmt_sumy(_zaklad), replace(trim_scale(round(_pomer, 2))::text, '.', ','), _zoznam);
    end if;
    return null;
  end if;

  _n := jsonb_array_length(_rozpis);
  for _r in select * from jsonb_array_elements(_rozpis) loop
    _i := _i + 1;
    _pred := case when _n > 1 then format('Riadok %s: ', _i) else '' end;
    _sadzba := public.faktero_jsonb_cislo(coalesce(_r->'sadzba', _r->'rate'));
    _z := public.faktero_jsonb_cislo(coalesce(_r->'zaklad', _r->'base'));
    _d := public.faktero_jsonb_cislo(coalesce(_r->'dph', _r->'vat'));
    _kat := coalesce(_r->>'vat_category', '');
    _bez_dane := coalesce(_r->>'pdp', '') = 'true'
                 or _kat in ('reverse_charge', 'exempt', 'out_of_scope');
    _sum_z := _sum_z + _z;
    _sum_d := _sum_d + _d;

    if not _cudzi and not (
      _sadzba = any (case when _z < 0 or _d < 0 then _historicke else _povolene end)
    ) then
      return format('%ssadzba %s %% nie je zákonná sadzba DPH (platia %s %%).',
        _pred, replace(trim_scale(_sadzba)::text, '.', ','), _zoznam);
    end if;

    if _bez_dane then
      if abs(_d) >= 0.005 then
        return format('%splnenie v prenesení, oslobodené alebo mimo predmetu DPH nemôže mať DPH (%s).', _pred, public.faktero_fmt_sumy(_d));
      end if;
    elsif abs(round(_z * _sadzba / 100, 2) - _d) > 0.10 then
      return format('%spri %s %% zo základu %s vychádza DPH %s, uložená je %s.',
        _pred, replace(trim_scale(_sadzba)::text, '.', ','), public.faktero_fmt_sumy(_z),
        public.faktero_fmt_sumy(round(_z * _sadzba / 100, 2)), public.faktero_fmt_sumy(_d));
    end if;
  end loop;

  if abs(_sum_z - _zaklad) > 0.02 then
    return format('súčet základov v rozpise %s nesedí so sumou bez DPH %s.', public.faktero_fmt_sumy(_sum_z), public.faktero_fmt_sumy(_zaklad));
  end if;
  if abs(_sum_d - _dph) > 0.02 then
    return format('súčet DPH v rozpise %s nesedí s DPH dokladu %s.', public.faktero_fmt_sumy(_sum_d), public.faktero_fmt_sumy(_dph));
  end if;
  return null;
end
$$;

create or replace function public.faktero_dph_zakonne_sadzby()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _krajina text;
  _chyba text;
begin
  -- Prenos z Doklada na kontrole: nekontroluje sa, kým príznak trvá.
  if nullif(btrim(coalesce(new.doklado_id, '')), '') is not null and new.na_kontrolu_at is not null then
    return new;
  end if;
  if tg_table_name = 'purchase_invoices' then
    if coalesce(new.type, '') = 'proforma' or coalesce(new.status, '') = 'draft'
       or coalesce(new.samofakturacia, false) then
      return new;
    end if;
    if tg_op = 'UPDATE'
       and coalesce(old.type, '') <> 'proforma' and coalesce(old.status, '') <> 'draft'
       and not (nullif(btrim(coalesce(old.doklado_id, '')), '') is not null and old.na_kontrolu_at is not null)
       and new.amount_without_vat is not distinct from old.amount_without_vat
       and new.vat_amount is not distinct from old.vat_amount
       and new.amount_total is not distinct from old.amount_total
       and new.vat_breakdown is not distinct from old.vat_breakdown
       and new.delivery_date is not distinct from old.delivery_date
       and new.issue_date is not distinct from old.issue_date
       and new.currency is not distinct from old.currency
       and new.supplier_country is not distinct from old.supplier_country
       and new.supplier_ic_dph is not distinct from old.supplier_ic_dph then
      return new;
    end if;
    select public.faktero_krajina_dane(c.country) into _krajina
      from public.companies c where c.id = new.company_id;
    _chyba := public.faktero_chyba_dph(
      new.vat_breakdown, new.amount_without_vat, new.vat_amount,
      coalesce(_krajina, 'SK'), coalesce(new.delivery_date, new.issue_date),
      public.faktero_krajina_dodavatela(new.supplier_country, new.supplier_ic_dph));
    if _chyba is not null then
      raise exception using
        errcode = 'P0001',
        message = 'FAKTERO_DPH: Faktúru ' || coalesce(nullif(new.invoice_number, ''), 'bez čísla')
                  || ' nemožno uložiť — ' || _chyba;
    end if;
  else
    if tg_op = 'UPDATE'
       and not (nullif(btrim(coalesce(old.doklado_id, '')), '') is not null and old.na_kontrolu_at is not null)
       and new.net_amount is not distinct from old.net_amount
       and new.vat_amount is not distinct from old.vat_amount
       and new.total_amount is not distinct from old.total_amount
       and new.vat_breakdown is not distinct from old.vat_breakdown
       and new.issue_date is not distinct from old.issue_date
       and new.supplier_country is not distinct from old.supplier_country
       and new.supplier_ic_dph is not distinct from old.supplier_ic_dph then
      return new;
    end if;
    select public.faktero_krajina_dane(c.country) into _krajina
      from public.companies c where c.id = new.company_id;
    _chyba := public.faktero_chyba_dph(
      new.vat_breakdown, new.net_amount, new.vat_amount,
      coalesce(_krajina, 'SK'), new.issue_date,
      public.faktero_krajina_dodavatela(new.supplier_country, new.supplier_ic_dph));
    if _chyba is not null then
      raise exception using
        errcode = 'P0001',
        message = 'FAKTERO_DPH: Bloček ' || coalesce(nullif(new.document_number, ''), 'bez čísla')
                  || ' nemožno uložiť — ' || _chyba;
    end if;
  end if;
  return new;
end
$$;

revoke all on function public.faktero_dph_zakonne_sadzby() from public, anon, authenticated;
revoke all on function public.faktero_chyba_dph(jsonb, numeric, numeric, text, date, text) from public, anon;
grant execute on function public.faktero_chyba_dph(jsonb, numeric, numeric, text, date, text) to authenticated, service_role;
revoke all on function public.faktero_zakonne_sadzby(text, date) from public, anon;
grant execute on function public.faktero_zakonne_sadzby(text, date) to authenticated, service_role;
revoke all on function public.faktero_krajina_dodavatela(text, text) from public, anon;
grant execute on function public.faktero_krajina_dodavatela(text, text) to authenticated, service_role;
revoke all on function public.faktero_krajina_dane(text) from public, anon;
grant execute on function public.faktero_krajina_dane(text) to authenticated, service_role;
revoke all on function public.faktero_jsonb_cislo(jsonb) from public, anon;
revoke all on function public.faktero_fmt_sumy(numeric) from public, anon;
grant execute on function public.faktero_fmt_sumy(numeric) to authenticated, service_role;
grant execute on function public.faktero_jsonb_cislo(jsonb) to authenticated, service_role;

-- „zzz_“: beží po ostatných BEFORE spúšťačoch (abecedne), teda nad finálnymi hodnotami.
drop trigger if exists zzz_faktero_dph_zakonne_sadzby on public.purchase_invoices;
create trigger zzz_faktero_dph_zakonne_sadzby
  before insert or update of amount_without_vat, vat_amount, amount_total, vat_breakdown,
    delivery_date, issue_date, currency, supplier_country, supplier_ic_dph, type, status,
    doklado_id, na_kontrolu_at
  on public.purchase_invoices
  for each row execute function public.faktero_dph_zakonne_sadzby();

drop trigger if exists zzz_faktero_dph_zakonne_sadzby on public.expense_documents;
create trigger zzz_faktero_dph_zakonne_sadzby
  before insert or update of net_amount, vat_amount, total_amount, vat_breakdown, issue_date, supplier_country,
    supplier_ic_dph, doklado_id, na_kontrolu_at
  on public.expense_documents
  for each row execute function public.faktero_dph_zakonne_sadzby();
