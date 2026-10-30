/*
  WhatsApp — zákazníci píšu podpore cez WhatsApp Business Cloud API
  (číslo podpory +421 902 101 967), odpoveď podpory ide späť do WhatsAppu.

  - `podpora_poziadavky.whatsapp_chat_id`: požiadavka založená z WhatsAppu
    (odkaz na `whatsapp_chaty`, nie telefónne číslo — číslo nikdy nejde do
    stĺpca, ktorý číta administrácia cez `select *`).
  - `whatsapp_chaty`: konverzácia s jedným číslom. `wa_id` (číslo bez +) je
    osobný údaj a treba ho na odoslanie odpovede; `cislo_maska` sa zobrazuje.
    `posledna_od_zakaznika_at` určuje 24-hodinové okno zákazníckej služby,
    `nedorucene_od` = odpoveď podpory, ktorá mimo okna neodišla a pošle sa,
    keď zákazník znova napíše.
  - `whatsapp_kody`: jednorazové kódy na prepojenie s účtom (len hash).
  - `whatsapp_prijate`: spracované id správ od Meta — opakované doručenie
    sa nezdvojí.
  - `whatsapp_odoslane`: id odoslaných správ (wamid) → chat; stav „failed“
    z webhooku tak vie, ktorej konverzácie sa týka.
  - `whatsapp_strop` + `whatsapp_pusti`: stropy v klzavom okne (kľúč je hash
    čísla, nie číslo).
  - `whatsapp_stav`: jeden riadok — kedy Meta overila webhook, kedy prišla
    posledná podpísaná udalosť a posledná správa, posledná chyba odoslania.

  Všetko číta a píše len server servisným kľúčom. Spätne kompatibilné: starý
  kód nové stĺpce ani tabuľky nepozná a nič z nich nepotrebuje.
*/
alter table public.podpora_poziadavky drop constraint if exists podpora_poziadavky_zdroj_check;
alter table public.podpora_poziadavky add constraint podpora_poziadavky_zdroj_check
  check (zdroj = any (array['aplikacia', 'mobil', 'web', 'telegram', 'whatsapp']));

create table if not exists public.whatsapp_chaty (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null unique check (wa_id ~ '^[0-9]{6,20}$'),
  cislo_maska text not null,
  meno text,
  user_id uuid references auth.users(id) on delete set null,
  poziadavka_id uuid references public.podpora_poziadavky(id) on delete set null,
  posledna_od_zakaznika_at timestamptz,
  nedorucene_od timestamptz,
  posledna_chyba text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whatsapp_chaty_user_idx on public.whatsapp_chaty (user_id);
create index if not exists whatsapp_chaty_poziadavka_idx on public.whatsapp_chaty (poziadavka_id);

alter table public.podpora_poziadavky add column if not exists whatsapp_chat_id uuid
  references public.whatsapp_chaty(id) on delete set null;
create index if not exists podpora_poziadavky_whatsapp_idx
  on public.podpora_poziadavky (whatsapp_chat_id, created_at)
  where whatsapp_chat_id is not null;

create table if not exists public.whatsapp_kody (
  kod_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plati_do timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_kody_user_idx on public.whatsapp_kody (user_id);

create table if not exists public.whatsapp_prijate (
  message_id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_odoslane (
  wamid text primary key,
  chat_id uuid not null references public.whatsapp_chaty(id) on delete cascade,
  poziadavka_id uuid references public.podpora_poziadavky(id) on delete cascade,
  druh text not null default 'text' check (druh in ('text', 'sablona')),
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_odoslane_chat_idx on public.whatsapp_odoslane (chat_id);
create index if not exists whatsapp_odoslane_poziadavka_idx on public.whatsapp_odoslane (poziadavka_id);

create table if not exists public.whatsapp_stav (
  id smallint primary key default 1 check (id = 1),
  webhook_overeny_at timestamptz,
  posledna_udalost_at timestamptz,
  posledna_sprava_at timestamptz,
  posledna_chyba text,
  posledna_chyba_at timestamptz
);
insert into public.whatsapp_stav (id) values (1) on conflict (id) do nothing;

create table if not exists public.whatsapp_strop (
  id bigint generated always as identity primary key,
  kluc text not null,
  druh text not null,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_strop_druh_kluc_idx
  on public.whatsapp_strop (druh, kluc, created_at);

do $$
declare t text;
begin
  foreach t in array array['whatsapp_chaty', 'whatsapp_kody', 'whatsapp_prijate',
                           'whatsapp_odoslane', 'whatsapp_stav', 'whatsapp_strop'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "mfa ak je zapnute" on public.%I', t);
    execute format('create policy "mfa ak je zapnute" on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))', t);
    execute format('revoke all on public.%I from anon, authenticated, public', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Atomicky: zámok na (druh, kľúč), počet v okne, zápis. `true` = smie prejsť.
create or replace function public.whatsapp_pusti(
  _kluc text,
  _druh text,
  _max integer,
  _okno_sekund integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  _pocet integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('whatsapp_strop:' || _druh || ':' || _kluc, 0));
  select count(*) into _pocet
    from public.whatsapp_strop
   where druh = _druh and kluc = _kluc
     and created_at > now() - make_interval(secs => _okno_sekund);
  if _pocet >= _max then
    return false;
  end if;
  insert into public.whatsapp_strop (kluc, druh) values (_kluc, _druh);
  if random() < 0.01 then
    delete from public.whatsapp_strop where created_at < now() - interval '1 day';
  end if;
  return true;
end
$$;
revoke all on function public.whatsapp_pusti(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.whatsapp_pusti(text, text, integer, integer) to service_role;
