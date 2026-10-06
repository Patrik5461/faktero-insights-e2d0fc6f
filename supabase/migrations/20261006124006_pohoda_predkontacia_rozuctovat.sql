-- Predkontácia hlavičky rozúčtovaného dokladu ("Rozúčtovať" v Pohode); kódy nesú položky.
alter table public.companies add column if not exists pohoda_predkontacia_rozuctovat text;
