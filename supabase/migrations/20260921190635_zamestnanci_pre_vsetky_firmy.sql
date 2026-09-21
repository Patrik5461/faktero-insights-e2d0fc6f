-- Modul Zamestnanci pre všetky firmy, aj novo registrované (rozhodnutie
-- Patrika 2026-09-21). Stĺpec ostáva, aby sa dal firme v prípade potreby vypnúť.
alter table public.companies alter column module_employees set default true;
update public.companies set module_employees = true where module_employees is distinct from true;
