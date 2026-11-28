-- Daňový kalendár (FAK-667): nastavenia firmy, ktoré Faktero inak nevie —
-- obdobie DPH, preddavky na daň z príjmov a DMV, odklad priznania,
-- nehnuteľnosť, výplatný deň, CZ poradca a zálohy.
alter table public.companies add column if not exists danovy_kalendar jsonb not null default '{}'::jsonb
  check (jsonb_typeof(danovy_kalendar) = 'object');
