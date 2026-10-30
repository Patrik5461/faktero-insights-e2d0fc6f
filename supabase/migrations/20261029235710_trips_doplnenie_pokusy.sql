-- Jazdy z detekcie, ktoré sa nedarí doplniť (adresa, vodič), si pamätajú
-- počet pokusov a čas posledného — cron ich potom nečíta každých 5 minút znova.
alter table public.trips
  add column if not exists doplnenie_pokusy integer not null default 0,
  add column if not exists doplnenie_skusane_at timestamptz;

comment on column public.trips.doplnenie_pokusy is
  'Koľkokrát sa server neúspešne pokúsil doplniť adresy/vodiča (jazdy-doplnenie.server.ts).';
comment on column public.trips.doplnenie_skusane_at is
  'Čas posledného neúspešného pokusu o doplnenie.';

create index if not exists trips_na_doplnenie_idx
  on public.trips (created_at desc)
  where external_source = 'drive_detector'
    and (start_location is null or end_location is null or driver_name is null);
