-- Učenie z opráv pri prijatých dokladoch: čo človek pri dodávateľovi volil
-- (kategória, predkontácia, členenie DPH a KV, stredisko, činnosť, zákazka,
-- pri bločku spôsob úhrady). Pri ďalšom doklade od toho istého dodávateľa
-- sa to navrhne do prázdnych polí. Ručné pravidlá účtovania majú prednosť —
-- rieši to aplikácia (src/lib/faktero/ucenie-z-oprav*.ts), spúšťač pravidiel
-- sa nemení.
--
-- Jeden riadok na firmu, dodávateľa a druh dokladu. `polia` drží pre každé
-- pole posledných 10 volieb: {"predkontacia": [{"h": "1Fp", "t": "…", "d": "<id dokladu>"}], …}.
create table public.doklad_navyky (
  company_id uuid not null references public.companies(id) on delete cascade,
  -- „ico:12345678", „dph:SK2020…" alebo „nazov:…" (bez diakritiky a právnej formy).
  kluc_dodavatela text not null check (length(kluc_dodavatela) between 3 and 200),
  druh text not null check (druh in ('faktura', 'zalohova', 'dobropis', 'blocek')),
  nazov_dodavatela text,
  polia jsonb not null default '{}'::jsonb,
  pocet integer not null default 0,
  naposledy timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (company_id, kluc_dodavatela, druh)
);

alter table public.doklad_navyky enable row level security;
create policy "clenovia citaju navyky" on public.doklad_navyky for select to authenticated
  using (is_company_member(company_id, (select auth.uid())));
create policy "clenovia zakladaju navyky" on public.doklad_navyky for insert to authenticated
  with check (is_company_member(company_id, (select auth.uid())));
create policy "clenovia upravuju navyky" on public.doklad_navyky for update to authenticated
  using (is_company_member(company_id, (select auth.uid())))
  with check (is_company_member(company_id, (select auth.uid())));
create policy "clenovia mazu navyky" on public.doklad_navyky for delete to authenticated
  using (is_company_member(company_id, (select auth.uid())));
create policy "mfa ak je zapnute" on public.doklad_navyky as restrictive for all to authenticated
  using ((select mfa_ok())) with check ((select mfa_ok()));
create policy "oblast citanie" on public.doklad_navyky as restrictive for select to authenticated
  using (company_id = any ((select firmy_s_pravom('doklady', false))::uuid[]));
create policy "oblast zapis" on public.doklad_navyky as restrictive for insert to authenticated
  with check (company_id = any ((select firmy_s_pravom('doklady', true))::uuid[]));
create policy "oblast uprava" on public.doklad_navyky as restrictive for update to authenticated
  using (company_id = any ((select firmy_s_pravom('doklady', true))::uuid[]))
  with check (company_id = any ((select firmy_s_pravom('doklady', true))::uuid[]));
create policy "oblast mazanie" on public.doklad_navyky as restrictive for delete to authenticated
  using (company_id = any ((select firmy_s_pravom('doklady', true))::uuid[]));

grant select, insert, update, delete on public.doklad_navyky to authenticated;
grant all on public.doklad_navyky to service_role;
revoke all on public.doklad_navyky from anon;
