-- Modul Zamestnanci — personalistika bez výpočtu miezd.
-- Čisto aditívne: nové tabuľky, funkcie, kbelík a jeden nový stĺpec (príznak
-- modulu) na firmách. Nič z faktúr, číslovania ani PDF cache sa nemení.

-- ── Príznak modulu ─────────────────────────────────────────────────────────
alter table public.companies add column if not exists module_employees boolean not null default false;

-- ── Kľúč na šifrovanie rodného čísla a čísla OP ────────────────────────────
-- Náhodný kľúč vznikne v trezore pri migrácii; v texte migrácie ani v gite nie je.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'employee_pii_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'employee_pii_key',
      'Kľúč pre pgp_sym_encrypt rodného čísla a čísla OP zamestnancov');
  end if;
end $$;

create or replace function public.employee_pii_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'employee_pii_key' limit 1;
$$;
revoke all on function public.employee_pii_key() from public;
revoke all on function public.employee_pii_key() from anon, authenticated;

-- ── Zamestnanci ────────────────────────────────────────────────────────────
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  title_before text,
  title_after text,
  birth_date date,
  birth_place text,
  nationality text default 'SK',
  -- Šifrované cez pgcrypto; nikdy sa nečítajú priamo, len cez employee_get_pii.
  rodne_cislo_enc bytea,
  op_cislo_enc bytea,
  email text,
  phone text,
  street text,
  city text,
  zip text,
  country text default 'SK',
  iban text,
  health_insurer text,
  position text,
  department text,
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('active', 'ended')),
  sp_registered_at date,
  zp_registered_at date,
  medical_check_due date,
  bozp_training_due date,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists employees_company_idx on public.employees(company_id);

-- ── Zmluvy ─────────────────────────────────────────────────────────────────
create table if not exists public.employee_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind text not null check (kind in ('pracovna_zmluva', 'dovp', 'dopc', 'brigadnicka', 'ina')),
  number text,
  signed_at date,
  start_date date not null,
  end_date date,
  probation_end date,
  position text,
  workplace text,
  weekly_hours numeric(5, 2),
  salary numeric(12, 2),
  salary_period text check (salary_period in ('mesacne', 'hodinovo', 'odmena')),
  currency text not null default 'EUR',
  status text not null default 'active' check (status in ('draft', 'active', 'ended')),
  ended_at date,
  termination_reason text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists employee_contracts_company_idx on public.employee_contracts(company_id);
create index if not exists employee_contracts_employee_idx on public.employee_contracts(employee_id);

-- ── Dokumenty ──────────────────────────────────────────────────────────────
create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  contract_id uuid references public.employee_contracts(id) on delete set null,
  kind text not null default 'ine',
  title text not null,
  file_path text not null,
  file_mime text,
  file_size integer,
  template_key text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists employee_documents_company_idx on public.employee_documents(company_id);
create index if not exists employee_documents_employee_idx on public.employee_documents(employee_id);
create index if not exists employee_documents_contract_idx on public.employee_documents(contract_id);

-- ── Neprítomnosti ──────────────────────────────────────────────────────────
create table if not exists public.employee_absences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind text not null check (kind in ('dovolenka', 'pn', 'ocr', 'nahradne_volno', 'neplatene_volno', 'sviatok', 'ine')),
  date_from date not null,
  date_to date not null,
  days numeric(5, 1),
  hours numeric(6, 2),
  note text,
  created_at timestamptz not null default now(),
  check (date_to >= date_from)
);
create index if not exists employee_absences_company_idx on public.employee_absences(company_id);
create index if not exists employee_absences_employee_idx on public.employee_absences(employee_id, date_from);

-- ── Dochádzka ──────────────────────────────────────────────────────────────
create table if not exists public.employee_attendance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  time_from time,
  time_to time,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  hours numeric(5, 2),
  kind text not null default 'praca' check (kind in ('praca', 'home_office', 'sluzobna_cesta')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists employee_attendance_company_idx on public.employee_attendance(company_id, work_date);
create index if not exists employee_attendance_employee_idx on public.employee_attendance(employee_id, work_date);

-- ── Šablóny dokumentov (len úpravy firmy; predvolené texty sú v kóde) ──────
create table if not exists public.employee_doc_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null check (key in ('pracovna_zmluva', 'dovp', 'dopc', 'brigadnicka', 'vypoved', 'potvrdenie_prijmu')),
  title text not null,
  body text not null,
  updated_at timestamptz not null default now(),
  unique (company_id, key)
);

-- ── Audit prístupov k zamestnancom ─────────────────────────────────────────
create table if not exists public.employee_access_log (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  user_id uuid default auth.uid(),
  action text not null check (action in ('create', 'update', 'delete', 'view_detail', 'view_sensitive', 'update_sensitive', 'document', 'export')),
  created_at timestamptz not null default now()
);
create index if not exists employee_access_log_company_idx on public.employee_access_log(company_id, created_at desc);
create index if not exists employee_access_log_employee_idx on public.employee_access_log(employee_id);

