-- Odobratie práva na stĺpec nič nezmení, kým má rola právo na celú tabuľku.
-- Šifrované rodné číslo a číslo OP preto klient nedostane vôbec: právo na
-- tabuľku sa mení na právo na vymenované stĺpce. Čítajú sa len cez
-- employee_get_pii, ktorá prístup zapíše do auditu.
revoke select, insert, update on public.employees from authenticated;

grant select (
  id, company_id, first_name, last_name, title_before, title_after, birth_date, birth_place,
  nationality, email, phone, street, city, zip, country, iban, health_insurer, position,
  department, start_date, end_date, status, sp_registered_at, zp_registered_at,
  medical_check_due, bozp_training_due, note, created_by, created_at, updated_at
) on public.employees to authenticated;

grant insert (
  company_id, first_name, last_name, title_before, title_after, birth_date, birth_place,
  nationality, email, phone, street, city, zip, country, iban, health_insurer, position,
  department, start_date, end_date, status, sp_registered_at, zp_registered_at,
  medical_check_due, bozp_training_due, note
) on public.employees to authenticated;

grant update (
  first_name, last_name, title_before, title_after, birth_date, birth_place,
  nationality, email, phone, street, city, zip, country, iban, health_insurer, position,
  department, start_date, end_date, status, sp_registered_at, zp_registered_at,
  medical_check_due, bozp_training_due, note
) on public.employees to authenticated;
