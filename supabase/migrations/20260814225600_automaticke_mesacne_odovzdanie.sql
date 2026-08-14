-- Posielanie e-mailu v mene firmy musí byť vedomé rozhodnutie, nie predvolený
-- stav — preto sa automatické odovzdanie zapína, nie vypína.
alter table public.companies
  add column if not exists odovzdanie_automaticky boolean not null default false;

comment on column public.companies.odovzdanie_automaticky is 'Posielať podklady účtovníčke automaticky 5. v mesiaci';
