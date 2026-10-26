/*
  Strážca automatického zaúčtovania (BEFORE UPDATE).
  - Človek (auth.uid() je známy), ktorý zaúčtuje alebo zmení kódy zaúčtovaného
    dokladu, ho robí ručným — automat ho potom už nikdy neprepíše.
  - Zrušenie zaúčtovania zmaže zdroj, ale doklad sa do fronty nevráti
    (inak by ho automat o minútu zaúčtoval znova).
  - Zmena údajov nezaúčtovaného dokladu (argumenty spúšťača) vráti doklad
    do fronty — návrh sa spočíta znova.
  Automat píše servisným kľúčom, auth.uid() je vtedy prázdne.
*/
create or replace function public.faktero_auto_uctovanie_strazca()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  _stare jsonb := to_jsonb(old);
  _nove jsonb := to_jsonb(new);
  _s text;
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.zauctovane_at is not null and (
       old.zauctovane_at is null
       or new.pohoda_predkontacia is distinct from old.pohoda_predkontacia
       or new.pohoda_clenenie_dph is distinct from old.pohoda_clenenie_dph
       or new.kv_clenenie is distinct from old.kv_clenenie) then
    new.zauctovanie_zdroj := 'manual';
    new.zauctovanie_istota := null;
  elsif new.zauctovane_at is null and old.zauctovane_at is not null then
    new.zauctovanie_zdroj := null;
    new.zauctovanie_istota := null;
  end if;
  if new.zauctovane_at is null and old.zauctovane_at is null then
    foreach _s in array tg_argv loop
      if (_stare -> _s) is distinct from (_nove -> _s) then
        new.auto_uctovanie_at := null;
        new.auto_uctovanie_navrh := null;
        exit;
      end if;
    end loop;
  end if;
  return new;
end
$function$;

drop trigger if exists purchase_invoices_auto_uctovanie on public.purchase_invoices;
create trigger purchase_invoices_auto_uctovanie before update on public.purchase_invoices
  for each row execute function public.faktero_auto_uctovanie_strazca(
    'supplier_ico','supplier_name','supplier_ic_dph','supplier_country','amount_total','amount_without_vat',
    'vat_amount','items','type','reverse_charge','reverse_charge_type','dph_rezim','eu_plnenie',
    'osobitna_uprava','odpocet','payment_method','status','intro_note');
drop trigger if exists expense_documents_auto_uctovanie on public.expense_documents;
create trigger expense_documents_auto_uctovanie before update on public.expense_documents
  for each row execute function public.faktero_auto_uctovanie_strazca(
    'supplier_ico','supplier_name','supplier_ic_dph','total_amount','net_amount','vat_amount',
    'vat_breakdown','items','payment_method','odpocet','status','category');
drop trigger if exists invoices_auto_uctovanie on public.invoices;
create trigger invoices_auto_uctovanie before update on public.invoices
  for each row execute function public.faktero_auto_uctovanie_strazca(
    'customer_ico','customer_name','customer_ic_dph','customer_country','total','subtotal','vat_total',
    'type','status','reverse_charge','reverse_charge_type','eu_plnenie','osobitna_uprava','oss_country');

-- História dokladu ukáže aj zdroj zaúčtovania (automat má prázdne „kto").
drop trigger if exists purchase_invoices_historia on public.purchase_invoices;
create trigger purchase_invoices_historia after insert or update on public.purchase_invoices
  for each row execute function zapis_historiu_dokladu('invoice_number', 'supplier_name', 'supplier_ico', 'supplier_iban', 'issue_date', 'delivery_date', 'due_date', 'amount_without_vat', 'vat_amount', 'amount_total', 'currency', 'variable_symbol', 'payment_method', 'status', 'pohoda_predkontacia', 'pohoda_clenenie_dph', 'kv_clenenie', 'stredisko', 'cinnost', 'job_id', 'category', 'note', 'zauctovane_at', 'zauctovanie_zdroj', 'exported_at', 'locked_at', 'deleted_at', 'stitky');
drop trigger if exists expense_documents_historia on public.expense_documents;
create trigger expense_documents_historia after insert or update on public.expense_documents
  for each row execute function zapis_historiu_dokladu('supplier_name', 'supplier_ico', 'document_number', 'issue_date', 'total_amount', 'vat_amount', 'net_amount', 'currency', 'payment_method', 'status', 'pohoda_predkontacia', 'pohoda_clenenie_dph', 'kv_clenenie', 'stredisko', 'cinnost', 'job_id', 'category', 'note', 'zauctovane_at', 'zauctovanie_zdroj', 'exported_at', 'locked_at', 'stitky');
drop trigger if exists invoices_historia on public.invoices;
create trigger invoices_historia after insert or update on public.invoices
  for each row execute function zapis_historiu_dokladu('invoice_number', 'type', 'issue_date', 'delivery_date', 'due_date', 'customer_name', 'customer_ico', 'customer_ic_dph', 'subtotal', 'vat_total', 'total', 'currency', 'exchange_rate', 'reverse_charge', 'variable_symbol', 'status', 'sent_at', 'paid_at', 'pohoda_predkontacia', 'pohoda_clenenie_dph', 'kv_clenenie', 'zauctovane_at', 'zauctovanie_zdroj', 'exported_at', 'deleted_at');
