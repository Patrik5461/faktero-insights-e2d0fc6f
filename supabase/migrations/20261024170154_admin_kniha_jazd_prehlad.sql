-- Prehľad knihy jázd po firmách pre Admin → Kniha jázd. Volá ho len server servisným kľúčom.
create or replace function public.admin_kniha_jazd_prehlad()
returns table (
  company_id uuid,
  vozidiel bigint,
  aktivnych bigint,
  jazd bigint,
  jazd_30_dni bigint,
  km_30_dni numeric,
  posledna_jazda date,
  z_commanderu bigint,
  z_appky bigint,
  rucne bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select company_id, count(*) vozidiel, count(*) filter (where active) aktivnych
    from vehicles group by company_id
  ), t as (
    select company_id,
      count(*) jazd,
      count(*) filter (where trip_date >= current_date - 30) jazd_30_dni,
      coalesce(sum(distance_km) filter (where trip_date >= current_date - 30), 0) km_30_dni,
      max(trip_date) posledna_jazda,
      count(*) filter (where external_source = 'commander') z_commanderu,
      count(*) filter (where external_source = 'drive_detector') z_appky,
      count(*) filter (where external_source is null) rucne
    from trips group by company_id
  )
  select coalesce(v.company_id, t.company_id), coalesce(v.vozidiel, 0), coalesce(v.aktivnych, 0),
    coalesce(t.jazd, 0), coalesce(t.jazd_30_dni, 0), coalesce(t.km_30_dni, 0), t.posledna_jazda,
    coalesce(t.z_commanderu, 0), coalesce(t.z_appky, 0), coalesce(t.rucne, 0)
  from v full join t on t.company_id = v.company_id;
$$;
revoke all on function public.admin_kniha_jazd_prehlad() from public, anon, authenticated;
grant execute on function public.admin_kniha_jazd_prehlad() to service_role;
