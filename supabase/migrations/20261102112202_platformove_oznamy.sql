-- Platformové oznamy: plánovaná aktualizácia (nasadenie) alebo krátka informácia
-- pre prihlásených používateľov webu. Zobrazuje ich OznamAktualizacie v AppShell.
--
-- NÁVRH — aplikuje Patrik ručne po kontrole (nie `supabase db push`, pozri
-- faktero-migracie-verzie-nesedia).
--
-- Tabuľka je platformová (nie dáta firmy), preto bez firmy_s_pravom():
--   - čítať smie prihlásený — oznamy pre všetkých (len_pre_user_id is null)
--     a tie, ktoré sú adresne preňho (E2E tok si vkladá oznam len pre QA účet,
--     aby ho klienti nevideli),
--   - zapisovať smie len platformový admin (is_platform_admin, od 8. 11. s aal2);
--     skript scripts/oznam-aktualizacie.mjs zapisuje servisným kľúčom,
--   - anon nič (ani nie je z PUBLIC zdedené — revoke z public).
-- Reštriktívna mfa_ok() ako na každej tabuľke (faktero-dvojfaktor).

create table if not exists public.platformove_oznamy (
  id uuid primary key default gen_random_uuid(),
  typ text not null default 'aktualizacia' check (typ in ('aktualizacia', 'info')),
  -- null = štandardný (preložený) text podľa typu, začiatku a trvania
  text text check (text is null or char_length(text) <= 500),
  zaciatok timestamptz not null,
  trvanie_min integer not null default 1 check (trvanie_min between 1 and 240),
  -- dokedy sa po skončení ešte ukazuje „Faktero je aktualizované“;
  -- null = koniec aktualizácie + 30 min (rozhoduje klient, oznam-aktualizacie.ts)
  plati_do timestamptz,
  aktivny boolean not null default true,
  len_pre_user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (plati_do is null or plati_do > zaciatok)
);

create index if not exists platformove_oznamy_aktivne_idx
  on public.platformove_oznamy (zaciatok desc) where aktivny;

alter table public.platformove_oznamy enable row level security;

drop policy if exists "prihlaseny cita svoje oznamy" on public.platformove_oznamy;
create policy "prihlaseny cita svoje oznamy" on public.platformove_oznamy
  for select to authenticated
  using (len_pre_user_id is null or len_pre_user_id = (select auth.uid()));

drop policy if exists "platform admin cita oznamy" on public.platformove_oznamy;
create policy "platform admin cita oznamy" on public.platformove_oznamy
  for select to authenticated
  using ((select public.is_platform_admin(auth.uid())));

drop policy if exists "platform admin zapisuje oznamy" on public.platformove_oznamy;
create policy "platform admin zapisuje oznamy" on public.platformove_oznamy
  for all to authenticated
  using ((select public.is_platform_admin(auth.uid())))
  with check ((select public.is_platform_admin(auth.uid())));

drop policy if exists "mfa ak je zapnute" on public.platformove_oznamy;
create policy "mfa ak je zapnute" on public.platformove_oznamy as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- Nová tabuľka práva nedostane sama (faktero-partneri-pas); anon nedostane nič.
revoke all on public.platformove_oznamy from anon, public;
grant select, insert, update, delete on public.platformove_oznamy to authenticated;
grant all on public.platformove_oznamy to service_role;

-- Overenie po aplikovaní (zvonku, nie z DB):
--   anon:  curl -s -o /dev/null -w '%{http_code}' "$URL/rest/v1/platformove_oznamy?select=id" -H "apikey: $ANON"
--          → 401 (alebo 403/permission denied), nie 200
--   bežný prihlásený: POST na platformove_oznamy → 403 / 42501
