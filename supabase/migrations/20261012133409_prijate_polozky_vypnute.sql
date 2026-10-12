-- Vypnuté položky prijatej faktúry (zle vyčítané). Pri vypnutí sa presunú sem
-- a `items` ostane prázdne — zaúčtovanie, rozúčtovanie, export do Pohody aj výkazy
-- potom idú podľa súčtov a rozpisu DPH hlavičky. Zapnutím sa vrátia späť.
alter table public.purchase_invoices add column if not exists polozky_vypnute jsonb;
