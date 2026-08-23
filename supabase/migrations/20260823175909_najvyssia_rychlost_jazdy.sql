-- Priemernú rýchlosť kniha jázd už mala, najvyššiu nie — pri jazdách
-- rozpoznaných telefónom končila len v poznámke ako text, takže sa nedala
-- ani vyhľadať, ani exportovať.
alter table public.trips
  add column if not exists max_speed_kmh numeric;

comment on column public.trips.max_speed_kmh is
  'Najvyššia rýchlosť z GPS v km/h. Priemer je v `average_speed_kmh`.';
