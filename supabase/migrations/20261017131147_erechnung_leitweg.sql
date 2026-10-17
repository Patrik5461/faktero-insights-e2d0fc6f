-- Nemecká e-faktúra (XRechnung): Leitweg-ID odberateľa.
--
-- Úrady v Nemecku (B2G) chcú v XRechnung ako „Buyer reference“ (BT-10)
-- Leitweg-ID, napr. „991-12345-67“ alebo „04011000-1234512345-06“. Pri
-- firmách (B2B) ostáva prázdne a XRechnung dá číslo objednávky alebo „n/a“.
-- Formulár kontaktu pole ukáže až vtedy, keď tento stĺpec existuje.
--
-- Bez nových tabuliek, takže GRANT ani politiky netreba — stĺpec preberá
-- práva tabuľky customers.

alter table public.customers
  add column if not exists leitweg_id text;

alter table public.customers
  drop constraint if exists customers_leitweg_id_tvar;
alter table public.customers
  add constraint customers_leitweg_id_tvar
  check (leitweg_id is null or leitweg_id ~ '^[0-9A-Za-z]{2,12}(-[0-9A-Za-z]{1,30})?-[0-9A-Za-z]{2}$');

comment on column public.customers.leitweg_id is
  'Leitweg-ID nemeckého verejného odberateľa — BT-10 v XRechnung.';
