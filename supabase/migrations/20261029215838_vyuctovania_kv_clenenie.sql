-- Členenie kontrolného výkazu DPH na vyúčtovaní výdavkov — doplní sa dokladom
-- vo vyúčtovaní, ktoré ho ešte nemajú (rovnako ako predkontácia a členenie DPH).
alter table public.vyuctovania_vydavkov
  add column if not exists kv_clenenie text
  check (kv_clenenie is null or kv_clenenie = any (array['B1', 'B2', 'B3', 'C2', 'X']));
