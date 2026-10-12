-- Colný kód (kombinovaná nomenklatúra KN/CN, 8 číslic; HS = prvých 6), krajina
-- pôvodu a čistá hmotnosť — pre vývoz mimo EÚ, Intrastat a eFaktúru. Pri produkte
-- a skladovej karte ako predvolené, na položke dokladu ako skutočný údaj.
alter table public.products
  add column if not exists colny_kod text,
  add column if not exists krajina_povodu text,
  add column if not exists hmotnost_kg numeric;
alter table public.stock_items
  add column if not exists colny_kod text,
  add column if not exists krajina_povodu text,
  add column if not exists hmotnost_kg numeric;
alter table public.invoice_items
  add column if not exists colny_kod text,
  add column if not exists krajina_povodu text,
  add column if not exists hmotnost_kg numeric;
alter table public.quote_items
  add column if not exists colny_kod text,
  add column if not exists krajina_povodu text,
  add column if not exists hmotnost_kg numeric;

-- Kód len z číslic (6–10), krajina ako dvojpísmenový kód.
alter table public.products add constraint products_colny_kod_chk check (colny_kod is null or colny_kod ~ '^[0-9]{6,10}$');
alter table public.stock_items add constraint stock_items_colny_kod_chk check (colny_kod is null or colny_kod ~ '^[0-9]{6,10}$');
alter table public.invoice_items add constraint invoice_items_colny_kod_chk check (colny_kod is null or colny_kod ~ '^[0-9]{6,10}$');
alter table public.quote_items add constraint quote_items_colny_kod_chk check (colny_kod is null or colny_kod ~ '^[0-9]{6,10}$');
alter table public.products add constraint products_krajina_povodu_chk check (krajina_povodu is null or krajina_povodu ~ '^[A-Z]{2}$');
alter table public.stock_items add constraint stock_items_krajina_povodu_chk check (krajina_povodu is null or krajina_povodu ~ '^[A-Z]{2}$');
alter table public.invoice_items add constraint invoice_items_krajina_povodu_chk check (krajina_povodu is null or krajina_povodu ~ '^[A-Z]{2}$');
alter table public.quote_items add constraint quote_items_krajina_povodu_chk check (krajina_povodu is null or krajina_povodu ~ '^[A-Z]{2}$');
