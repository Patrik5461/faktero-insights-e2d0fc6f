-- Upozornenia banky: účet, ktorý banka nepozná (NO_ACCOUNT), a opakované
-- pripomienky trvajúcich problémov (raz za týždeň, najviac 4-krát).
alter table public.bank_suhlas_upozornenia
  drop constraint if exists bank_suhlas_upozornenia_druh_check;
alter table public.bank_suhlas_upozornenia
  add constraint bank_suhlas_upozornenia_druh_check
  check (druh in ('suhlas_14', 'suhlas_3', 'suhlas_vyprsal', 'pohyby', 'nepozna'));

alter table public.bank_suhlas_upozornenia
  add column if not exists pocet integer not null default 1;

comment on column public.bank_suhlas_upozornenia.pocet is
  'Koľko e-mailov k tomuto problému odišlo; created_at = čas posledného (bank-suhlas-pripomienky.server.ts).';
