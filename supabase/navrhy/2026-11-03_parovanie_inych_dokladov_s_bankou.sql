-- NÁVRH — NEAPLIKOVANÉ. Pred nasadením schváliť s Patrikom, aplikovať cez MCP
-- (supabase db push nejde, pozri pamäť faktero-migracie-verzie-nesedia) a súbor
-- presunúť do supabase/migrations pod verziou, ktorú dostane.
--
-- Párovanie iných dokladov (predpis poistného, platobný výmer, pokuta…) s pohybom
-- z účtu. Dnes iný doklad k pohybu žiadny odkaz nemá, zoznam preto vie ukázať len
-- „platba sa nenašla“. Väzba je na pohybe, rovnako ako pri faktúrach
-- (matched_invoice_id), bločkoch (matched_expense_id) a prijatých faktúrach
-- (matched_purchase_invoice_id).

alter table public.bank_transactions
  add column if not exists matched_other_document_id uuid
    references public.other_documents(id) on delete set null;

comment on column public.bank_transactions.matched_other_document_id is
  'Iný doklad (predpis, výmer, pokuta…) uhradený týmto pohybom. Odchádzajúca platba.';

-- Jeden doklad = jeden pohyb (ako pri bločkoch), inak by figuroval uhradený dvakrát.
create unique index if not exists bank_transactions_matched_other_document_uniq
  on public.bank_transactions (matched_other_document_id)
  where matched_other_document_id is not null;

-- Údaje na hľadanie platby a ručné „zaplatené“ bez pohybu (napr. v hotovosti na pošte).
-- VS a IBAN by dopĺňala AI z prílohy rovnako ako sumu a lehotu (RozpoznanyOstatny).
alter table public.other_documents
  add column if not exists variable_symbol text check (variable_symbol is null or char_length(variable_symbol) <= 20),
  add column if not exists iban text check (iban is null or char_length(iban) <= 34),
  add column if not exists paid_at date;

-- Väzba len v rámci firmy: pohyb a doklad musia patriť tej istej firme
-- (cudzí id by FK pustil). Rozšíriť existujúceho strážcu pohybov, ak ho má,
-- alebo samostatný spúšťač:
create or replace function public.bank_transactions_iny_doklad_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.matched_other_document_id is not null and not exists (
    select 1 from public.other_documents d
    where d.id = new.matched_other_document_id and d.company_id = new.company_id
  ) then
    raise exception 'Doklad nepatrí k tejto firme';
  end if;
  return new;
end;
$$;
revoke all on function public.bank_transactions_iny_doklad_guard() from public;

drop trigger if exists bank_transactions_iny_doklad_guard on public.bank_transactions;
create trigger bank_transactions_iny_doklad_guard
  before insert or update of matched_other_document_id on public.bank_transactions
  for each row execute function public.bank_transactions_iny_doklad_guard();
