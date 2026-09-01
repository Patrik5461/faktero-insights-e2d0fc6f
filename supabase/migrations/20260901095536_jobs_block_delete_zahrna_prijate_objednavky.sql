-- Strážca mazania zákazky nepoznal prijaté objednávky: zákazka s prijatou
-- objednávkou sa dala zmazať a objednávke sa job_id ticho prepísalo na NULL.
create or replace function public.jobs_block_delete_with_documents()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if exists (select 1 from public.invoices          where job_id = old.id)
  or exists (select 1 from public.purchase_invoices where job_id = old.id)
  or exists (select 1 from public.stock_movements   where job_id = old.id)
  or exists (select 1 from public.trips             where job_id = old.id)
  or exists (select 1 from public.purchase_orders   where job_id = old.id)
  or exists (select 1 from public.sales_orders      where job_id = old.id)
  or exists (select 1 from public.quotes            where job_id = old.id) then
    raise exception 'Zákazka má naviazané doklady, zmazať sa nedá. Uzavrite ju.';
  end if;
  return old;
end $function$;
