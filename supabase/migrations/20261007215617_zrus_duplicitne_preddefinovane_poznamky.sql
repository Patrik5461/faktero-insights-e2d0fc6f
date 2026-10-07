-- Preddefinované poznámky už drží companies.poznamky_sablony.
alter table public.companies drop column if exists preddefinovane_poznamky;
