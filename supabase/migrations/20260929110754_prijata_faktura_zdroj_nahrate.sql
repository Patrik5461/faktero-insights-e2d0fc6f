-- Doklad nahratý súborom má vlastný zdroj.
--
-- Doteraz sa prijatá faktúra dala dostať dnu ručne, poštou, z bločku,
-- eFaktúrou alebo importom. Nahratie PDF či fotky priamo v zozname je šiesta
-- cesta a bez vlastnej hodnoty by sa tvárila ako ručný prepis — v zozname by
-- potom nebolo vidieť, že údaje čítala AI a treba ich prejsť očami.

alter table public.purchase_invoices drop constraint if exists purchase_invoices_source_check;
alter table public.purchase_invoices
  add constraint purchase_invoices_source_check
  check (source = any (array['rucne', 'mail', 'doklad', 'efaktura', 'import', 'nahrate']));
