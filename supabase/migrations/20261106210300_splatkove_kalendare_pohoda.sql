-- B2-1 Splátkové kalendáre: poistenie v splátke, zaúčtovanie do Pohody
-- (agenda Ostatné záväzky) nastavené raz na kalendári a prepísateľné na splátke,
-- a stav exportu splátky.
--
-- Kalendár (financing_contracts): predkontácia, členenie DPH, členenie KV DPH
-- a číselný rad Ostatných záväzkov platia pre všetky splátky.
-- Splátka (financing_installments): prázdne = ako kalendár; vyplnené prebíja.

alter table public.financing_contracts
  add column if not exists pohoda_predkontacia text,
  add column if not exists pohoda_clenenie_dph text,
  add column if not exists kv_clenenie text,
  add column if not exists pohoda_rad text;

alter table public.financing_installments
  add column if not exists insurance_part numeric(14,2) not null default 0,
  add column if not exists pohoda_predkontacia text,
  add column if not exists pohoda_clenenie_dph text,
  add column if not exists kv_clenenie text,
  add column if not exists exported_at timestamptz;

comment on column public.financing_installments.insurance_part is
  'Poistenie zahrnuté v splátke (havarijné, PZP…) — samostatná položka pri zaúčtovaní.';
comment on column public.financing_installments.exported_at is
  'Kedy bola splátka naposledy exportovaná do Pohody (Ostatné záväzky).';
comment on column public.financing_contracts.pohoda_predkontacia is
  'Predkontácia Pohody pre všetky splátky kalendára (splátka ju môže prepísať).';
