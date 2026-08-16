-- Kalendár prečítaný priamo zo zmluvy sa neprepočítava.
--
-- Keď firma nahrá splátkový kalendár od banky, jeho riadky sú záväzné — sú to
-- sumy, ktoré banka naozaj stiahne. Vlastný výpočet sa od nich vždy o pár
-- centov líši (iné zaokrúhľovanie, iný počet dní) a prepísať ich znamená
-- rozísť sa s predpisom. `schedule_source='zmluva'` prepočet vypína.
alter table public.financing_contracts
  add column if not exists schedule_source text not null default 'vypocet';

alter table public.financing_contracts
  drop constraint if exists financing_contracts_schedule_source_check;
alter table public.financing_contracts
  add constraint financing_contracts_schedule_source_check
  check (schedule_source in ('vypocet', 'zmluva'));

comment on column public.financing_contracts.schedule_source is
  'vypocet = kalendár dopočítava Faktero; zmluva = riadky sú prečítané z dokumentu a neprepisujú sa';

-- Úložisko na nahraté zmluvy a splátkové kalendáre.
insert into storage.buckets (id, name, public)
values ('financing-documents', 'financing-documents', false)
on conflict (id) do nothing;

drop policy if exists "members read financing documents" on storage.objects;
create policy "members read financing documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'financing-documents'
    and public.is_company_member((split_part(name, '/', 1))::uuid, auth.uid())
  );

drop policy if exists "members upload financing documents" on storage.objects;
create policy "members upload financing documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'financing-documents'
    and public.is_company_member((split_part(name, '/', 1))::uuid, auth.uid())
  );

drop policy if exists "members delete financing documents" on storage.objects;
create policy "members delete financing documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'financing-documents'
    and public.is_company_member((split_part(name, '/', 1))::uuid, auth.uid())
  );
