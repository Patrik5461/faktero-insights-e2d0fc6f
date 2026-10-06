-- Povolení odosielatelia e-mailovej brány (adresy alebo @domény); prázdne = ktokoľvek.
alter table public.companies
  add column if not exists mail_povoleni_odosielatelia text[] not null default '{}',
  -- Preddefinované poznámky k dokladom (ako v Doklado).
  add column if not exists poznamky_sablony text[] not null default '{}';

-- Komentáre k dokladom s upozornením kolegu.
create table if not exists public.komentare_dokladov (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agenda text not null check (agenda in ('doklad', 'prijata', 'vystavena')),
  doklad_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null check (btrim(text) <> '' and length(text) <= 2000),
  upozornit uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists komentare_dokladov_doklad on public.komentare_dokladov (agenda, doklad_id, created_at);
create index if not exists komentare_dokladov_firma on public.komentare_dokladov (company_id, created_at desc);
create index if not exists komentare_dokladov_user on public.komentare_dokladov (user_id);

alter table public.komentare_dokladov enable row level security;
create policy "clenovia citaju komentare" on public.komentare_dokladov
  for select to authenticated using (public.is_company_member(company_id, (select auth.uid())));
create policy "clen pise za seba" on public.komentare_dokladov
  for insert to authenticated
  with check (public.is_company_member(company_id, (select auth.uid())) and user_id = (select auth.uid()));
create policy "autor maze svoj komentar" on public.komentare_dokladov
  for delete to authenticated using (user_id = (select auth.uid()));
create policy "mfa ak je zapnute" on public.komentare_dokladov
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
select public.vlastny_pristup_politiky_na('komentare_dokladov', 'company_id', 'doklady');
revoke all on public.komentare_dokladov from public, anon;
grant select, insert, delete on public.komentare_dokladov to authenticated;
grant all on public.komentare_dokladov to service_role;
