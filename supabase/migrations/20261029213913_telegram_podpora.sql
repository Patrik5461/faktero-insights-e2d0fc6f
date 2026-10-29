/*
  Telegram — zákazníci píšu podpore cez bota a podpora dostáva upozornenia.

  - `podpora_poziadavky.telegram_chat_id`: požiadavka založená z Telegramu;
    odpoveď podpory sa pošle aj do tohto chatu.
  - `telegram_chaty`: chat zákazníka — kto to je (meno a username z Telegramu,
    voliteľne prepojený účet) a posledná otvorená požiadavka (vlákno).
  - `telegram_admin_chaty`: chat spárovaný s účtom platform admina cez
    jednorazový kód. Len z neho sa dá odpovedať a schvaľovať.
  - `telegram_kody`: jednorazové párovacie kódy (len hash, krátka platnosť).
  - `telegram_spravy_bota`: ktorá správa bota v admin chate patrí ku ktorej
    požiadavke / návrhu opravy — Reply a tlačidlá sa viažu na id v DB.
  - `telegram_updaty`: spracované update_id — opakované doručenie sa nezdvojí.

  Všetko číta a píše len server servisným kľúčom.
*/
alter table public.podpora_poziadavky drop constraint if exists podpora_poziadavky_zdroj_check;
alter table public.podpora_poziadavky add constraint podpora_poziadavky_zdroj_check
  check (zdroj = any (array['aplikacia', 'mobil', 'web', 'telegram']));
alter table public.podpora_poziadavky add column if not exists telegram_chat_id bigint;
create index if not exists podpora_poziadavky_telegram_idx
  on public.podpora_poziadavky (telegram_chat_id, created_at)
  where telegram_chat_id is not null;

create table if not exists public.telegram_chaty (
  chat_id bigint primary key,
  user_id uuid references auth.users(id) on delete set null,
  meno text,
  username text,
  poziadavka_id uuid references public.podpora_poziadavky(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists telegram_chaty_user_idx on public.telegram_chaty (user_id);
create index if not exists telegram_chaty_poziadavka_idx on public.telegram_chaty (poziadavka_id);

create table if not exists public.telegram_admin_chaty (
  chat_id bigint primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  meno text,
  username text,
  created_at timestamptz not null default now()
);
create index if not exists telegram_admin_chaty_user_idx on public.telegram_admin_chaty (user_id);

create table if not exists public.telegram_kody (
  kod_hash text primary key,
  ucel text not null check (ucel in ('admin', 'zakaznik')),
  user_id uuid not null references auth.users(id) on delete cascade,
  plati_do timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists telegram_kody_user_idx on public.telegram_kody (user_id);

create table if not exists public.telegram_spravy_bota (
  chat_id bigint not null,
  message_id bigint not null,
  poziadavka_id uuid references public.podpora_poziadavky(id) on delete cascade,
  auto_oprava_id uuid references public.podpora_auto_opravy(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (chat_id, message_id)
);
create index if not exists telegram_spravy_bota_poziadavka_idx on public.telegram_spravy_bota (poziadavka_id);
create index if not exists telegram_spravy_bota_oprava_idx on public.telegram_spravy_bota (auto_oprava_id);

create table if not exists public.telegram_updaty (
  update_id bigint primary key,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['telegram_chaty', 'telegram_admin_chaty', 'telegram_kody',
                           'telegram_spravy_bota', 'telegram_updaty'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "mfa ak je zapnute" on public.%I', t);
    execute format('create policy "mfa ak je zapnute" on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))', t);
    execute format('revoke all on public.%I from anon, authenticated, public', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
