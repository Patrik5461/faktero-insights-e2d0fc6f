-- Bločky a prijaté faktúry sa dosiaľ s bankou nespájali vôbec: `expense_documents`
-- nemal k pohybu jediný odkaz. Väzbu držíme na pohybe, rovnako ako pri faktúrach
-- (`matched_invoice_id`) a splátkach (`matched_installment_id`) — inak by boli
-- v jednej tabuľke dva rôzne spôsoby toho istého.
alter table public.bank_transactions
  add column if not exists matched_expense_id uuid
    references public.expense_documents(id) on delete set null;

comment on column public.bank_transactions.matched_expense_id is
  'Naskenovaný doklad uhradený týmto pohybom. Jeden pohyb = jeden doklad.';

-- Jeden doklad sa nesmie uhradiť dvoma pohybmi. Bez tohto by sa ten istý bloček
-- dal spárovať dvakrát a v prehľade by figuroval ako zaplatený dvojnásobne.
create unique index if not exists bank_transactions_matched_expense_uniq
  on public.bank_transactions (matched_expense_id)
  where matched_expense_id is not null;

create index if not exists bank_transactions_nesparovane_vydavky
  on public.bank_transactions (company_id, booking_date)
  where matched_expense_id is null and matched_invoice_id is null;
