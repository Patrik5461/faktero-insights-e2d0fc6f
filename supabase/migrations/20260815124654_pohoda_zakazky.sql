-- Zákazky (agenda `contract`) pre konektor do Pohody.
--
-- Na rozdiel od adresára a skladu nemá agenda `contract` v schéme `actionType`
-- ani `extId` — zákazku sa dá len založiť, nie aktualizovať. Preto ide každá
-- zákazka **práve raz** a evidencia sa neporovnáva s verziou, stačí, že záznam
-- existuje.

alter table public.pohoda_odoslane drop constraint if exists pohoda_odoslane_agenda_check;
alter table public.pohoda_odoslane
  add constraint pohoda_odoslane_agenda_check
  check (agenda in ('adresar', 'sklad', 'zakazka'));

alter table public.companies
  add column if not exists pohoda_posielat_zakazky boolean not null default false;

comment on column public.companies.pohoda_posielat_zakazky is
  'Posielať zákazky do Pohody a označovať nimi faktúry.';
