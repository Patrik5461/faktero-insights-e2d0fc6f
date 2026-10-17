-- DATEV ako účtovný program firmy (export Buchungsstapel).
-- Nastavenia exportu (Beraternummer, Mandantennummer, osnova SKR03/SKR04,
-- dĺžka účtov, prepisy účtov) idú do existujúceho
-- companies.uctovanie_nastavenia -> 'datev', nový stĺpec netreba.
-- Bez tejto migrácie sa DATEV dá vyviezť (nemecká firma ho má predvolený),
-- len ho nejde uložiť ako zvolený program.
alter table public.companies
  drop constraint if exists companies_uctovny_program_check;
alter table public.companies
  add constraint companies_uctovny_program_check
    check (uctovny_program in ('pohoda','omega','money_s3','flexi','csv','datev'));
comment on column public.companies.uctovny_program is
  'Kam ide zaúčtovanie dokladov: pohoda, omega, money_s3, flexi, csv, datev';
