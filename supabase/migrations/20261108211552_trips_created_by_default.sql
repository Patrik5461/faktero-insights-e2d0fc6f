-- Jazda z appky („Spustiť jazdu“) sa zapisovala bez autora, takže server
-- nevedel doplniť meno vodiča. Autor = prihlásený používateľ, ak ho zápis nedá.
alter table public.trips alter column created_by set default auth.uid();

-- Staré jazdy z appky bez autora: vo firme s jediným členom je autor jasný.
update public.trips t
set created_by = cu.user_id, doplnenie_pokusy = 0, doplnenie_skusane_at = null
from (
  select company_id, min(user_id::text)::uuid as user_id
  from public.company_users group by company_id having count(*) = 1
) cu
where cu.company_id = t.company_id
  and t.created_by is null
  and t.external_source is null
  and t.route is not null
  and t.driver_name is null;
