-- Viac pokladní (skratky z Pohody) v číselníku a pokladňa na doklade.
alter table public.predkontacie drop constraint if exists predkontacie_druh_check;
alter table public.predkontacie add constraint predkontacie_druh_check
  check (druh in ('predkontacia', 'clenenie_dph', 'stredisko', 'cinnost', 'ciselny_rad', 'pokladna'));
alter table public.expense_documents add column if not exists pohoda_pokladna text;

-- Voľba: bločky do Pohody aj s položkami (inak len súhrn po sadzbách).
alter table public.companies add column if not exists pohoda_polozky_blockov boolean not null default false;

/*
  Zámok odovzdaného dokladu: kým je doklad v Pohode (exported_at), jeho sumy,
  dátumy a zaúčtovanie sa nemenia — v Pohode by sa rozišli. Úhrada, stav a
  odkazy ostávajú voľné. Zmena je možná po „Vrátiť z Pohody", ktoré
  exported_at v tej istej úprave vynuluje.
*/
create or replace function public.zamok_odovzdaneho_dokladu()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _stlpce text[] := tg_argv;
  _s text;
  _stare jsonb := to_jsonb(old);
  _nove jsonb := to_jsonb(new);
begin
  if old.exported_at is null or new.exported_at is null then
    return new;
  end if;
  foreach _s in array _stlpce loop
    if (_stare -> _s) is distinct from (_nove -> _s) then
      raise exception 'Doklad je odovzdaný do Pohody — najprv ho vráťte z Pohody (%).', _s
        using errcode = 'P0001';
    end if;
  end loop;
  return new;
end
$$;
revoke all on function public.zamok_odovzdaneho_dokladu() from public, anon, authenticated;

drop trigger if exists expense_documents_zamok_odovzdania on public.expense_documents;
create trigger expense_documents_zamok_odovzdania
  before update on public.expense_documents
  for each row execute function public.zamok_odovzdaneho_dokladu(
    'supplier_name', 'supplier_ico', 'supplier_ic_dph', 'document_number', 'issue_date',
    'total_amount', 'vat_amount', 'net_amount', 'vat_rate', 'vat_breakdown', 'currency',
    'payment_method', 'pohoda_predkontacia', 'pohoda_clenenie_dph', 'kv_clenenie',
    'rozuctovanie', 'stredisko', 'cinnost', 'pohoda_rad', 'pohoda_pokladna', 'job_id', 'category'
  );

drop trigger if exists purchase_invoices_zamok_odovzdania on public.purchase_invoices;
create trigger purchase_invoices_zamok_odovzdania
  before update on public.purchase_invoices
  for each row execute function public.zamok_odovzdaneho_dokladu(
    'invoice_number', 'supplier_name', 'supplier_ico', 'supplier_ic_dph', 'issue_date',
    'delivery_date', 'amount_without_vat', 'vat_amount', 'amount_total', 'currency',
    'pohoda_predkontacia', 'pohoda_clenenie_dph', 'kv_clenenie', 'rozuctovanie',
    'stredisko', 'cinnost', 'pohoda_rad', 'job_id', 'category'
  );
