-- Dobropisy majú vlastný číselný rad s predponou D (Patrik 21. 11.).
--
-- Predvolená šablóna dobropisu bola rovnaká ako faktúry ({YYYY}{NNNN}), takže
-- dobropisy brali čísla z toho istého priestoru a faktúram „chýbali“ čísla
-- (SFC: faktúry 1, 2, 6 — dobropisy 3, 4, 5, 7, 8). Nový rad dobropisov dostane
-- predponu D, existujúce rady s rovnakou šablónou ako faktúry sa prepnú na D…
-- Už vystavené dobropisy sa neprečíslujú.

create table if not exists public.zaloha_rady_dobropisov_20261121 as
  select cn.* from public.number_series cn
  join public.number_series inv
    on inv.company_id = cn.company_id and inv.kind = 'invoice' and inv.is_default and inv.active
  where cn.kind = 'credit_note' and cn.format = inv.format;
revoke all on public.zaloha_rady_dobropisov_20261121 from public, anon, authenticated;

create or replace function public.faktero_predvolena_sablona(_company_id uuid, _kind text)
 returns text
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  _zaklad text;
begin
  select coalesce(nullif(btrim(invoice_number_format), ''), '{YYYY}{NNNN}')
    into _zaklad
    from public.companies
   where id = _company_id;
  _zaklad := coalesce(_zaklad, '{YYYY}{NNNN}');

  return case _kind
           when 'invoice' then _zaklad
           when 'credit_note' then 'D' || _zaklad
           when 'debit_note' then _zaklad
           when 'proforma' then 'ZF' || _zaklad
           when 'advance_payment' then 'DDP' || _zaklad
           when 'quote' then 'Q{YYYY}{NNNN}'
           when 'sales_order' then 'OBJ{YYYY}{NNNN}'
           when 'purchase_order' then 'OBJ{YYYY}{NNNN}'
           when 'cash' then 'PD{YYYY}{NNNN}'
           when 'self_billing' then 'SF{YYYY}{NNNN}'
           when 'financing' then 'SPL{YYYY}{NNNN}'
           else _zaklad
         end;
end;
$function$;

update public.number_series cn
   set format = 'D' || cn.format, start_from = 1, updated_at = now()
  from public.number_series inv
 where cn.kind = 'credit_note'
   and inv.company_id = cn.company_id and inv.kind = 'invoice' and inv.is_default and inv.active
   and cn.format = inv.format;
