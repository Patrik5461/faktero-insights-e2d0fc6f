-- Číselník „Členenie kontrolného výkazu DPH“ (Pohoda ho nevie exportovať) a import
-- číselníkov zo screenshotu cez AI.
--  * druh 'kv_clenenie' — kod = skratka z Pohody (A1, A2CN, B1-0, C2B1-0, KN …),
--    popis = text, kategoria = typ („A1 Dodanie - Vydané faktúry“),
--  * zdroj 'obrazok' — záznam založený importom z obrázka,
--  * typ_dokladu 'vydane' / 'prijate' — smer pri členení DPH a KV (NULL = všetky);
--    'faktura' / 'blocek' ostávajú pre predkontácie.
-- Unikátny kľúč (company_id, druh, kod, agenda) ostáva — obrázok zakladá agenda ''.
-- Idempotentné: pri aplikovaní cez MCP súbor premenovať na skutočnú verziu.

alter table public.predkontacie drop constraint if exists predkontacie_druh_check;
alter table public.predkontacie add constraint predkontacie_druh_check
  check (druh = any (array[
    'predkontacia', 'clenenie_dph', 'stredisko', 'cinnost', 'ciselny_rad',
    'pokladna', 'zakazka', 'bankovy_ucet', 'kv_clenenie'
  ]));

alter table public.predkontacie drop constraint if exists predkontacie_zdroj_check;
alter table public.predkontacie add constraint predkontacie_zdroj_check
  check (zdroj = any (array['rucne', 'pohoda', 'subor', 'obrazok']));

alter table public.predkontacie drop constraint if exists predkontacie_typ_dokladu_check;
alter table public.predkontacie add constraint predkontacie_typ_dokladu_check
  check (typ_dokladu is null or typ_dokladu = any (array['faktura', 'blocek', 'vydane', 'prijate']));

comment on column public.predkontacie.typ_dokladu is
  'Predkontácia: faktura/blocek. Členenie DPH a KV: vydane/prijate. NULL = všetky.';
