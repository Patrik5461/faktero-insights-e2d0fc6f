-- Úhrada zapísaná z bankového pohybu si pamätá, z ktorého pohybu vznikla.
-- Bez toho sa nedá ani zistiť, čo už bolo spárované, ani párovanie vrátiť,
-- a opakované spustenie by tú istú platbu zapísalo druhý raz.
alter table public.payments
  add column if not exists bank_transaction_id uuid
  references public.bank_transactions(id) on delete set null;

-- Jeden bankový pohyb môže vytvoriť najviac jednu úhradu. Toto je posledná
-- poistka; kontrola v kóde vie o súbežnom spustení nič netušiť.
create unique index if not exists payments_bank_transaction_uniq
  on public.payments (bank_transaction_id)
  where bank_transaction_id is not null;

create index if not exists idx_payments_invoice on public.payments (invoice_id);
create index if not exists idx_payments_company_date on public.payments (company_id, paid_at desc);
