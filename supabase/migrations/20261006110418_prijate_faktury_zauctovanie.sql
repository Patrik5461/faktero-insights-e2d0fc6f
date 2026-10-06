-- Zaúčtovanie prijatých faktúr (ako v Doklado): predkontácia, členenie DPH,
-- kategória, pravidlo účtovania a príznak „zaúčtované“ — iba zaúčtované idú do
-- Pohody (konektor aj XML), `exported_at` zabráni dvojitému odovzdaniu.
alter table public.purchase_invoices
  add column if not exists category text,
  add column if not exists pohoda_predkontacia text,
  add column if not exists pohoda_clenenie_dph text,
  add column if not exists pravidlo_id uuid references public.pravidla_uctovania(id) on delete set null,
  add column if not exists zauctovane_at timestamptz,
  add column if not exists zauctoval uuid,
  add column if not exists exported_at timestamptz;

create index if not exists purchase_invoices_na_odovzdanie_idx
  on public.purchase_invoices (company_id, issue_date)
  where zauctovane_at is not null and exported_at is null and deleted_at is null;

-- Pravidlá účtovania rovnako ako pri dokladoch — tá istá funkcia, stĺpce
-- (supplier_ico/name, payment_method, category, pohoda_*, odpocet, note,
-- pravidlo_id, exported_at) má prijatá faktúra teraz tiež.
drop trigger if exists purchase_invoices_pravidlo_uctovania on public.purchase_invoices;
create trigger purchase_invoices_pravidlo_uctovania
  before insert or update of supplier_ico, supplier_name, payment_method, pravidlo_id
  on public.purchase_invoices
  for each row execute function public.faktero_uplatni_pravidlo();
