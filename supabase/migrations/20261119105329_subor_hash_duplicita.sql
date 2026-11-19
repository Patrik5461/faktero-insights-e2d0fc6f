-- Rovnaký súbor (SHA-256 obsahu) nahratý znova do Nespracovaných tej istej
-- firmy sa odmietne („Tento doklad už vo Fakteri je“). Odtlačok nesie
-- nespracovaný doklad a po Vytvoriť ho preberie prijatá faktúra, bloček či
-- iný doklad (a pri Vrátiť do Nespracovaných ide späť). Staré doklady sa
-- nedopočítavajú — porovnávajú sa len nové nahratia.
alter table public.nespracovane_doklady add column if not exists subor_hash text;
alter table public.purchase_invoices add column if not exists subor_hash text;
alter table public.expense_documents add column if not exists subor_hash text;
alter table public.other_documents add column if not exists subor_hash text;

create index if not exists nespracovane_doklady_subor_hash
  on public.nespracovane_doklady (company_id, subor_hash) where subor_hash is not null;
create index if not exists purchase_invoices_subor_hash
  on public.purchase_invoices (company_id, subor_hash) where subor_hash is not null;
create index if not exists expense_documents_subor_hash
  on public.expense_documents (company_id, subor_hash) where subor_hash is not null;
create index if not exists other_documents_subor_hash
  on public.other_documents (company_id, subor_hash) where subor_hash is not null;
