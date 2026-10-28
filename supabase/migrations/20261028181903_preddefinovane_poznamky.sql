/*
  Preddefinované poznámky — číselník textov firmy na rýchle vloženie do
  poznámky dokladu (faktúra, prijatá faktúra, bloček, Nespracované).

  Doteraz to bolo holé pole textov v `companies.poznamky_sablony` bez názvu
  a bez určenia agendy. Riadky sa preberú sem; starý stĺpec ostáva, nič ho
  už nečíta. `agendy` prázdne = poznámka platí všade.
*/
create table public.preddefinovane_poznamky (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nazov text not null default '' check (char_length(nazov) <= 120),
  text text not null check (char_length(text) between 1 and 2000),
  agendy text[] not null default '{}'
    check (agendy <@ array['faktura', 'prijata_faktura', 'blocek', 'nespracovane']::text[]),
  poradie integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index preddefinovane_poznamky_firma_idx on public.preddefinovane_poznamky (company_id, poradie, created_at);

insert into public.preddefinovane_poznamky (company_id, nazov, text, poradie)
select c.id, left(p.t, 60), p.t, p.n::int
  from public.companies c, unnest(c.poznamky_sablony) with ordinality as p(t, n)
 where coalesce(trim(p.t), '') <> '';

alter table public.preddefinovane_poznamky enable row level security;

create policy "clenovia citaju poznamky" on public.preddefinovane_poznamky for select to authenticated
  using (is_company_member(company_id, (select auth.uid())));
create policy "clenovia zakladaju poznamky" on public.preddefinovane_poznamky for insert to authenticated
  with check (is_company_member(company_id, (select auth.uid())));
create policy "clenovia upravuju poznamky" on public.preddefinovane_poznamky for update to authenticated
  using (is_company_member(company_id, (select auth.uid())))
  with check (is_company_member(company_id, (select auth.uid())));
create policy "clenovia mazu poznamky" on public.preddefinovane_poznamky for delete to authenticated
  using (is_company_member(company_id, (select auth.uid())));
create policy "mfa ak je zapnute" on public.preddefinovane_poznamky as restrictive for all to authenticated
  using ((select mfa_ok())) with check ((select mfa_ok()));
-- Text poznámky patrí ku všetkým agendám — čítať ho smie, kto vidí aspoň faktúry alebo doklady.
create policy "oblast citanie" on public.preddefinovane_poznamky as restrictive for select to authenticated
  using (company_id = any ((select firmy_s_pravom('faktury', false))::uuid[])
      or company_id = any ((select firmy_s_pravom('doklady', false))::uuid[]));
create policy "oblast zapis" on public.preddefinovane_poznamky as restrictive for insert to authenticated
  with check (company_id = any ((select firmy_s_pravom('faktury', true))::uuid[])
      or company_id = any ((select firmy_s_pravom('doklady', true))::uuid[]));
create policy "oblast uprava" on public.preddefinovane_poznamky as restrictive for update to authenticated
  using (company_id = any ((select firmy_s_pravom('faktury', true))::uuid[])
      or company_id = any ((select firmy_s_pravom('doklady', true))::uuid[]));
create policy "oblast mazanie" on public.preddefinovane_poznamky as restrictive for delete to authenticated
  using (company_id = any ((select firmy_s_pravom('faktury', true))::uuid[])
      or company_id = any ((select firmy_s_pravom('doklady', true))::uuid[]));

revoke all on public.preddefinovane_poznamky from anon, public;
grant select, insert, update, delete on public.preddefinovane_poznamky to authenticated;
grant all on public.preddefinovane_poznamky to service_role;
