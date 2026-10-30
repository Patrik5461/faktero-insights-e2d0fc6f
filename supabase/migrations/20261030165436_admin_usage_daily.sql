/*
  Admin → Využitie zdrojov: denné odhady z logov Supabase (Management API, ClickHouse).

  Riadok za jeden deň v UTC zapisuje hook /api/public/hooks/zdroje-logy (cron v noci).
  egress_bytes je odhad: súčet hlavičky content-length odpovedí API brány (edge_logs)
  a za odpovede bez nej priemer odpovedí tej istej služby. Namerané a dopočítané
  časti sú uložené zvlášť. realtime_messages = počet riadkov realtime_logs,
  edge_invocations = počet riadkov function_edge_logs.

  Čítať a písať smie len server (service_role) — RLS bez politík pre klientov.
*/
create table if not exists public.admin_usage_daily (
  date date primary key,
  egress_bytes bigint not null default 0,
  realtime_messages bigint not null default 0,
  edge_invocations bigint not null default 0,
  -- súčet content-length tam, kde ho brána zapísala
  egress_measured_bytes bigint not null default 0,
  -- počet odpovedí API brány a koľko z nich nemalo content-length (komprimované/streamované)
  responses_total bigint not null default 0,
  responses_without_length bigint not null default 0,
  -- rozpis po službách (rest, storage, auth…) a cache stave, na kontrolu odhadu
  detail jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_usage_daily enable row level security;
revoke all on table public.admin_usage_daily from public, anon, authenticated;
grant all on table public.admin_usage_daily to service_role;
create policy "mfa ak je zapnute" on public.admin_usage_daily as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
