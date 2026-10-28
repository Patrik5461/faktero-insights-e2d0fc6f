/*
  Vlastné stavy dokladov, číselník štítkov a komentár mimo účtovníctva.

  - `stavy_dokladov`: číselník firmy („Čaká na doklad od klienta",
    „Skontrolovať"…). Doklad (prijatá, bloček, vystavená) nesie `stav_id`.
    Je to pracovná značka kancelárie, nemá nič s `status` dokladu.
  - `stitky_firmy`: číselník štítkov na výber; samotné štítky ostávajú v poli
    `stitky` na doklade (ako doteraz pri prijatých a bločkoch) — pribudli
    vystaveným faktúram a iným dokladom.
  - `komentar`: poznámka pre ľudí vo firme, do účtovníctva (Pohoda, exporty)
    nejde nikdy. Účtovná poznámka ostáva v `int_poznamka`.

  Stav, štítky ani komentár nie sú v zozname zamknutých stĺpcov (odovzdanie do
  Pohody, uzávierka) — menia sa aj na odovzdanom doklade.
*/

create table public.stavy_dokladov (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nazov text not null check (char_length(btrim(nazov)) between 1 and 60),
  farba text not null default 'siva'
    check (farba in ('siva', 'modra', 'zelena', 'oranzova', 'cervena', 'fialova')),
  poradie integer not null default 0,
  aktivne boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, nazov)
);

create table public.stitky_firmy (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nazov text not null check (char_length(btrim(nazov)) between 1 and 40),
  farba text not null default 'siva'
    check (farba in ('siva', 'modra', 'zelena', 'oranzova', 'cervena', 'fialova')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, nazov)
);

create index stavy_dokladov_created_by_idx on public.stavy_dokladov (created_by);
create index stitky_firmy_created_by_idx on public.stitky_firmy (created_by);

-- Číselníky čítajú všetci členovia (aj rola len s faktúrami vidí stav), meniť ich smie, kto smie doklady.
do $$
declare
  _t text;
begin
  foreach _t in array array['stavy_dokladov', 'stitky_firmy'] loop
    execute format('alter table public.%I enable row level security', _t);
    execute format(
      'create policy "clenovia citaju" on public.%I for select to authenticated
         using (public.is_company_member(company_id, (select auth.uid())))', _t);
    execute format(
      'create policy "clenovia zakladaju" on public.%I for insert to authenticated
         with check (public.is_company_member(company_id, (select auth.uid()))
           and company_id = any ((select public.firmy_s_pravom(''doklady'', true))::uuid[]))', _t);
    execute format(
      'create policy "clenovia upravuju" on public.%I for update to authenticated
         using (public.is_company_member(company_id, (select auth.uid()))
           and company_id = any ((select public.firmy_s_pravom(''doklady'', true))::uuid[]))
         with check (public.is_company_member(company_id, (select auth.uid()))
           and company_id = any ((select public.firmy_s_pravom(''doklady'', true))::uuid[]))', _t);
    execute format(
      'create policy "clenovia mazu" on public.%I for delete to authenticated
         using (public.is_company_member(company_id, (select auth.uid()))
           and company_id = any ((select public.firmy_s_pravom(''doklady'', true))::uuid[]))', _t);
    execute format(
      'create policy "mfa ak je zapnute" on public.%I as restrictive for all to authenticated
         using ((select public.mfa_ok())) with check ((select public.mfa_ok()))', _t);
    execute format('revoke all on public.%I from anon, public', _t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', _t);
    execute format('grant all on public.%I to service_role', _t);
  end loop;
end $$;

-- Stav a komentár na dokladoch
alter table public.purchase_invoices
  add column if not exists stav_id uuid references public.stavy_dokladov(id) on delete set null,
  add column if not exists komentar text check (komentar is null or char_length(komentar) <= 1000);
alter table public.expense_documents
  add column if not exists stav_id uuid references public.stavy_dokladov(id) on delete set null,
  add column if not exists komentar text check (komentar is null or char_length(komentar) <= 1000);
alter table public.invoices
  add column if not exists stav_id uuid references public.stavy_dokladov(id) on delete set null,
  add column if not exists komentar text check (komentar is null or char_length(komentar) <= 1000),
  add column if not exists stitky text[] not null default '{}';
alter table public.other_documents
  add column if not exists stitky text[] not null default '{}';

alter table public.invoices drop constraint if exists invoices_stitky_max;
alter table public.invoices add constraint invoices_stitky_max check (cardinality(stitky) <= 5);
alter table public.other_documents drop constraint if exists other_documents_stitky_max;
alter table public.other_documents add constraint other_documents_stitky_max check (cardinality(stitky) <= 5);

create index if not exists purchase_invoices_stav_idx on public.purchase_invoices (stav_id) where stav_id is not null;
create index if not exists expense_documents_stav_idx on public.expense_documents (stav_id) where stav_id is not null;
create index if not exists invoices_stav_idx on public.invoices (stav_id) where stav_id is not null;

-- Stav musí patriť tej istej firme ako doklad (cudzí id by inak FK pustil).
create or replace function public.stav_dokladu_tej_istej_firmy()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.stav_id is not null and not exists (
    select 1 from public.stavy_dokladov s where s.id = new.stav_id and s.company_id = new.company_id
  ) then
    raise exception 'Stav dokladu patrí inej firme' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.stav_dokladu_tej_istej_firmy() from public, anon;

create trigger purchase_invoices_stav_firmy before insert or update of stav_id on public.purchase_invoices
  for each row execute function public.stav_dokladu_tej_istej_firmy();
create trigger expense_documents_stav_firmy before insert or update of stav_id on public.expense_documents
  for each row execute function public.stav_dokladu_tej_istej_firmy();
create trigger invoices_stav_firmy before insert or update of stav_id on public.invoices
  for each row execute function public.stav_dokladu_tej_istej_firmy();
