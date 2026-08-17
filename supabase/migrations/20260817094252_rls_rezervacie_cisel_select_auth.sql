-- Politiky na `invoice_number_reservations` volali `auth.uid()` pre každý riadok,
-- takže Postgres funkciu vyhodnocoval znova a znova. Obalenie do `(select …)` ju
-- vyhodnotí raz na celý dopyt; správanie politiky sa nemení.
--
-- Rovnaká oprava sa robila plošne v `20260813092701_rls_politiky_vyhodnocuju_auth_uid_raz`
-- — táto tabuľka vznikla až po nej (rezervácie čísel pre fakturáciu bez signálu),
-- takže na ňu vtedy nedošlo.

drop policy if exists "clenovia vidia rezervacie" on public.invoice_number_reservations;
create policy "clenovia vidia rezervacie"
  on public.invoice_number_reservations
  for select
  using (is_company_member(company_id, (select auth.uid())));

drop policy if exists "clenovia znacia pouzitie" on public.invoice_number_reservations;
create policy "clenovia znacia pouzitie"
  on public.invoice_number_reservations
  for update
  using (is_company_member(company_id, (select auth.uid())))
  with check (is_company_member(company_id, (select auth.uid())));