-- ── Záznam odoslaných pripomienok (aby cron neposielal to isté každý deň) ──
create table if not exists public.employee_reminder_log (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind text not null,
  due_date date not null,
  sent_at timestamptz not null default now(),
  unique (employee_id, kind, due_date)
);

-- ── RLS: rovnako ako faktúry, podľa členstva vo firme ───────────────────────
do $$
declare t text;
begin
  foreach t in array array['employees', 'employee_contracts', 'employee_documents', 'employee_absences', 'employee_attendance', 'employee_doc_templates']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "Members read %1$s" on public.%1$I for select to authenticated using (is_company_member(company_id, (select auth.uid())))', t);
    execute format('create policy "Members insert %1$s" on public.%1$I for insert to authenticated with check (is_company_member(company_id, (select auth.uid())))', t);
    execute format('create policy "Members update %1$s" on public.%1$I for update to authenticated using (is_company_member(company_id, (select auth.uid()))) with check (is_company_member(company_id, (select auth.uid())))', t);
    execute format('create policy "Members delete %1$s" on public.%1$I for delete to authenticated using (is_company_member(company_id, (select auth.uid())))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Audit: členovia firmy ho smú čítať, zapisuje sa len cez spúšťače a funkcie.
alter table public.employee_access_log enable row level security;
create policy "Members read employee_access_log" on public.employee_access_log
  for select to authenticated using (is_company_member(company_id, (select auth.uid())));
grant select on public.employee_access_log to authenticated;
grant all on public.employee_access_log to service_role;

-- Pripomienky: len server (servisná rola); klient nemá čo čítať.
alter table public.employee_reminder_log enable row level security;
grant all on public.employee_reminder_log to service_role;

-- Šifrované stĺpce klient nedostane ani ako šifrovaný text.
-- (Samo o sebe nestačí — dokončené v 20260921172241.)
revoke select (rodne_cislo_enc, op_cislo_enc) on public.employees from authenticated;
revoke update (rodne_cislo_enc, op_cislo_enc) on public.employees from authenticated;
revoke insert (rodne_cislo_enc, op_cislo_enc) on public.employees from authenticated;

-- ── Integrita: podriadené záznamy patria do firmy zamestnanca ──────────────
create or replace function public.employee_child_company_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.employees e where e.id = new.employee_id and e.company_id = new.company_id) then
    raise exception 'Zamestnanec nepatrí do tejto firmy';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['employee_contracts', 'employee_documents', 'employee_absences', 'employee_attendance']
  loop
    execute format('create trigger %1$s_company_guard before insert or update of employee_id, company_id on public.%1$I for each row execute function public.employee_child_company_guard()', t);
  end loop;
end $$;

create or replace function public.employees_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger employees_touch before update on public.employees
  for each row execute function public.employees_touch_updated_at();
create trigger employee_contracts_touch before update on public.employee_contracts
  for each row execute function public.employees_touch_updated_at();

-- ── Audit zmien na zamestnancovi ───────────────────────────────────────────
create or replace function public.employees_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.employee_access_log (company_id, employee_id, user_id, action) values (new.company_id, new.id, auth.uid(), 'create');
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.employee_access_log (company_id, employee_id, user_id, action) values (new.company_id, new.id, auth.uid(), 'update');
    return new;
  else
    insert into public.employee_access_log (company_id, employee_id, user_id, action) values (old.company_id, null, auth.uid(), 'delete');
    return old;
  end if;
end;
$$;
create trigger employees_audit_trg after insert or update or delete on public.employees
  for each row execute function public.employees_audit();

