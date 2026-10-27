-- Idempotencia migrácie nespracovaných dokladov z Doklada.
alter table public.nespracovane_doklady add column if not exists doklado_id text;
create unique index if not exists nespracovane_doklady_doklado_id_uniq
  on public.nespracovane_doklady (company_id, doklado_id) where doklado_id is not null;
