-- „Uplatniť na doklady, ktoré už sú“ doplní aj neodovzdané prijaté faktúry.
create or replace function public.uplatni_pravidla_uctovania(_company uuid)
 returns integer
 language plpgsql
 set search_path to 'public'
as $function$
declare
  n integer;
  m integer;
begin
  -- Prázdna zmena `pravidlo_id` zobudí spúšťač; ten pravidlo vyhodnotí a zapíše.
  update public.expense_documents d
     set pravidlo_id = null
   where d.company_id = _company
     and d.pravidlo_id is null
     and d.exported_at is null
     and (public.faktero_pravidlo_pre_doklad(d.company_id, d.supplier_ico, d.supplier_name, d.payment_method)).id is not null;
  get diagnostics n = row_count;
  update public.purchase_invoices p
     set pravidlo_id = null
   where p.company_id = _company
     and p.pravidlo_id is null
     and p.exported_at is null
     and p.deleted_at is null
     and (public.faktero_pravidlo_pre_doklad(p.company_id, p.supplier_ico, p.supplier_name, p.payment_method)).id is not null;
  get diagnostics m = row_count;
  return n + m;
end;
$function$;
