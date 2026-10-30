/*
  Admin → Využitie zdrojov.

  admin_plan_limits: limity plánu Supabase Pro s cenami nad limit (USD) a dátumom,
  kedy ich niekto overil na https://supabase.com/pricing. Čítať ich smie len server
  (service_role) — nikto iný na tabuľku nemá práva, RLS bez politík.

  admin_zdroje_prehlad(): jedným volaním veľkosť databázy, top 10 tabuliek,
  úložisko podľa košov, MAU a počet používateľov, limity a kurz USD z ECB.
  Volá ju len server po overení platform admina.
*/
create table if not exists public.admin_plan_limits (
  kluc text primary key,
  plan text not null default 'pro',
  nazov text not null,
  -- 'bajty' alebo 'pocet'
  jednotka text not null check (jednotka in ('bajty', 'pocet')),
  zahrnute numeric not null,
  -- cena v USD za `za_mnozstvo` jednotiek nad limit (napr. 0.125 $ za 1 GB = 1073741824 B)
  cena_usd numeric,
  za_mnozstvo numeric not null default 1,
  poradie int not null default 0,
  poznamka text,
  zdroj text not null default 'https://supabase.com/pricing',
  overene date not null,
  updated_at timestamptz not null default now()
);

alter table public.admin_plan_limits enable row level security;
revoke all on table public.admin_plan_limits from public, anon, authenticated;
grant all on table public.admin_plan_limits to service_role;
-- Pre istotu aj reštriktívna 2FA politika ako na každej tabuľke (authenticated aj tak nemá práva).
create policy "mfa ak je zapnute" on public.admin_plan_limits as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

insert into public.admin_plan_limits (kluc, nazov, jednotka, zahrnute, cena_usd, za_mnozstvo, poradie, poznamka, overene) values
  ('db_disk', 'Disk databázy', 'bajty', 8::numeric * 1073741824, 0.125, 1073741824, 10, 'Pro: 8 GB disku na projekt, potom 0,125 $ za GB', date '2026-10-29'),
  ('storage', 'Úložisko súborov', 'bajty', 100::numeric * 1073741824, 0.0213, 1073741824, 20, 'Pro: 100 GB, potom 0,0213 $ za GB', date '2026-10-29'),
  ('egress', 'Egress (nekešovaný)', 'bajty', 250::numeric * 1073741824, 0.09, 1073741824, 30, 'Pro: 250 GB, potom 0,09 $ za GB', date '2026-10-29'),
  ('egress_cached', 'Egress (kešovaný)', 'bajty', 250::numeric * 1073741824, 0.03, 1073741824, 31, 'Pro: 250 GB, potom 0,03 $ za GB', date '2026-10-29'),
  ('mau', 'Aktívni používatelia (MAU)', 'pocet', 100000, 0.00325, 1, 40, 'Pro: 100 000 MAU, potom 0,00325 $ za MAU', date '2026-10-29'),
  ('edge_invocations', 'Volania edge funkcií', 'pocet', 2000000, 2, 1000000, 50, 'Pro: 2 milióny za mesiac, potom 2 $ za milión', date '2026-10-29'),
  ('realtime_connections', 'Realtime – súčasné pripojenia (špička)', 'pocet', 500, 10, 1000, 60, 'Pro: 500, potom 10 $ za 1 000', date '2026-10-29'),
  ('realtime_messages', 'Realtime – správy', 'pocet', 5000000, 2.5, 1000000, 61, 'Pro: 5 miliónov za mesiac, potom 2,50 $ za milión', date '2026-10-29')
on conflict (kluc) do nothing;

create or replace function public.admin_zdroje_prehlad()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'db_size_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'tables', (
      select coalesce(jsonb_agg(jsonb_build_object('schema', t.schema, 'table', t.tabulka, 'size_bytes', t.velkost) order by t.velkost desc), '[]'::jsonb)
      from (
        select n.nspname::text as schema, c.relname::text as tabulka, pg_catalog.pg_total_relation_size(c.oid) as velkost
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r', 'p', 'm')
          and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
        order by pg_catalog.pg_total_relation_size(c.oid) desc
        limit 10
      ) t
    ),
    'buckets', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', b.id,
        'files', coalesce(o.files, 0),
        'size_bytes', coalesce(o.size_bytes, 0),
        'docasny', (b.id = 'docasne' or b.id like '%-docasne')
      ) order by coalesce(o.size_bytes, 0) desc, b.id), '[]'::jsonb)
      from storage.buckets b
      left join (
        select bucket_id, count(*)::bigint as files, coalesce(sum((metadata->>'size')::bigint), 0)::bigint as size_bytes
        from storage.objects
        group by bucket_id
      ) o on o.bucket_id = b.id
    ),
    'auth', jsonb_build_object(
      'users_total', (select count(*) from auth.users),
      'mau', (select count(*) from auth.users where last_sign_in_at >= pg_catalog.date_trunc('month', pg_catalog.now())),
      'month_start', pg_catalog.date_trunc('month', pg_catalog.now())
    ),
    'limits', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'kluc', l.kluc, 'plan', l.plan, 'nazov', l.nazov, 'jednotka', l.jednotka,
        'zahrnute', l.zahrnute, 'cena_usd', l.cena_usd, 'za_mnozstvo', l.za_mnozstvo,
        'poznamka', l.poznamka, 'zdroj', l.zdroj, 'overene', l.overene
      ) order by l.poradie), '[]'::jsonb)
      from public.admin_plan_limits l
    ),
    'usd_kurz', (
      select jsonb_build_object('den', e.den, 'kurz', e.kurz)
      from public.exchange_rates e
      where e.mena = 'USD'
      order by e.den desc
      limit 1
    )
  );
$$;

revoke all on function public.admin_zdroje_prehlad() from public, anon, authenticated;
grant execute on function public.admin_zdroje_prehlad() to service_role;
