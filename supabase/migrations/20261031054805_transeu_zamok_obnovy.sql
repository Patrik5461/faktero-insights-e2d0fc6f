-- Trans.eu: zámok obnovy tokenu. Refresh token sa pri obnove točí, dve súbežné obnovy
-- (cron + klik, dve karty) by druhú skončili invalid_grant a napojenie by spadlo.
-- Obnovu robí len ten, kto si zámok zapíše; ostatní počkajú na nový token.
alter table public.transeu_napojenia add column if not exists obnova_zamok_do timestamptz;
comment on column public.transeu_napojenia.obnova_zamok_do is
  'Do kedy drží server zámok obnovy tokenu (súbežné obnovy by zneplatnili refresh token).';
