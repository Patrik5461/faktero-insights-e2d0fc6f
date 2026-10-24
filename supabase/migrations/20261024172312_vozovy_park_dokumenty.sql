-- Dokumenty k vozidlu: technický preukaz, poistky, STK, zmluvy.
create table if not exists public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  druh text not null default 'ine' check (druh in ('tp1','tp2','pzp','havarijne','stk','ek','zmluva','faktura','ine')),
  nazov text not null,
  file_path text not null,
  file_mime text,
  file_size bigint,
  platne_do date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists vehicle_documents_vehicle_idx on public.vehicle_documents (vehicle_id);
create index if not exists vehicle_documents_company_idx on public.vehicle_documents (company_id);

alter table public.vehicle_documents enable row level security;
revoke all on public.vehicle_documents from public, anon;
grant select, insert, update, delete on public.vehicle_documents to authenticated;
grant all on public.vehicle_documents to service_role;

create policy "clen cita dokumenty vozidla" on public.vehicle_documents for select to authenticated
  using (public.is_company_member(company_id, (select auth.uid())));
create policy "clen pridava dokumenty vozidla" on public.vehicle_documents for insert to authenticated
  with check (public.is_company_member(company_id, (select auth.uid()))
    and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.company_id = vehicle_documents.company_id));
create policy "clen upravuje dokumenty vozidla" on public.vehicle_documents for update to authenticated
  using (public.is_company_member(company_id, (select auth.uid())))
  with check (public.is_company_member(company_id, (select auth.uid())));
create policy "clen maze dokumenty vozidla" on public.vehicle_documents for delete to authenticated
  using (public.is_company_member(company_id, (select auth.uid())));
create policy "mfa ak je zapnute" on public.vehicle_documents as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
select public.vlastny_pristup_politiky_na('vehicle_documents', 'company_id', 'jazdy');

insert into storage.buckets (id, name, public, file_size_limit)
values ('vehicle-docs', 'vehicle-docs', false, 20971520)
on conflict (id) do nothing;

create policy "members read vehicle docs" on storage.objects for select to authenticated
  using (bucket_id = 'vehicle-docs' and public.is_company_member((split_part(name, '/', 1))::uuid, auth.uid()));
create policy "members upload vehicle docs" on storage.objects for insert to authenticated
  with check (bucket_id = 'vehicle-docs' and public.is_company_member((split_part(name, '/', 1))::uuid, auth.uid()));
create policy "members delete vehicle docs" on storage.objects for delete to authenticated
  using (bucket_id = 'vehicle-docs' and public.is_company_member((split_part(name, '/', 1))::uuid, auth.uid()));
