-- Identifikátor firmy u ePoštáka.
--
-- Bez neho sa nedá odoslať nič: ich API chce `X-Firm-Id` pri každom volaní
-- viazanom na firmu. Doteraz ho nemal kde vziať — kód ho čakal v metadátach,
-- ale žiadny stĺpec ho neukladal a nič ho od nich nezískalo.
alter table public.efaktura_profiles
  add column if not exists epostak_firm_id text;

comment on column public.efaktura_profiles.epostak_firm_id is
  'Id firmy u ePoštáka (hlavička X-Firm-Id). Páruje sa podľa IČO cez GET /api/v1/firms.';
