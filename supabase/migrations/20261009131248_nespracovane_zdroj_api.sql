-- Doklad nahratý cez verejné API (POST /api/v1/unprocessed-documents).
alter table public.nespracovane_doklady drop constraint nespracovane_doklady_zdroj_check;
alter table public.nespracovane_doklady add constraint nespracovane_doklady_zdroj_check
  check (zdroj = any (array['mail', 'nahratie', 'skener', 'apka', 'efaktura', 'import', 'api']));
