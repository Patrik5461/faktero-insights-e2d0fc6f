-- Bloček v cudzej mene si pamätá kurz ako faktúry (exchange_rate v zápise banky krajiny firmy:
-- SK ECB „X za 1 €“, CZ ČNB „CZK za 1 X“). Stĺpce sú nepovinné, starý kód ich ignoruje.
alter table public.expense_documents
  add column if not exists exchange_rate numeric,
  add column if not exists exchange_rate_date date,
  add column if not exists exchange_rate_source text;
comment on column public.expense_documents.exchange_rate is
  'Kurz cudzej meny v zápise banky krajiny firmy (SK ECB X za 1 EUR, CZ ČNB CZK za 1 X); null pri domácej mene.';
