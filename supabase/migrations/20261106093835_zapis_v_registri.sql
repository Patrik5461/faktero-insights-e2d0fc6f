-- Zápis dodávateľa v obchodnom (živnostenskom) registri — povinný údaj na
-- obchodných listoch a faktúrach (§ 3a Obchodného zákonníka, § 435 OZ v ČR).
-- `registracia_text` je hotový text, ktorý sa tlačí; štruktúrované polia sú
-- voliteľné a slúžia na skladanie textu, ak je `registracia_text` prázdny.
-- Nemecké `registergericht` / `handelsregister_nr` ostávajú bez zmeny.
alter table public.companies
  add column if not exists registracia_text text,
  add column if not exists register_sud text,
  add column if not exists register_oddiel text,
  add column if not exists register_vlozka text;

comment on column public.companies.registracia_text is
  'Zápis v obchodnom/živnostenskom registri tak, ako sa tlačí na doklade (napr. „Obchodný register Mestského súdu Bratislava III, oddiel: Sro, vložka č. 123456/B“).';
comment on column public.companies.register_sud is 'Registrový súd (SK) / krajský súd (CZ), napr. „Mestský súd Bratislava III“.';
comment on column public.companies.register_oddiel is 'Oddiel (SK: Sro, Sa, Po…) / spisová značka – oddiel (CZ: C, B…).';
comment on column public.companies.register_vlozka is 'Číslo vložky, napr. „123456/B“.';
