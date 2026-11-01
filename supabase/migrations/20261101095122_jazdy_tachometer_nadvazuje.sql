-- J-05: jazda z GPS (web, appka, automatická detekcia) prichádza s tachometrom od 0
-- (start 0, koniec = km). Spúšťač ju napojí na predchádzajúcu jazdu vozidla,
-- inak na počiatočný stav tachometra. Ručne zadaný tachometer nemení.
-- Funguje aj pre appky v telefónoch bez nového buildu.
-- Dátová oprava 108 starých jázd: záloha public.zaloha_jazdy_tachometer_20261101,
-- skript /tmp/opravy-b8-nastroje/tachometer.mjs (1. 11. 2026).
create or replace function public.trips_doplnit_tachometer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_km numeric;
  v_zaklad numeric;
  v_kedy timestamptz;
begin
  if new.vehicle_id is null or coalesce(new.start_odometer, 0) <> 0 then
    return new;
  end if;
  v_km := coalesce(new.distance_km, new.end_odometer, 0);
  -- len „relatívny“ záznam: koniec = prejdené km (alebo bez konca)
  if new.end_odometer is not null and new.end_odometer <> v_km then
    return new;
  end if;
  v_kedy := coalesce(new.start_time, new.created_at, now());
  select t.end_odometer into v_zaklad
    from public.trips t
   where t.vehicle_id = new.vehicle_id
     and t.id <> new.id
     and t.end_odometer is not null
     and (t.trip_date, coalesce(t.start_time, t.created_at)) <= (new.trip_date, v_kedy)
   order by t.trip_date desc, coalesce(t.start_time, t.created_at) desc, t.created_at desc
   limit 1;
  if v_zaklad is null then
    select v.initial_odometer into v_zaklad from public.vehicles v where v.id = new.vehicle_id;
  end if;
  if coalesce(v_zaklad, 0) > 0 then
    new.start_odometer := v_zaklad;
    new.end_odometer := v_zaklad + v_km;
    if new.distance_km is null then
      new.distance_km := v_km;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.trips_doplnit_tachometer() from public, anon, authenticated;

drop trigger if exists trips_doplnit_tachometer on public.trips;
create trigger trips_doplnit_tachometer
  before insert on public.trips
  for each row execute function public.trips_doplnit_tachometer();
