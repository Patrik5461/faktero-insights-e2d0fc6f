-- Cudzie kľúče bez indexu. Pri dnešnom objeme to nikto nespozoruje, ale mazanie
-- rodičovského riadku prechádza celú tabuľku a to sa s dátami zhorší.
create index if not exists idx_cash_entries_export_job on public.cash_entries (export_job_id);
create index if not exists idx_feedback_company on public.feedback (company_id);
create index if not exists idx_feedback_user on public.feedback (user_id);
create index if not exists idx_financing_contracts_created_by on public.financing_contracts (created_by);
create index if not exists idx_inbox_addresses_user on public.inbox_addresses (user_id);
create index if not exists idx_invoice_number_reservations_created_by on public.invoice_number_reservations (created_by);
create index if not exists idx_invoice_number_reservations_invoice on public.invoice_number_reservations (invoice_id);
create index if not exists idx_trips_customer on public.trips (customer_id);

-- Partneri mali na čítanie dve povoľujúce politiky naraz: verejnú (aktívne
-- riadky) a administrátorskú, ktorá platila na všetky operácie vrátane SELECTu.
-- Postgres musí vyhodnotiť obe. Čítanie teda spájame do jednej politiky a
-- zápis rozpisujeme podľa operácií.
drop policy if exists partners_public_read on public.partners;
drop policy if exists partners_admin_write on public.partners;

create policy partners_read on public.partners
  for select
  using (active or public.is_platform_admin((select auth.uid())));

create policy partners_admin_insert on public.partners
  for insert to authenticated
  with check (public.is_platform_admin((select auth.uid())));

create policy partners_admin_update on public.partners
  for update to authenticated
  using (public.is_platform_admin((select auth.uid())))
  with check (public.is_platform_admin((select auth.uid())));

create policy partners_admin_delete on public.partners
  for delete to authenticated
  using (public.is_platform_admin((select auth.uid())));
