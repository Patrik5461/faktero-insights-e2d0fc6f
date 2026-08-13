-- Trasa sa doteraz nahrala a zahodila — do knihy jázd sa dostali len kilometre.
-- Body sa ukladajú zakódované (Google polyline, presnosť 5 miest ≈ 1 meter),
-- surové JSON pole by pri hodinovej jazde zaberalo štvornásobok.
alter table public.trips
  add column if not exists route text;

comment on column public.trips.route is
  'Prejdená trasa ako zakódovaná polyline (presnosť 5); prázdne pri ručne zapísanej jazde';
