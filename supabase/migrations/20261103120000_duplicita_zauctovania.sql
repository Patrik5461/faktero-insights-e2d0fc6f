-- Duplicitný doklad sa nesmie zaúčtovať ani (pri bločku) uložiť druhýkrát.
--
-- Poistka v databáze k pravidlu v src/lib/faktero/duplicita-zauctovania.ts —
-- aplikácia to isté kontroluje sama (aj bez tejto migrácie). Zhoda názvu
-- dodávateľa je tu prísnejšia (len lower/trim, bez odstránenia diakritiky a
-- právnej formy), takže spúšťač nikdy nezastaví nič, čo by aplikácia pustila.
--
-- Kontrolujú sa len nové zápisy: zaúčtovanie (zauctovane_at z NULL) a nový
-- bloček, ktorý ešte nie je odovzdaný. Existujúce duplicity (aj odovzdané
-- z prenosu z Doklada) sa nemenia ani neblokujú pri ďalších úpravách.

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

-- Prijatá faktúra: rovnaké číslo + dodávateľ, rovnaký typ, obe dobropis alebo obe nie.
create or replace function public.faktero_strazca_duplicity_prijatej()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  druha record;
  cislo text := public.faktero_cislo_dokladu_norm(new.invoice_number);
  ico text := public.faktero_ico_norm(new.supplier_ico);
  nazov text := lower(trim(coalesce(new.supplier_name, '')));
  dobropis boolean := coalesce(new.amount_total, 0) < 0 or new.opravuje_cislo is not null or new.opravuje_id is not null;
begin
  if new.zauctovane_at is null or cislo = '' then
    return new;
  end if;
  if tg_op = 'INSERT' and new.exported_at is not null then
    return new; -- prenos histórie (už odovzdané doklady)
  end if;
  if tg_op = 'UPDATE' and old.zauctovane_at is not null then
    return new;
  end if;
  if new.deleted_at is not null or new.status in ('draft', 'cancelled') then
    return new;
  end if;
  select p.id, p.invoice_number into druha
  from public.purchase_invoices p
  where p.company_id = new.company_id
    and p.id <> new.id
    and p.deleted_at is null
    and p.status not in ('draft', 'cancelled')
    and p.type = new.type
    and (coalesce(p.amount_total, 0) < 0 or p.opravuje_cislo is not null or p.opravuje_id is not null) = dobropis
    and public.faktero_cislo_dokladu_norm(p.invoice_number) = cislo
    and (
      case
        when ico <> '' and public.faktero_ico_norm(p.supplier_ico) <> '' then public.faktero_ico_norm(p.supplier_ico) = ico
        else nazov <> '' and lower(trim(coalesce(p.supplier_name, ''))) = nazov
      end
    )
  limit 1;
  if found then
    raise exception 'Duplicitný doklad — rovnaká faktúra % od toho istého dodávateľa už v evidencii je (id %); zaúčtovať sa dá až po zmazaní jednej z nich.',
      druha.invoice_number, druha.id
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

drop trigger if exists faktero_strazca_duplicity_prijatej on public.purchase_invoices;
create trigger faktero_strazca_duplicity_prijatej
  before insert or update of zauctovane_at on public.purchase_invoices
  for each row execute function public.faktero_strazca_duplicity_prijatej();

-- Bloček: rovnaký QR z eKasy; keď ho nemajú oba, rovnaký dodávateľ + deň + suma.
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

-- Kandidáti podľa dňa (bločky) — dotaz spúšťača nemá prechádzať celú tabuľku.
create index if not exists expense_documents_company_issue_date_idx
  on public.expense_documents (company_id, issue_date);
