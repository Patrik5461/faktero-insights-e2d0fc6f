-- Rola „Účtovník (read-only)" bola len nálepka: RLS pozerá na členstvo, nie na
-- rolu, takže pozvaný účtovník mohol zakladať aj mazať doklady ako majiteľ.
--
-- Namiesto prepisovania desiatok existujúcich politík pridávame k zápisovým
-- operáciám jednu obmedzujúcu (RESTRICTIVE) politiku na tabuľku — tá sa
-- s existujúcimi spája cez AND, takže čítanie ostáva nedotknuté a zmena sa dá
-- kedykoľvek vrátiť zmazaním týchto politík. Servisná rola (cron, webhooky,
-- párovanie platieb) RLS obchádza, takže na automatiku to nesiaha.

create or replace function public.is_company_writer(_company_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.company_users cu
     where cu.company_id = _company_id
       and cu.user_id = _user_id
       and cu.role <> 'accountant'
  );
$$;

revoke all on function public.is_company_writer(uuid, uuid) from public;
grant execute on function public.is_company_writer(uuid, uuid) to authenticated, service_role;

do $$
declare
  t text;
  -- Denníky, odvodené tabuľky a veci, ktoré si každý člen píše sám
  -- (prečítané upozornenia, rozhovory s asistentom, exporty pre účtovníka).
  vynimky text[] := array[
    'ai_actions','ai_conversations','api_logs','billing_events','billing_payments',
    'commander_sync_logs','company_lookup_logs','company_users','delivery_parse_jobs',
    'efaktura_interest_signups','export_jobs','export_logs','import_jobs','import_logs',
    'invoice_email_logs','notification_reads','platform_invoices','quote_email_logs',
    'recurring_invoice_logs','stock_audit_logs','stock_levels','subscriptions',
    'tesla_sync_logs','tesla_vehicle_snapshots','webhook_delivery_logs','webhook_logs',
    'company_invitations'
  ];
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relrowsecurity
       and not (c.relname = any (vynimky))
       and exists (
         select 1 from information_schema.columns col
          where col.table_schema = 'public'
            and col.table_name = c.relname
            and col.column_name = 'company_id'
       )
  loop
    execute format(
      'create policy "ucetnik nezapisuje" on public.%I as restrictive for insert to authenticated with check (public.is_company_writer(company_id, auth.uid()))', t);
    execute format(
      'create policy "ucetnik neupravuje" on public.%I as restrictive for update to authenticated using (public.is_company_writer(company_id, auth.uid()))', t);
    execute format(
      'create policy "ucetnik nemaze" on public.%I as restrictive for delete to authenticated using (public.is_company_writer(company_id, auth.uid()))', t);
  end loop;
end $$;
