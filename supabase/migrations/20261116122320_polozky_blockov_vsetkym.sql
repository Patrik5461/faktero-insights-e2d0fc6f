-- Bločky idú do Pohody s položkami (zaokrúhlenie ako položka „Centové zaokrúhlenie“) — zapnuté všetkým firmám aj predvolene pre nové.
alter table public.companies alter column pohoda_polozky_blockov set default true;
update public.companies set pohoda_polozky_blockov = true where pohoda_polozky_blockov is distinct from true;
