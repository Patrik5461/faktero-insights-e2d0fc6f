-- Vozidlo musí patriť tej istej firme ako doklad.
create or replace function public.vozidlo_tej_istej_firmy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.vehicle_id is not null and not exists (
    select 1 from public.vehicles v where v.id = new.vehicle_id and v.company_id = new.company_id
  ) then
    raise exception 'Vozidlo nepatrí firme dokladu.';
  end if;
  return new;
end $$;
revoke all on function public.vozidlo_tej_istej_firmy() from public, anon, authenticated;

drop trigger if exists expense_documents_vozidlo on public.expense_documents;
create trigger expense_documents_vozidlo before insert or update of vehicle_id on public.expense_documents
  for each row execute function public.vozidlo_tej_istej_firmy();
drop trigger if exists purchase_invoices_vozidlo on public.purchase_invoices;
create trigger purchase_invoices_vozidlo before insert or update of vehicle_id on public.purchase_invoices
  for each row execute function public.vozidlo_tej_istej_firmy();
