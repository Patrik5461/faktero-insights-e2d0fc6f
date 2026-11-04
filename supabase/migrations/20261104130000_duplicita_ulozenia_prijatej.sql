-- Duplicitná prijatá faktúra sa nesmie ani uložiť (nielen zaúčtovať).
--
-- Poistka v databáze k pravidlu v src/lib/faktero/duplicita-zauctovania.ts
-- (`suDuplicitne`, `chybaUlozenejPrijatej`). Rovnaká faktúra = rovnaké
-- číslo (normalizované) + dodávateľ (IČO, inak názov) + typ + dobropis áno/nie
-- + suma + rok vystavenia (neznáma suma či dátum sa za rozdiel nepočíta).
-- Rovnaké číslo s inou sumou alebo z iného roka je len „možná duplicita“
-- (Alza opakuje čísla) — tú aplikácia po potvrdení uloží a spúšťač ju pustí,
-- uloží aj zaúčtuje.
--
-- Zhoda názvu je tu prísnejšia (len lower/trim), takže spúšťač nikdy
-- nezastaví nič, čo by aplikácia pustila. Kontroluje sa:
--   * INSERT nevymazanej, nestornovanej a nekonceptovej faktúry (výnimka:
--     prenos histórie, ktorý prichádza už odovzdaný — exported_at),
--   * UPDATE, ktorý zmení číslo, dodávateľa, sumu, dátum, typ alebo faktúru
--     obnoví z koša / zo stornovanej či konceptu,
--   * zaúčtovanie (zauctovane_at z NULL) — ako doteraz.
-- Existujúce duplicity sa nemenia; ich ostatné polia sa dajú upravovať.
--
-- Bločky: duplicitu nerobí stornovaný bloček (status cancelled) — tak ako
-- `suDuplicitne` v aplikácii.
--
-- Migrácia je idempotentná (create or replace / drop trigger if exists /
-- create index if not exists).

create or replace function public.faktero_cislo_dokladu_norm(v text)
returns text
language sql
immutable
as $$
  select regexp_replace(regexp_replace(upper(coalesce(v, '')), '[^0-9A-Z]', '', 'g'), '^0+(?=\d)', '')
$$;

create or replace function public.faktero_ico_norm(v text)
returns text
language sql
immutable
as $$
  select regexp_replace(upper(coalesce(v, '')), '[^0-9A-Z]', '', 'g')
$$;

-- Uložená prijatá faktúra, ktorá je tá istá ako `n` (null = žiadna).
create or replace function public.faktero_najdi_duplicitnu_prijatu(n public.purchase_invoices)
returns uuid
language sql
stable
set search_path to 'public'
as $$
  select p.id
  from public.purchase_invoices p
  where p.company_id = n.company_id
    and p.id <> n.id
    and p.deleted_at is null
    and coalesce(p.status, '') not in ('draft', 'cancelled')
    and coalesce(p.type, 'regular') = coalesce(n.type, 'regular')
    and (coalesce(p.amount_total, 0) < 0 or p.opravuje_cislo is not null or p.opravuje_id is not null)
      = (coalesce(n.amount_total, 0) < 0 or n.opravuje_cislo is not null or n.opravuje_id is not null)
    and public.faktero_cislo_dokladu_norm(p.invoice_number) = public.faktero_cislo_dokladu_norm(n.invoice_number)
    and (
      case
        when public.faktero_ico_norm(n.supplier_ico) <> '' and public.faktero_ico_norm(p.supplier_ico) <> ''
          then public.faktero_ico_norm(p.supplier_ico) = public.faktero_ico_norm(n.supplier_ico)
        else lower(trim(coalesce(n.supplier_name, ''))) <> ''
          and lower(trim(coalesce(p.supplier_name, ''))) = lower(trim(coalesce(n.supplier_name, '')))
      end
    )
    and (p.amount_total is null or n.amount_total is null
      or round(abs(p.amount_total) * 100) = round(abs(n.amount_total) * 100))
    and (p.issue_date is null or n.issue_date is null
      or extract(year from p.issue_date) = extract(year from n.issue_date))
  order by (p.exported_at is not null or p.zauctovane_at is not null) desc, p.created_at
  limit 1
$$;

create or replace function public.faktero_strazca_duplicity_prijatej()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  druha public.purchase_invoices;
  druha_id uuid;
  kontrolovat boolean := false;