-- ── Citlivé údaje: zápis, čítanie a záznam prístupu ────────────────────────
create or replace function public.employee_set_pii(_employee_id uuid, _rodne_cislo text, _op_cislo text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _company uuid;
  _kluc text := public.employee_pii_key();
begin
  select company_id into _company from public.employees where id = _employee_id;
  if _company is null or not public.is_company_member(_company, auth.uid()) then
    raise exception 'Zamestnanec nenájdený';
  end if;
  update public.employees set
    rodne_cislo_enc = case
      when _rodne_cislo is null then rodne_cislo_enc
      when btrim(_rodne_cislo) = '' then null
      else pgp_sym_encrypt(btrim(_rodne_cislo), _kluc) end,
    op_cislo_enc = case
      when _op_cislo is null then op_cislo_enc
      when btrim(_op_cislo) = '' then null
      else pgp_sym_encrypt(btrim(_op_cislo), _kluc) end
  where id = _employee_id;
  insert into public.employee_access_log (company_id, employee_id, user_id, action)
    values (_company, _employee_id, auth.uid(), 'update_sensitive');
end;
$$;

create or replace function public.employee_get_pii(_employee_id uuid)
returns table (rodne_cislo text, op_cislo text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _company uuid;
  _kluc text := public.employee_pii_key();
begin
  select company_id into _company from public.employees where id = _employee_id;
  if _company is null or not public.is_company_member(_company, auth.uid()) then
    raise exception 'Zamestnanec nenájdený';
  end if;
  insert into public.employee_access_log (company_id, employee_id, user_id, action)
    values (_company, _employee_id, auth.uid(), 'view_sensitive');
  return query
    select
      case when e.rodne_cislo_enc is null then null else pgp_sym_decrypt(e.rodne_cislo_enc, _kluc) end,
      case when e.op_cislo_enc is null then null else pgp_sym_decrypt(e.op_cislo_enc, _kluc) end
    from public.employees e where e.id = _employee_id;
end;
$$;

-- Či sú citlivé údaje vyplnené — bez odšifrovania, na zobrazenie v zozname karty.
create or replace function public.employee_pii_present(_employee_id uuid)
returns table (ma_rodne_cislo boolean, ma_op boolean)
language sql
stable
security definer
set search_path = public
as $$
  select e.rodne_cislo_enc is not null, e.op_cislo_enc is not null
  from public.employees e
  where e.id = _employee_id and public.is_company_member(e.company_id, auth.uid());
$$;

create or replace function public.employee_log_access(_employee_id uuid, _action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare _company uuid;
begin
  if _action not in ('view_detail', 'document', 'export') then
    raise exception 'Neznámy záznam';
  end if;
  select company_id into _company from public.employees where id = _employee_id;
  if _company is null or not public.is_company_member(_company, auth.uid()) then
    raise exception 'Zamestnanec nenájdený';
  end if;
  insert into public.employee_access_log (company_id, employee_id, user_id, action)
    values (_company, _employee_id, auth.uid(), _action);
end;
$$;

create or replace function public.employee_log_export(_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_company_member(_company_id, auth.uid()) then
    raise exception 'Firma nenájdená';
  end if;
  insert into public.employee_access_log (company_id, employee_id, user_id, action)
    values (_company_id, null, auth.uid(), 'export');
end;
$$;

-- Servisná rola (generovanie PDF s rodným číslom) — odšifruje bez auth.uid(),
-- ale záznam zapíše s používateľom, ktorý dokument vyrobil.
create or replace function public.employee_get_pii_service(_employee_id uuid, _user_id uuid)
returns table (rodne_cislo text, op_cislo text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _company uuid;
  _kluc text := public.employee_pii_key();
begin
  select company_id into _company from public.employees where id = _employee_id;
  if _company is null or not public.is_company_member(_company, _user_id) then
    raise exception 'Zamestnanec nenájdený';
  end if;
  insert into public.employee_access_log (company_id, employee_id, user_id, action)
    values (_company, _employee_id, _user_id, 'view_sensitive');
  return query
    select
      case when e.rodne_cislo_enc is null then null else pgp_sym_decrypt(e.rodne_cislo_enc, _kluc) end,
      case when e.op_cislo_enc is null then null else pgp_sym_decrypt(e.op_cislo_enc, _kluc) end
    from public.employees e where e.id = _employee_id;
end;
$$;

revoke all on function public.employee_set_pii(uuid, text, text) from public;
revoke all on function public.employee_get_pii(uuid) from public;
revoke all on function public.employee_pii_present(uuid) from public;
revoke all on function public.employee_log_access(uuid, text) from public;
revoke all on function public.employee_log_export(uuid) from public;
revoke all on function public.employee_get_pii_service(uuid, uuid) from public;
revoke all on function public.employee_set_pii(uuid, text, text) from anon;
revoke all on function public.employee_get_pii(uuid) from anon;
revoke all on function public.employee_pii_present(uuid) from anon;
revoke all on function public.employee_log_access(uuid, text) from anon;
revoke all on function public.employee_log_export(uuid) from anon;
revoke all on function public.employee_get_pii_service(uuid, uuid) from anon, authenticated;
grant execute on function public.employee_set_pii(uuid, text, text) to authenticated;
grant execute on function public.employee_get_pii(uuid) to authenticated;
grant execute on function public.employee_pii_present(uuid) to authenticated;
grant execute on function public.employee_log_access(uuid, text) to authenticated;
grant execute on function public.employee_log_export(uuid) to authenticated;
grant execute on function public.employee_get_pii_service(uuid, uuid) to service_role;
revoke all on function public.employee_child_company_guard() from public, anon, authenticated;
revoke all on function public.employees_audit() from public, anon, authenticated;

-- ── Súkromný kbelík na dokumenty zamestnancov ──────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('employee-docs', 'employee-docs', false, 20971520)
on conflict (id) do nothing;

create policy "members read employee docs" on storage.objects for select to authenticated
  using (bucket_id = 'employee-docs' and is_company_member((split_part(name, '/', 1))::uuid, auth.uid()));
create policy "members upload employee docs" on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-docs' and is_company_member((split_part(name, '/', 1))::uuid, auth.uid()));
create policy "members update employee docs" on storage.objects for update to authenticated
  using (bucket_id = 'employee-docs' and is_company_member((split_part(name, '/', 1))::uuid, auth.uid()));
create policy "members delete employee docs" on storage.objects for delete to authenticated
  using (bucket_id = 'employee-docs' and is_company_member((split_part(name, '/', 1))::uuid, auth.uid()));
