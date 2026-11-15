-- Samozdanenie prijatej faktúry do Pohody cez interné doklady (15. 11. 2026).
--
-- Overené v POHODE SK 14404.8 (kópia PALIERA s.r.o.): prijatá faktúra
-- v prenesení (§ 69 ods. 12), služba zo zahraničia (§ 69 ods. 3) či tovar
-- z EÚ ide bez DPH (priceNone, PDsluz/PDnadEU, KV „KN“) a daň sa prizná a
-- odpočíta dvoma internými dokladmi „Priznanie DPH“ (DDsluz / DDsl§69 /
-- DDnadEU, KV B1) a „Odpočet DPH“ (PDsluz / PDnadEU, KV B1) — tak, ako ich
-- zadáva účtovníčka. Firma si nastaví predkontácie oboch dokladov a rad.
alter table public.companies
  add column if not exists pohoda_predkontacia_samozdanenie_dan text,
  add column if not exists pohoda_predkontacia_samozdanenie_odpocet text,
  add column if not exists pohoda_rad_samozdanenie text;

comment on column public.companies.pohoda_predkontacia_samozdanenie_dan is
  'Predkontácia interného dokladu „Priznanie DPH“ pri samozdanení prijatej faktúry (napr. aInt).';
comment on column public.companies.pohoda_predkontacia_samozdanenie_odpocet is
  'Predkontácia interného dokladu „Odpočet DPH“ pri samozdanení prijatej faktúry (napr. bInt).';
comment on column public.companies.pohoda_rad_samozdanenie is
  'Predpona číselného radu interných dokladov samozdanenia v Pohode (napr. 26sam); prázdne = predvolený rad.';
