-- Audit 2026-10-26: databázové nálezy.

-- 1) Číslovanie a prepočet skladu: relácia bez dokončeného 2FA (aal1) ich už nespustí.
--    Kontrola sa vloží hneď za BEGIN; servisný kľúč (auth.uid() prázdne) ide ďalej.
do $$
declare
  f record;
  def text;
begin
  for f in
    select p.oid from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('faktero_next_invoice_number','faktero_next_series_number',
                        'faktero_reserve_invoice_numbers','faktero_release_invoice_numbers',
                        'recompute_stock_avg_cost')
  loop
    def := pg_get_functiondef(f.oid);
    if position('mfa_required' in def) = 0 then
      def := regexp_replace(def, '\mbegin\M',
        'BEGIN IF auth.uid() IS NOT NULL AND NOT public.mfa_ok() THEN RAISE EXCEPTION ''mfa_required'' USING ERRCODE = ''42501''; END IF;',
        'i');
      execute def;
    end if;
  end loop;
end $$;

-- 2) Zoznam jednorazových domén: volá ho len server (servisný kľúč) a spúšťač na auth.users.
revoke execute on function public.je_blokovana_domena(text) from anon, authenticated, public;

-- 3) Rola v cudzej firme: len pre člena tej firmy (politiky volajú s vlastným auth.uid()).
create or replace function public.get_company_role(_company_id uuid, _user_id uuid)
 returns company_role
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select role from public.company_users
  where company_id = _company_id and user_id = _user_id
    and (auth.uid() is null or auth.uid() = _user_id or public.is_company_member(_company_id, auth.uid()))
  limit 1;
$function$;

-- 4) Politiky s auth.uid() vyhodnotené raz za dotaz, nie za riadok.
alter policy "clenovia firmy citaju" on public.vat_reports using (is_company_member(company_id, (select auth.uid())));
alter policy "clenovia firmy mazu" on public.vat_reports using (is_company_writer(company_id, (select auth.uid())));
alter policy "clenovia firmy upravuju" on public.vat_reports
  using (is_company_writer(company_id, (select auth.uid())))
  with check (is_company_writer(company_id, (select auth.uid())));
alter policy "clenovia firmy zapisuju" on public.vat_reports with check (is_company_writer(company_id, (select auth.uid())));
alter policy "clenovia firmy citaju" on public.vies_checks using (is_company_member(company_id, (select auth.uid())));
alter policy "clenovia firmy zapisuju" on public.vies_checks with check (is_company_writer(company_id, (select auth.uid())));
alter policy "platform_free_accounts_admin" on public.platform_free_accounts
  using (exists (select 1 from platform_admins pa where pa.user_id = (select auth.uid())))
  with check (exists (select 1 from platform_admins pa where pa.user_id = (select auth.uid())));

-- 5) Indexy na cudzích kľúčoch, ktoré sa filtrujú najčastejšie.
create index if not exists invoices_number_series_id_idx on public.invoices (number_series_id);
create index if not exists webhook_outbox_company_id_idx on public.webhook_outbox (company_id);
create index if not exists historia_dokladov_company_id_idx on public.historia_dokladov (company_id);
