-- Osobitné úpravy uplatňovania dane.
--
-- Faktúra musí niesť vetu o osobitnej úprave, inak je neúplná (§ 74 ods. 1
-- písm. k až n zákona o DPH). Dve z nich sú vlastnosťou firmy alebo dodania:
--   § 68d – daň sa uplatňuje až z prijatej platby (celá firma),
--   § 65 a § 66 – úprava zdaňovania prirážky (konkrétny doklad).
alter table public.companies
  add column if not exists dan_z_prijatej_platby boolean not null default false;

alter table public.invoices
  add column if not exists osobitna_uprava text;

alter table public.invoices drop constraint if exists invoices_osobitna_uprava_chk;
alter table public.invoices add constraint invoices_osobitna_uprava_chk
  check (osobitna_uprava is null or osobitna_uprava in ('65', '66_tovar', '66_umenie', '66_starozitnosti'));
