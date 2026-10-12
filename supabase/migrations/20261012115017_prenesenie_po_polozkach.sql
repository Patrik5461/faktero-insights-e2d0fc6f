-- Prenesenie daňovej povinnosti len na niektoré položky faktúry (zmiešaná
-- faktúra, napr. železo podľa § 69 ods. 12 bez DPH a montáž s DPH). Položka
-- s príznakom ide so sadzbou 0 a daň priznáva odberateľ; hlavička faktúry
-- ostáva bez prenesenia. Celofaktúrové prenesenie (invoices.reverse_charge)
-- funguje ďalej ako doteraz.
alter table public.invoice_items add column if not exists prenesenie boolean not null default false;
alter table public.quote_items add column if not exists prenesenie boolean not null default false;
