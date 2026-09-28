-- Zľavy na faktúrach a cenových ponukách.
--
-- Dve úrovne, lebo obchod ich potrebuje obe: percento pri konkrétnej položke
-- (napr. zľavnený materiál) a zľava na celý doklad, na ktorej sa človek
-- dohodne až na konci („dám ti to o päť percent lacnejšie").
--
-- Sumy v riadkoch (subtotal/vat_amount/total) sú vždy PO zľave riadku — tak
-- ich čítajú exporty aj výkazy a nemusia o zľavách vedieť. Zľava na doklad
-- sa do riadkov nepremieta; jej suma je v discount_total a hlavičkové súčty
-- ju už majú odpočítanú, rozpočítanú pomerne medzi sadzby DPH.

alter table public.invoice_items
  add column if not exists discount_percent numeric(5, 2) not null default 0;
alter table public.quote_items
  add column if not exists discount_percent numeric(5, 2) not null default 0;

alter table public.invoices
  add column if not exists discount_type text,
  add column if not exists discount_value numeric(15, 5) not null default 0,
  add column if not exists discount_total numeric(15, 2) not null default 0;
alter table public.quotes
  add column if not exists discount_type text,
  add column if not exists discount_value numeric(15, 5) not null default 0,
  add column if not exists discount_total numeric(15, 2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_discount_type_check') then
    alter table public.invoices
      add constraint invoices_discount_type_check
      check (discount_type is null or discount_type in ('percent', 'amount'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'quotes_discount_type_check') then
    alter table public.quotes
      add constraint quotes_discount_type_check
      check (discount_type is null or discount_type in ('percent', 'amount'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invoice_items_discount_percent_check') then
    alter table public.invoice_items
      add constraint invoice_items_discount_percent_check
      check (discount_percent >= 0 and discount_percent <= 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'quote_items_discount_percent_check') then
    alter table public.quote_items
      add constraint quote_items_discount_percent_check
      check (discount_percent >= 0 and discount_percent <= 100);
  end if;
end $$;

comment on column public.invoices.discount_type is 'percent = discount_value je %, amount = discount_value je suma bez DPH; NULL = bez zľavy na doklad';
comment on column public.invoices.discount_total is 'Suma zľavy na doklad bez DPH, ktorú už hlavičkové súčty odpočítavajú';
comment on column public.invoice_items.discount_percent is 'Zľava riadku v %; subtotal/vat_amount/total sú už po nej';
