-- Položky dokladov nemajú company_id — firma sa im číta z hlavičky. Bez toho
-- by účtovník síce nevedel založiť faktúru, ale vedel by prepísať položky
-- existujúcej.
do $$
declare
  r record;
  vyraz text;
begin
  for r in
    select * from (values
      ('invoice_items','invoice_id','invoices'),
      ('quote_items','quote_id','quotes'),
      ('purchase_order_items','purchase_order_id','purchase_orders'),
      ('sales_order_items','sales_order_id','sales_orders'),
      ('stock_transfer_items','transfer_id','stock_transfers'),
      ('inventory_count_items','inventory_count_id','inventory_counts')
    ) as t(tabulka, stlpec, rodic)
  loop
    vyraz := format(
      'exists (select 1 from public.%I p where p.id = %I.%I and public.is_company_writer(p.company_id, auth.uid()))',
      r.rodic, r.tabulka, r.stlpec);
    execute format('create policy "ucetnik nezapisuje" on public.%I as restrictive for insert to authenticated with check (%s)', r.tabulka, vyraz);
    execute format('create policy "ucetnik neupravuje" on public.%I as restrictive for update to authenticated using (%s)', r.tabulka, vyraz);
    execute format('create policy "ucetnik nemaze" on public.%I as restrictive for delete to authenticated using (%s)', r.tabulka, vyraz);
  end loop;
end $$;
