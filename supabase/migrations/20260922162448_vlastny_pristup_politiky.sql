-- Firmy, v ktorých má prihlásený človek právo na oblasť. Ostatné roly majú
-- všetko ako doteraz; pri „custom“ rozhoduje permissions->>oblasť.
-- Vracia pole, aby sa v politike vyhodnotilo raz za dotaz, nie za riadok.
create or replace function public.firmy_s_pravom(_oblast text, _zapis boolean)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(cu.company_id), '{}')
  from public.company_users cu
  where cu.user_id = auth.uid()
    and (
      cu.role::text <> 'custom'
      or (case when _zapis then cu.permissions ->> _oblast = 'edit'
               else cu.permissions ->> _oblast in ('read', 'edit') end)
      -- Odberatelia sú potrební aj pri faktúrach — kto smie faktúry, vidí aj ich.
      or (_oblast = 'kontakty' and (case when _zapis then cu.permissions ->> 'faktury' = 'edit'
               else cu.permissions ->> 'faktury' in ('read', 'edit') end))
    );
$$;
revoke all on function public.firmy_s_pravom(text, boolean) from public;
grant execute on function public.firmy_s_pravom(text, boolean) to authenticated, service_role;

-- Pomocník: štyri reštriktívne politiky (čítanie, zápis, úprava, mazanie)
-- pre tabuľku; `_firma` je výraz, ktorý vráti company_id riadku.
create or replace function public.vlastny_pristup_politiky_na(_tabulka text, _firma text, _oblast text)
returns void language plpgsql as $f$
begin
  execute format('drop policy if exists "oblast citanie" on public.%I', _tabulka);
  execute format('drop policy if exists "oblast zapis" on public.%I', _tabulka);
  execute format('drop policy if exists "oblast uprava" on public.%I', _tabulka);
  execute format('drop policy if exists "oblast mazanie" on public.%I', _tabulka);
  execute format('create policy "oblast citanie" on public.%I as restrictive for select to authenticated using (%s = any (((select public.firmy_s_pravom(%L, false)))::uuid[]))', _tabulka, _firma, _oblast);
  execute format('create policy "oblast zapis" on public.%I as restrictive for insert to authenticated with check (%s = any (((select public.firmy_s_pravom(%L, true)))::uuid[]))', _tabulka, _firma, _oblast);
  execute format('create policy "oblast uprava" on public.%I as restrictive for update to authenticated using (%s = any (((select public.firmy_s_pravom(%L, true)))::uuid[])) with check (%s = any (((select public.firmy_s_pravom(%L, true)))::uuid[]))', _tabulka, _firma, _oblast, _firma, _oblast);
  execute format('create policy "oblast mazanie" on public.%I as restrictive for delete to authenticated using (%s = any (((select public.firmy_s_pravom(%L, true)))::uuid[]))', _tabulka, _firma, _oblast);
end $f$;
revoke all on function public.vlastny_pristup_politiky_na(text, text, text) from public, authenticated, anon;

-- Reštriktívne politiky podľa oblastí. NOVÁ TABUĽKA oblasti ich musí dostať
-- v svojej migrácii (pozri pamäť faktero-vlastny-pristup).
do $$
declare
  mapa jsonb := jsonb_build_object(
    'faktury', array['invoices','invoice_email_logs','invoice_number_reservations','invoice_payment_links','invoice_reminders','quotes','quote_email_logs','recurring_invoices','recurring_invoice_logs','sales_orders','payments','efaktura_documents','efaktura_deliveries'],
    'doklady', array['purchase_invoices','expense_documents','inbox_messages','inbox_addresses','inbox_verifications','efaktura_received_documents'],
    'ostatne', array['other_documents','other_document_files'],
    'kontakty', array['customers'],
    'banka', array['bank_accounts','bank_connections','bank_payments','bank_statements','bank_transactions','financing_contracts','financing_installments'],
    'pokladna', array['cash_entries'],
    'sklad', array['products','product_prices','price_groups','price_actions','price_action_products','stock_items','stock_levels','stock_movements','stock_reservations','stock_transfers','stock_categories','stock_audit_logs','warehouses','inventory_counts','purchase_orders','delivery_parse_jobs'],
    'zakazky', array['jobs'],
    'jazdy', array['trips','vehicles','fuel_records','commander_connections','commander_sync_logs','commander_vehicle_links','tesla_connections','tesla_sync_logs','tesla_vehicle_links','tesla_vehicle_snapshots'],
    'zamestnanci', array['employees','employee_absences','employee_access_log','employee_attendance','employee_contracts','employee_doc_templates','employee_documents','employee_reminder_log'],
    'uctovnictvo', array['export_jobs','export_logs','pohoda_odoslane','import_jobs','import_logs']
  );
  deti jsonb := jsonb_build_array(
    jsonb_build_array('invoice_items','invoice_id','invoices','faktury'),
    jsonb_build_array('quote_items','quote_id','quotes','faktury'),
    jsonb_build_array('sales_order_items','sales_order_id','sales_orders','faktury'),
    jsonb_build_array('purchase_order_items','purchase_order_id','purchase_orders','sklad'),
    jsonb_build_array('inventory_count_items','inventory_count_id','inventory_counts','sklad'),
    jsonb_build_array('stock_transfer_items','transfer_id','stock_transfers','sklad')
  );
  oblast text; t text; d jsonb; firma text;
begin
  for oblast in select jsonb_object_keys(mapa) loop
    for t in select jsonb_array_elements_text(mapa -> oblast) loop
      perform public.vlastny_pristup_politiky_na(t, 'company_id', oblast);
    end loop;
  end loop;
  for d in select * from jsonb_array_elements(deti) loop
    firma := format('(select r.company_id from public.%I r where r.id = %I.%I)', d ->> 2, d ->> 0, d ->> 1);
    perform public.vlastny_pristup_politiky_na(d ->> 0, firma, d ->> 3);
  end loop;
end $$;
