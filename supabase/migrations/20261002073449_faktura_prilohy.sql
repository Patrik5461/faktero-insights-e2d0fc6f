-- Prílohy k vydanému dokladu: dodací list, zmluva, výkaz prác, fotka —
-- čokoľvek, čo patrí k faktúre a má s ňou odísť zákazníkovi. Doklado to má
-- rovnako: súbory visia na doklade a pri odoslaní mailom sa dá zaškrtnúť,
-- že majú ísť spolu s faktúrou.
create table public.invoice_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  path text not null,
  name text not null,
  mime text,
  size bigint,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index invoice_attachments_invoice_idx
  on public.invoice_attachments (invoice_id, created_at);
create index invoice_attachments_company_idx
  on public.invoice_attachments (company_id);

alter table public.invoice_attachments enable row level security;

create policy "members read invoice attachments" on public.invoice_attachments
  for select to authenticated
  using (public.is_company_member(company_id, (select auth.uid())));

-- Príloha musí visieť na doklade tej istej firmy a ležať v jej priečinku,
-- inak by sa dal cudzí súbor „prilepiť" k vlastnej faktúre.
create policy "members insert invoice attachments" on public.invoice_attachments
  for insert to authenticated
  with check (
    public.is_company_member(company_id, (select auth.uid()))
    and exists (
      select 1 from public.invoices i
       where i.id = invoice_id and i.company_id = invoice_attachments.company_id
    )
    and split_part(path, '/', 1) = company_id::text
  );

create policy "members delete invoice attachments" on public.invoice_attachments
  for delete to authenticated
  using (public.is_company_member(company_id, (select auth.uid())));

-- Dvojfaktor: nová tabuľka reštriktívnu politiku sama nedostane.
create policy "mfa ak je zapnute" on public.invoice_attachments
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- Vlastný prístup: príloha faktúry patrí do oblasti „faktury".
select public.vlastny_pristup_politiky_na('invoice_attachments', 'company_id', 'faktury');

-- Bez GRANT vracia tabuľka „permission denied", hoci politiky sedia.
grant select, insert, delete on public.invoice_attachments to authenticated;
grant all on public.invoice_attachments to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('invoice-attachments', 'invoice-attachments', false, 15728640)
on conflict (id) do nothing;

create policy "members read invoice attachment files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'invoice-attachments'
    and public.is_company_member((split_part(name, '/', 1))::uuid, auth.uid())
  );
create policy "members upload invoice attachment files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'invoice-attachments'
    and public.is_company_member((split_part(name, '/', 1))::uuid, auth.uid())
  );
create policy "members delete invoice attachment files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'invoice-attachments'
    and public.is_company_member((split_part(name, '/', 1))::uuid, auth.uid())
  );
