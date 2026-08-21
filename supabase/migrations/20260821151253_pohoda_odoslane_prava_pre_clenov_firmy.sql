-- `pohoda_odoslane` si pamätá, ktoré číselníky už do POHODY odišli, aby sa
-- neposielali druhýkrát. Tabuľka má zapnuté RLS, ale žiadnu politiku ani právo
-- pre `authenticated` — z webu (Účtovné exporty → odovzdanie účtovníkovi) sa do
-- nej nedá ani zapísať, ani čítať. Chyba sa nikde nekontroluje, takže sa pamäť
-- ticho neplní. Konektor beží cez service_role a funguje.
grant select, insert, update on public.pohoda_odoslane to authenticated;

create policy "clenovia citaju pohoda_odoslane" on public.pohoda_odoslane
  for select to authenticated
  using (is_company_member(company_id, (select auth.uid())));

create policy "clenovia zapisuju pohoda_odoslane" on public.pohoda_odoslane
  for insert to authenticated
  with check (is_company_member(company_id, (select auth.uid())));

create policy "clenovia menia pohoda_odoslane" on public.pohoda_odoslane
  for update to authenticated
  using (is_company_member(company_id, (select auth.uid())))
  with check (is_company_member(company_id, (select auth.uid())));

-- Partneri: `auth.uid()` v politike sa vyhodnocuje pre každý riadok, v zátvorke
-- so `select` raz za dotaz. Samostatná politika na čítanie je navyše, lebo
-- `partners_admin_write` je `for all`.
drop policy if exists "partners_admin_read" on public.partners;
drop policy if exists "partners_admin_write" on public.partners;
create policy "partners_admin_write" on public.partners
  for all to authenticated
  using (is_platform_admin((select auth.uid())))
  with check (is_platform_admin((select auth.uid())));
