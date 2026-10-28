-- Úhrada prijatej faktúry z verejného API: vlastné id integrátora, aby opakované
-- volanie (výpadok spojenia, nový pokus) nezapísalo tú istú platbu dvakrát.
alter table public.purchase_invoice_payments
  add column if not exists external_id text
    check (external_id is null or char_length(external_id) between 1 and 120);

create unique index if not exists purchase_invoice_payments_external_id_uq
  on public.purchase_invoice_payments (company_id, external_id)
  where external_id is not null;

comment on column public.purchase_invoice_payments.external_id is
  'Vlastné id úhrady z API (idempotencia); jedinečné v rámci firmy.';
