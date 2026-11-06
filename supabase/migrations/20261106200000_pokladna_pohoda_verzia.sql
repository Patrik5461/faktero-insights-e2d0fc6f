-- Pokladničný doklad sa dá vrátiť z Pohody (opraviť) ako faktúra či prijatý
-- doklad. Po vrátení ide do Pohody pod novým identifikátorom `id-verzia`
-- (`idDokladuPohody`), inak by ho kontrola duplicity v Pohode odmietla.
alter table public.cash_entries
  add column if not exists pohoda_verzia integer not null default 0;

comment on column public.cash_entries.pohoda_verzia is
  'Verzia opravy pre Pohodu — každé vrátenie z Pohody ju zvýši, doklad potom ide ako id-verzia.';
