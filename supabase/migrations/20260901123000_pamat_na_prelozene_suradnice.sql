-- Preklad súradníc na adresu stojí volanie do OpenRouteService a bezplatná
-- kvóta je obmedzená. Domov a firma sa v knihe jázd opakujú stále dokola, tak
-- si odpoveď pamätáme podľa zaokrúhlených súradníc (4 desatinné miesta ≈ 11 m).
create table if not exists public.geokod_cache (
  kluc text primary key,
  lat numeric not null,
  lon numeric not null,
  adresa text,
  created_at timestamptz not null default now()
);

-- Píše a číta výhradne server (adresy sa dopĺňajú v nočnej úlohe), takže
-- prihlásený používateľ sem nemá čo hľadať.
alter table public.geokod_cache enable row level security;
revoke all on public.geokod_cache from public, anon, authenticated;
grant select, insert, update, delete on public.geokod_cache to service_role;
