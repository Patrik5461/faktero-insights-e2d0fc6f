-- Strážca konektora do Pohody.
--
-- Keď účtovníčke vypnú počítač alebo zlyhá naplánovaná úloha, konektor prestane
-- chodiť a nikto sa to nedozvie — doklady sa ticho hromadia. Toto pošle firme
-- e-mail, keď sa konektor dlhšie neozve.
--
-- Stĺpec drží čas posledného upozornenia, aby neodchádzalo každý deň znova.
-- Ďalšie sa pošle až vtedy, keď sa konektor medzitým ozval a znovu stíchol.

alter table public.companies
  add column if not exists pohoda_konektor_upozorneny_at timestamptz;

comment on column public.companies.pohoda_konektor_upozorneny_at is
  'Kedy sme naposledy upozornili, že sa konektor do Pohody neozýva.';
