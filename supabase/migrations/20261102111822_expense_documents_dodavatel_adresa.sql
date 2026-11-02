-- Hotovostný bloček do Pohody: DIČ a adresa dodávateľa z eKasy (pripomienka
-- účtovníčky 2. 11. 2026 — pokladničný doklad bez adresy). Prijatá faktúra
-- tieto stĺpce má; bloček ich doteraz zahadzoval.
-- NEAPLIKOVANÉ — aplikovať cez MCP apply_migration a súbor premenovať podľa
-- skutočnej verzie (pamäť faktero-migracie-verzie-nesedia).
alter table public.expense_documents
  add column if not exists supplier_dic text,
  add column if not exists supplier_street text,
  add column if not exists supplier_city text,
  add column if not exists supplier_zip text,
  add column if not exists supplier_country text;

notify pgrst, 'reload schema';
