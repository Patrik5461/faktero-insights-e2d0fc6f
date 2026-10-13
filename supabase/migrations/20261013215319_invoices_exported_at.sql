-- Kedy bola vystavená faktúra odovzdaná do účtovníctva (Pohoda) — pre šípku
-- v zozname. Drží ju spúšťač nad export_logs: platí posledný záznam faktúry.
alter table public.invoices add column exported_at timestamptz;

create or replace function public.faktero_invoice_exported_at()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _id uuid := coalesce(new.invoice_id, old.invoice_id);
  _posledny record;
begin
  if _id is null then return null; end if;
  select status, coalesce(potvrdene_at, created_at) as kedy into _posledny
    from export_logs where invoice_id = _id
    order by created_at desc limit 1;
  update invoices
     set exported_at = case when _posledny.status = 'ok' then _posledny.kedy else null end
   where id = _id
     and exported_at is distinct from (case when _posledny.status = 'ok' then _posledny.kedy else null end);
  return null;
end $$;
revoke all on function public.faktero_invoice_exported_at() from public, anon, authenticated;

create trigger export_logs_invoice_exported_at
after insert or update or delete on public.export_logs
for each row execute function public.faktero_invoice_exported_at();

update invoices i set exported_at = x.kedy
from (
  select distinct on (invoice_id) invoice_id, status, coalesce(potvrdene_at, created_at) as kedy
  from export_logs where invoice_id is not null
  order by invoice_id, created_at desc
) x
where x.invoice_id = i.id and x.status = 'ok';
