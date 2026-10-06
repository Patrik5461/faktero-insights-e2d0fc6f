-- Bločky idú do Pohody ako v Doklado: hotovosť pokladňa, karta interný doklad.
alter table public.companies alter column pohoda_blocky_agenda set default 'podla_platby';
update public.companies set pohoda_blocky_agenda = 'podla_platby' where pohoda_blocky_agenda = 'faktura';
