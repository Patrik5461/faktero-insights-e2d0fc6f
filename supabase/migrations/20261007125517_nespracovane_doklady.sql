-- Nespracované doklady (ako v Doklado): všetko nahraté čaká tu, kým ho človek
-- nezaradí (prijatá, zálohová, dobropis, bloček, iný doklad) a nezaúčtuje.
create table public.nespracovane_doklady (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  zdroj text not null default 'nahratie'
    check (zdroj in ('mail','nahratie','skener','apka','efaktura','import')),
  stav text not null default 'cita' check (stav in ('cita','vytazene','chyba')),
  druh text check (druh in ('faktura','zalohova','dobropis','blocek','ostatny')),
  file_path text,
  file_name text,
  file_mime text,
  file_size bigint,
  ai jsonb,
  udaje jsonb not null default '{}'::jsonb,
  chyba text,
  inbox_message_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index nespracovane_doklady_firma on public.nespracovane_doklady (company_id, created_at desc);

alter table public.nespracovane_doklady enable row level security;
create policy "clenovia citaju" on public.nespracovane_doklady for select to authenticated
  using (is_company_member(company_id, (select auth.uid())));
create policy "clenovia zapisuju" on public.nespracovane_doklady for insert to authenticated
  with check (is_company_member(company_id, (select auth.uid())));
create policy "clenovia upravuju" on public.nespracovane_doklady for update to authenticated
  using (is_company_member(company_id, (select auth.uid())))
  with check (is_company_member(company_id, (select auth.uid())));
create policy "clenovia mazu" on public.nespracovane_doklady for delete to authenticated
  using (is_company_member(company_id, (select auth.uid())));
create policy "mfa ak je zapnute" on public.nespracovane_doklady as restrictive for all to authenticated
  using ((select mfa_ok())) with check ((select mfa_ok()));
select public.vlastny_pristup_politiky_na('nespracovane_doklady', 'company_id', 'doklady');
revoke all on public.nespracovane_doklady from public, anon;
grant select, insert, update, delete on public.nespracovane_doklady to authenticated;
grant all on public.nespracovane_doklady to service_role;

-- Súbory nespracovaných dokladov; cesta začína id firmy.
insert into storage.buckets (id, name, public, file_size_limit)
values ('nespracovane', 'nespracovane', false, 15728640)
on conflict (id) do nothing;
create policy "members read nespracovane" on storage.objects for select to authenticated
  using (bucket_id = 'nespracovane' and is_company_member((split_part(name, '/', 1))::uuid, auth.uid()));
create policy "members upload nespracovane" on storage.objects for insert to authenticated
  with check (bucket_id = 'nespracovane' and is_company_member((split_part(name, '/', 1))::uuid, auth.uid()));
create policy "members delete nespracovane" on storage.objects for delete to authenticated
  using (bucket_id = 'nespracovane' and is_company_member((split_part(name, '/', 1))::uuid, auth.uid()));

-- Kôš unesie aj nespracovaný doklad.
alter table public.kos_dokladov drop constraint if exists kos_dokladov_druh_check;
alter table public.kos_dokladov add constraint kos_dokladov_druh_check check (druh in ('doklad','nespracovany'));
