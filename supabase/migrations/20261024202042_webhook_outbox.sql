-- Fronta webhookov, ktoré vznikajú v databáze: faktúra uhradená (z ktoréhokoľvek miesta —
-- párovanie s bankou, hromadné označenie, API, detail) a nový bankový pohyb.
-- Doručuje ju cron každú minútu (/api/public/hooks/webhook-outbox).
create table if not exists public.webhook_outbox (
  id bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  event text not null,
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  error text
);
create index if not exists webhook_outbox_cakajuce_idx on public.webhook_outbox (id) where processed_at is null;
alter table public.webhook_outbox enable row level security;
revoke all on public.webhook_outbox from public, anon, authenticated;
grant all on public.webhook_outbox to service_role;
grant usage, select on sequence public.webhook_outbox_id_seq to service_role;
create policy "mfa ak je zapnute" on public.webhook_outbox as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
