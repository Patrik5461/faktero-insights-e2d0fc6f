/*
  Väzba prijatej faktúry na pohyb na účte.

  `bank_transactions` doteraz vedela, ktorú **vydanú** faktúru platba uhradila
  (`matched_invoice_id`), ktorú splátku (`matched_installment_id`) a ktorý
  naskenovaný doklad (`matched_expense_id`). Prijatá faktúra ako jediná väzbu
  nemala — z dokladu sa nedalo zistiť, ktorým prevodom bol zaplatený, a z
  pohybu nebolo vidieť, čo ním firma uhradila.

  `ON DELETE SET NULL` rovnako ako pri ostatných: zmazanie faktúry nesmie
  zobrať pohyb z účtu, ten je záznamom o skutočnosti.
*/
alter table public.bank_transactions
  add column if not exists matched_purchase_invoice_id uuid
  references public.purchase_invoices(id) on delete set null;

/*
  Index je čiastočný — spárovaných pohybov je zlomok a hľadá sa vždy len
  v nich (ktorý pohyb uhradil túto faktúru).
*/
create index if not exists bank_transactions_matched_purchase_invoice_idx
  on public.bank_transactions (matched_purchase_invoice_id)
  where matched_purchase_invoice_id is not null;

comment on column public.bank_transactions.matched_purchase_invoice_id is
  'Prijatá faktúra, ktorú tento pohyb uhradil. Odchádzajúca platba, teda záporná suma.';
