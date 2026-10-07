-- Ťarchopis: opravná faktúra, ktorá základ dane zvyšuje (§ 25 zákona o DPH).
alter type public.invoice_type add value if not exists 'debit_note';

alter table public.number_series drop constraint if exists number_series_kind_check;
alter table public.number_series add constraint number_series_kind_check
  check (kind in ('invoice','proforma','credit_note','debit_note','advance_payment','quote','sales_order','purchase_order','cash','self_billing'));

create or replace function public.faktero_nazov_radu(_kind text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case _kind
           when 'invoice' then 'Faktúry'
           when 'credit_note' then 'Dobropisy'
           when 'debit_note' then 'Ťarchopisy'
           when 'proforma' then 'Zálohové faktúry'
           when 'advance_payment' then 'Doklady k prijatej platbe'
           when 'quote' then 'Cenové ponuky'
           when 'sales_order' then 'Prijaté objednávky'
           when 'purchase_order' then 'Objednávky u dodávateľa'
           when 'cash' then 'Pokladničné doklady'
           when 'self_billing' then 'Samofaktúry'
           else 'Doklady'
         end;
$function$;

-- Predvolená šablóna a druh radu: ťarchopis čísluje ako faktúra (ako dobropis).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.faktero_predvolena_sablona(uuid, text)'::regprocedure);
  if position('debit_note' in d) = 0 then
    d := replace(d, $r$when 'credit_note' then _zaklad$r$, $r$when 'credit_note' then _zaklad
           when 'debit_note' then _zaklad$r$);
    execute d;
  end if;
  d := pg_get_functiondef('public.faktero_next_invoice_number(uuid, date, text, uuid)'::regprocedure);
  if position('debit_note' in d) = 0 then
    d := replace(d, $r$WHEN 'credit_note' THEN 'credit_note'$r$, $r$WHEN 'credit_note' THEN 'credit_note'
                  WHEN 'debit_note' THEN 'debit_note'$r$);
    execute d;
  end if;
end $$;
