-- Nová tabuľka práva nedostane sama — RLS bez GRANT-u vráti
-- „permission denied for table partners" a vyzerá to ako chyba v politike.
grant select on public.partners to anon, authenticated;
grant insert, update, delete on public.partners to authenticated;