begin
  -- „bez čísla“ dosadí vytvorenie z Nespracovaných — dve také nie sú tá istá faktúra.
  if public.faktero_cislo_dokladu_norm(new.invoice_number) = '' or lower(trim(new.invoice_number)) = 'bez čísla' then
    return new;
  end if;
  if new.deleted_at is not null or coalesce(new.status, '') in ('draft', 'cancelled') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.exported_at is not null then
      return new; -- prenos histórie (už odovzdané doklady)
    end if;
    kontrolovat := true;
  elsif new.exported_at is null then
    kontrolovat :=
      new.invoice_number is distinct from old.invoice_number
      or new.supplier_ico is distinct from old.supplier_ico
      or new.supplier_name is distinct from old.supplier_name
      or new.amount_total is distinct from old.amount_total
      or new.issue_date is distinct from old.issue_date
      or new.type is distinct from old.type
      or old.deleted_at is not null
      or coalesce(old.status, '') in ('draft', 'cancelled');
  end if;

  if kontrolovat then
    druha_id := public.faktero_najdi_duplicitnu_prijatu(new);
    if druha_id is not null then
      select * into druha from public.purchase_invoices where id = druha_id;
      raise exception 'Táto faktúra už je v evidencii: % [%]',
        concat_ws(', ',
          coalesce(nullif(trim(druha.invoice_number), ''), 'bez čísla'),
          coalesce(nullif(trim(druha.supplier_name), ''), 'bez dodávateľa'),
          case when druha.amount_total is null then null
            else replace(to_char(druha.amount_total, 'FM999999990.00'), '.', ',') || ' ' || coalesce(druha.currency, 'EUR') end),
        druha_id
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- Zaúčtovanie existujúcej duplicity (vznikla pred touto poistkou).
  if tg_op = 'UPDATE' and new.zauctovane_at is not null and old.zauctovane_at is null then
    druha_id := public.faktero_najdi_duplicitnu_prijatu(new);
    if druha_id is not null then
      select * into druha from public.purchase_invoices where id = druha_id;
      raise exception 'Duplicitný doklad — rovnaká faktúra % od toho istého dodávateľa už v evidencii je (id %); zaúčtovať sa dá až po zmazaní jednej z nich.',
        druha.invoice_number, druha_id
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists faktero_strazca_duplicity_prijatej on public.purchase_invoices;
create trigger faktero_strazca_duplicity_prijatej
  before insert or update on public.purchase_invoices
  for each row execute function public.faktero_strazca_duplicity_prijatej();

-- Kandidáti podľa normalizovaného čísla — spúšťač nemá prechádzať celú tabuľku.
create index if not exists purchase_invoices_company_cislo_norm_idx
  on public.purchase_invoices (company_id, public.faktero_cislo_dokladu_norm(invoice_number))
  where deleted_at is null;

-- Bloček: stornovaný nie je duplicita (ani nový stornovaný, ani starý).
create or replace function public.faktero_najdi_duplicitny_blocek(b public.expense_documents)
returns uuid
language sql
stable
set search_path to 'public'
as $$
  select e.id
  from public.expense_documents e
  where e.company_id = b.company_id
    and e.id <> b.id
    and coalesce(e.status, '') <> 'cancelled'
    and (coalesce(e.total_amount, 0) < 0) = (coalesce(b.total_amount, 0) < 0)
    and (
      case
        when nullif(trim(coalesce(b.qr_raw, '')), '') is not null and nullif(trim(coalesce(e.qr_raw, '')), '') is not null
          then lower(trim(e.qr_raw)) = lower(trim(b.qr_raw))
        else
          b.issue_date is not null and e.issue_date = b.issue_date
          and b.total_amount is not null and e.total_amount is not null
          and round(abs(e.total_amount) * 100) = round(abs(b.total_amount) * 100)
          and (
            case
              when public.faktero_ico_norm(b.supplier_ico) <> '' and public.faktero_ico_norm(e.supplier_ico) <> ''
                then public.faktero_ico_norm(e.supplier_ico) = public.faktero_ico_norm(b.supplier_ico)
              else lower(trim(coalesce(b.supplier_name, ''))) <> ''
                and lower(trim(coalesce(e.supplier_name, ''))) = lower(trim(coalesce(b.supplier_name, '')))
            end
          )
      end
    )
  limit 1
$$;

create or replace function public.faktero_strazca_duplicity_blocku()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  druhy uuid;
begin
  if coalesce(new.status, '') = 'cancelled' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.exported_at is not null then
      return new; -- prenos histórie
    end if;
    druhy := public.faktero_najdi_duplicitny_blocek(new);
    if druhy is not null then
      raise exception 'Tento bloček už je uložený: % [%]',
        concat_ws(', ', coalesce(nullif(trim(new.supplier_name), ''), 'bez dodávateľa'), to_char(new.issue_date, 'FMDD. FMMM. YYYY'),
          case when new.total_amount is null then null else to_char(new.total_amount, 'FM999999990.00') || ' ' || coalesce(new.currency, 'EUR') end),
        druhy
        using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.zauctovane_at is not null and old.zauctovane_at is null then
    druhy := public.faktero_najdi_duplicitny_blocek(new);
    if druhy is not null then
      raise exception 'Duplicitný doklad — rovnaký bloček už v evidencii je (id %); zaúčtovať sa dá až po zmazaní jedného z nich.', druhy
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists faktero_strazca_duplicity_blocku on public.expense_documents;
create trigger faktero_strazca_duplicity_blocku
  before insert or update of zauctovane_at on public.expense_documents
  for each row execute function public.faktero_strazca_duplicity_blocku();
