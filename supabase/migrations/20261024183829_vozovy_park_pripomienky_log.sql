-- Pripomienka (vozidlo × termín × dátum) ide e-mailom raz. Číta a píše len cron servisným kľúčom.
create table if not exists public.vehicle_reminder_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  kind text not null,
  due_date date not null,
  sent_at timestamptz not null default now(),
  unique (vehicle_id, kind, due_date)
);
alter table public.vehicle_reminder_log enable row level security;
revoke all on public.vehicle_reminder_log from public, anon, authenticated;
grant all on public.vehicle_reminder_log to service_role;
create policy "mfa ak je zapnute" on public.vehicle_reminder_log as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
