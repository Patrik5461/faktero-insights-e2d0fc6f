/*
  Telegram — režim skupiny. Bot je pridaný do jednej skupiny, kde účtovníci
  hlásia problémy; podpora (a Claude) si ich správy čítajú v Admin → Podpora
  → Telegram skupina.

  - `telegram_skupiny`: skupiny spárované platform adminom príkazom
    `/skupina <kód>` (kód z Admin → Podpora, účel `skupina`). Z neznámej ani
    vypnutej skupiny sa neukladá nič.
  - `telegram_skupiny_spravy`: správy zo spárovanej skupiny (text, prílohy
    v koši `podpora-prilohy` pod `telegram-skupina/`, úpravy cez
    edited_message) a označenie „vybavené“ s poznámkou.

  Skupina nikdy nezakladá požiadavky P-xxxx a bot do nej nepíše (okrem
  potvrdenia spárovania). Čítať smie len platform admin (RLS), zapisuje len
  server servisným kľúčom (webhook a administrácia po overení admina).
*/

-- Nový účel párovacieho kódu.
alter table public.telegram_kody drop constraint if exists telegram_kody_ucel_check;
alter table public.telegram_kody add constraint telegram_kody_ucel_check
  check (ucel = any (array['admin', 'zakaznik', 'skupina']));

create table if not exists public.telegram_skupiny (
  chat_id bigint primary key,
  nazov text,
  aktivna boolean not null default true,
  sparoval uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists telegram_skupiny_sparoval_idx on public.telegram_skupiny (sparoval);

create table if not exists public.telegram_skupiny_spravy (
  id uuid primary key default gen_random_uuid(),
  -- Pri prechode skupiny na supergroup Telegram zmení chat_id — prenesie sa kaskádou.
  chat_id bigint not null references public.telegram_skupiny(chat_id)
    on update cascade on delete cascade,
  message_id bigint not null,
  od_id bigint,
  od_meno text,
  od_username text,
  text text,
  prilohy jsonb not null default '[]'::jsonb,
  odpoved_na bigint,
  vybavene boolean not null default false,
  poznamka text,
  vybavene_at timestamptz,
  vybavil uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  upravene_at timestamptz,
  unique (chat_id, message_id)
);
create index if not exists telegram_skupiny_spravy_cas_idx
  on public.telegram_skupiny_spravy (chat_id, created_at desc);
create index if not exists telegram_skupiny_spravy_vybavil_idx
  on public.telegram_skupiny_spravy (vybavil);

do $$
declare t text;
begin
  foreach t in array array['telegram_skupiny', 'telegram_skupiny_spravy'] loop
    execute format('alter table public.%I enable row level security', t);
    -- Čítať smie len platform admin (is_platform_admin vyžaduje aal2).
    execute format('drop policy if exists "len platform admin cita" on public.%I', t);
    execute format('create policy "len platform admin cita" on public.%I for select to authenticated using ((select public.is_platform_admin((select auth.uid()))))', t);
    -- Dvojfaktor: nová tabuľka reštriktívnu politiku sama nedostane.
    execute format('drop policy if exists "mfa ak je zapnute" on public.%I', t);
    execute format('create policy "mfa ak je zapnute" on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))', t);
    -- Právo drží aj PUBLIC — odobrať všetkým a vrátiť adresne.
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
