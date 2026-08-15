-- Príjemky a výdajky (agendy `prijemka` a `vydejka`) pre konektor do Pohody.
--
-- Bez nich má účtovníčka v Pohode skladové karty, ale nulové stavy — množstvá
-- tam vznikajú práve týmito dokladmi. Posielajú sa s príznakom `notPost`, takže
-- pohnú skladom, ale nezaúčtujú sa: náklad je už na prijatom doklade a výnos na
-- faktúre, takže druhé zaúčtovanie by ho zdvojilo.
--
-- Pohyb sa dá poslať až vtedy, keď je v Pohode jeho skladová karta — položka sa
-- na ňu odvoláva naším identifikátorom.

alter table public.pohoda_odoslane drop constraint if exists pohoda_odoslane_agenda_check;
alter table public.pohoda_odoslane
  add constraint pohoda_odoslane_agenda_check
  check (agenda in ('adresar', 'sklad', 'zakazka', 'pohyb'));

alter table public.companies
  add column if not exists pohoda_posielat_pohyby boolean not null default false;

comment on column public.companies.pohoda_posielat_pohyby is
  'Posielať skladové pohyby ako príjemky a výdajky, aby v Pohode sedeli stavy skladu.';
