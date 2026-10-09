-- Doklad smie patriť len do vyúčtovania vlastnej firmy (cudzí kľúč firmu nestráži).
create or replace function public.faktero_vyuctovanie_rovnaka_firma()
 returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  if new.vyuctovanie_id is not null and not exists (
    select 1 from public.vyuctovania_vydavkov v where v.id = new.vyuctovanie_id and v.company_id = new.company_id
  ) then
    raise exception 'Vyúčtovanie patrí inej firme.' using errcode = '23514';
  end if;
  return new;
end;
$function$;
create trigger expense_documents_vyuctovanie_firma before insert or update of vyuctovanie_id on public.expense_documents
  for each row execute function public.faktero_vyuctovanie_rovnaka_firma();
create trigger purchase_invoices_vyuctovanie_firma before insert or update of vyuctovanie_id on public.purchase_invoices
  for each row execute function public.faktero_vyuctovanie_rovnaka_firma();
