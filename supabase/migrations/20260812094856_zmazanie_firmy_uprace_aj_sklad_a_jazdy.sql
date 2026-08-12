-- Zmazanie firmy padalo na cudzích kľúčoch s RESTRICT: inventúrne položky,
-- skladové pohyby, presuny, tankovania a jazdy zámerne držia svoje karty
-- (skladovú kartu s pohybmi ani vozidlo s jazdami zmazať netreba vedieť).
-- Pri rušení celej firmy to však znamenalo, že sa nezmaže vôbec nič.
-- Preto ich `faktero_zmaz_firmu` odpratá sama, v poradí od najhlbších.
create or replace function public.faktero_zmaz_firmu(_company_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  PERFORM set_config('faktero.mazanie_firmy', 'on', true);

  DELETE FROM public.inventory_count_items
   WHERE inventory_count_id IN (
     SELECT id FROM public.inventory_counts WHERE company_id = _company_id
   );
  DELETE FROM public.inventory_counts WHERE company_id = _company_id;

  DELETE FROM public.stock_transfer_items
   WHERE transfer_id IN (
     SELECT id FROM public.stock_transfers
      WHERE company_id = _company_id OR target_company_id = _company_id
   );
  DELETE FROM public.stock_transfers
   WHERE company_id = _company_id OR target_company_id = _company_id;

  DELETE FROM public.stock_movements WHERE company_id = _company_id;

  DELETE FROM public.fuel_records WHERE company_id = _company_id;
  DELETE FROM public.trips WHERE company_id = _company_id;

  DELETE FROM public.companies WHERE id = _company_id;

  PERFORM set_config('faktero.mazanie_firmy', 'off', true);
END
$function$;

revoke all on function public.faktero_zmaz_firmu(uuid) from public;
grant execute on function public.faktero_zmaz_firmu(uuid) to service_role;
