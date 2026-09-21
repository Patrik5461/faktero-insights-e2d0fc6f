-- Ostatné doklady: listy, predpisy, exekúcie, zmluvy a ďalšie podklady pre
-- účtovníka, ktoré nie sú faktúra ani bloček. Rovnaký tok ako výdavkové
-- doklady: new (Nespracovaný) → processed (Spracovaný) → exported (Odovzdaný).
create table public.other_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null default 'ine' check (kind in (
    'exekucia', 'poistovna', 'danovy_urad', 'socialna_zdravotna',
    'zmluva', 'leasing_uver', 'uradny_list', 'ine'
  )),
  sender text,
  subject text,
  received_date date not null default current_date,
  amount numeric(14,2),
  currency text not null default 'EUR',
  due_date date,
  note text,
  status text not null default 'new' check (status in ('new', 'processed', 'exported')),
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null,
  exported_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index other_documents_company_idx on public.other_documents (company_id, received_date desc);
create index other_documents_company_new_idx on public.other_documents (company_id, created_at desc) where status = 'new';

create trigger other_documents_updated_at before update on public.other_documents
  for each row execute function public.set_updated_at();

create table public.other_document_files (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.other_documents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  path text not null,
  name text not null,
  mime text,
  size bigint,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index other_document_files_doc_idx on public.other_document_files (document_id, position);

alter table public.other_documents enable row level security;
alter table public.other_document_files enable row level security;

create policy "members read other documents" on public.other_documents
  for select to authenticated using (public.is_company_member(company_id, (select auth.uid())));
create policy "members insert other documents" on public.other_documents
  for insert to authenticated with check (public.is_company_member(company_id, (select auth.uid())));
create policy "members update other documents" on public.other_documents
  for update to authenticated using (public.is_company_member(company_id, (select auth.uid())))
  with check (public.is_company_member(company_id, (select auth.uid())));
create policy "admins delete other documents" on public.other_documents
  for delete to authenticated using (public.is_company_admin(company_id, (select auth.uid())));

-- Príloha musí patriť k dokladu tej istej firmy — inak by sa cudzí súbor dal
-- „prilepiť" k vlastnému dokladu.
create policy "members read other document files" on public.other_document_files
  for select to authenticated using (public.is_company_member(company_id, (select auth.uid())));
create policy "members insert other document files" on public.other_document_files
  for insert to authenticated with check (
    public.is_company_member(company_id, (select auth.uid()))
    and exists (select 1 from public.other_documents d where d.id = document_id and d.company_id = other_document_files.company_id)
    and split_part(path, '/', 1) = company_id::text
  );
create policy "members delete other document files" on public.other_document_files
  for delete to authenticated using (public.is_company_member(company_id, (select auth.uid())));

-- Nové tabuľky bez GRANT vracajú „permission denied", hoci politiky sedia.
grant select, insert, update, delete on public.other_documents to authenticated;
grant select, insert, delete on public.other_document_files to authenticated;
grant all on public.other_documents to service_role;
grant all on public.other_document_files to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('other-docs', 'other-docs', false, 20971520)
on conflict (id) do nothing;

create policy "members read other docs files" on storage.objects
  for select to authenticated
  using (bucket_id = 'other-docs' and public.is_company_member((split_part(name, '/', 1))::uuid, auth.uid()));
create policy "members upload other docs files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'other-docs' and public.is_company_member((split_part(name, '/', 1))::uuid, auth.uid()));
create policy "members delete other docs files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'other-docs' and public.is_company_member((split_part(name, '/', 1))::uuid, auth.uid()));
