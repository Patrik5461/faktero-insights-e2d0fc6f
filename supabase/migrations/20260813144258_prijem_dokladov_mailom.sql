-- Príjem dokladov e-mailom: každý používateľ má pre každú firmu vlastnú adresu na
-- podoméne doklady.faktero.sk. Preposlaný mail s PDF sa založí ako prijatá faktúra.

create table if not exists public.inbox_addresses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Časť adresy pred zavináčom, malými písmenami. Obsahuje náhodný chvost, aby sa
  -- nedala uhádnuť z názvu firmy.
  local_part text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_received_at timestamptz,
  unique (company_id, user_id)
);

create unique index if not exists inbox_addresses_local_part_key
  on public.inbox_addresses (lower(local_part));

comment on column public.inbox_addresses.local_part is
  'Časť adresy pred @, napr. maxiticket-k7f2p9. Celá adresa vzniká doplnením podomény.';

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  address_id uuid references public.inbox_addresses(id) on delete set null,
  provider_email_id text,
  from_email text,
  subject text,
  received_at timestamptz not null default now(),
  -- prijate | hotovo | bez_prilohy | chyba
  status text not null default 'prijate',
  detail text,
  attachment_count int not null default 0,
  created_invoice_ids uuid[] not null default '{}'
);

create index if not exists inbox_messages_company_idx
  on public.inbox_messages (company_id, received_at desc);
create index if not exists inbox_messages_address_idx
  on public.inbox_messages (address_id);

alter table public.inbox_addresses enable row level security;
alter table public.inbox_messages enable row level security;

-- Adresu vidí celá firma (nech je jasné, kto doklady posiela), ale meniť si ju môže
-- len jej vlastník.
create policy "Members read inbox addresses" on public.inbox_addresses
  for select to authenticated
  using (is_company_member(company_id, (select auth.uid())));

create policy "Owner creates inbox address" on public.inbox_addresses
  for insert to authenticated
  with check (user_id = (select auth.uid()) and is_company_member(company_id, (select auth.uid())));

create policy "Owner updates inbox address" on public.inbox_addresses
  for update to authenticated
  using (user_id = (select auth.uid()) and is_company_member(company_id, (select auth.uid())))
  with check (user_id = (select auth.uid()) and is_company_member(company_id, (select auth.uid())));

create policy "Owner deletes inbox address" on public.inbox_addresses
  for delete to authenticated
  using (user_id = (select auth.uid()) and is_company_member(company_id, (select auth.uid())));

-- Denník prijatých mailov je len na čítanie; zapisuje doňho server.
create policy "Members read inbox messages" on public.inbox_messages
  for select to authenticated
  using (is_company_member(company_id, (select auth.uid())));

grant select, insert, update, delete on public.inbox_addresses to authenticated;
grant select on public.inbox_messages to authenticated;
