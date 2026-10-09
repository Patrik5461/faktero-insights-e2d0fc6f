-- Vyúčtovanie výdavkov zamestnanca (ako v Doklado): súhrn bločkov a prijatých faktúr,
-- ktoré zamestnanec zaplatil zo zálohy, z vlastných peňazí alebo firemnou kartou.
create table public.vyuctovania_vydavkov (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nazov text not null,
  typ text not null check (typ in ('zaloha', 'vlastne', 'karta')),
  zamestnanec_id uuid references auth.users(id) on delete set null,
  zamestnanec_meno text,
  obdobie_od date,
  obdobie_do date,
  -- Poskytnutá záloha (pri type `zaloha`); výsledok = doklady − záloha.
  zaloha numeric(14,2) not null default 0,
  mena text not null default 'EUR',
  predkontacia text,
  clenenie_dph text,
  datum_uctovania date,
  poznamka text,
  stav text not null default 'otvorene' check (stav in ('otvorene', 'uzavrete')),
  vyplatene_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vyuctovania_vydavkov_firma on public.vyuctovania_vydavkov (company_id, created_at desc);

alter table public.expense_documents add column if not exists vyuctovanie_id uuid
  references public.vyuctovania_vydavkov(id) on delete set null;
alter table public.purchase_invoices add column if not exists vyuctovanie_id uuid
  references public.vyuctovania_vydavkov(id) on delete set null;
create index if not exists expense_documents_vyuctovanie on public.expense_documents (vyuctovanie_id) where vyuctovanie_id is not null;
create index if not exists purchase_invoices_vyuctovanie on public.purchase_invoices (vyuctovanie_id) where vyuctovanie_id is not null;

alter table public.vyuctovania_vydavkov enable row level security;
create policy "clenovia citaju vyuctovania" on public.vyuctovania_vydavkov for select
  using (is_company_member(company_id, (select auth.uid())));
create policy "clenovia zakladaju vyuctovania" on public.vyuctovania_vydavkov for insert
  with check (is_company_member(company_id, (select auth.uid())));
create policy "clenovia upravuju vyuctovania" on public.vyuctovania_vydavkov for update
  using (is_company_member(company_id, (select auth.uid())))
  with check (is_company_member(company_id, (select auth.uid())));
create policy "clenovia mazu vyuctovania" on public.vyuctovania_vydavkov for delete
  using (is_company_member(company_id, (select auth.uid())));
create policy "mfa ak je zapnute" on public.vyuctovania_vydavkov as restrictive for all
  using ((select mfa_ok())) with check ((select mfa_ok()));
create policy "oblast citanie" on public.vyuctovania_vydavkov as restrictive for select
  using (company_id = any ((select firmy_s_pravom('doklady', false))::uuid[]));
create policy "oblast zapis" on public.vyuctovania_vydavkov as restrictive for insert
  with check (company_id = any ((select firmy_s_pravom('doklady', true))::uuid[]));
create policy "oblast uprava" on public.vyuctovania_vydavkov as restrictive for update
  using (company_id = any ((select firmy_s_pravom('doklady', true))::uuid[]))
  with check (company_id = any ((select firmy_s_pravom('doklady', true))::uuid[]));
create policy "oblast mazanie" on public.vyuctovania_vydavkov as restrictive for delete
  using (company_id = any ((select firmy_s_pravom('doklady', true))::uuid[]));

grant select, insert, update, delete on public.vyuctovania_vydavkov to authenticated;
grant all on public.vyuctovania_vydavkov to service_role;
revoke all on public.vyuctovania_vydavkov from anon;
