-- Prichádzajúce notifikácie od banky (Tatra banka Premium API).
--
-- Zámerne bez RLS policy a bez grantov pre anon/authenticated: obsah notifikácie
-- nie je údaj konkrétnej firmy a číta ho výhradne serverový kód cez service role,
-- ktorá RLS obchádza. Je to opak toho, čo sa stalo pri bank_connections, kde
-- authenticated dostal SELECT/UPDATE aj na tokeny.

create table if not exists public.bank_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'tatrabanka',
  path text not null,
  method text not null,
  headers jsonb,
  payload jsonb,
  raw_body text,
  source_ip text,
  processed boolean not null default false,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

comment on table public.bank_webhook_events is
  'Prichádzajúce notifikácie od banky. Číta a zapisuje výhradne service role — obsah nie je údaj konkrétnej firmy, preto tu nie sú žiadne RLS policy ani granty pre anon/authenticated.';

alter table public.bank_webhook_events enable row level security;

revoke all on public.bank_webhook_events from anon;
revoke all on public.bank_webhook_events from authenticated;

create index if not exists bank_webhook_events_created_idx
  on public.bank_webhook_events (created_at desc);

create index if not exists bank_webhook_events_unprocessed_idx
  on public.bank_webhook_events (created_at)
  where processed = false;
