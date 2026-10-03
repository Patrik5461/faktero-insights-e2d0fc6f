-- „Po splatnosti" je odvodený stav: neuhradená faktúra so splatnosťou
-- v minulosti. Tak ho počíta zoznam faktúr, prehľad, zvonček aj appka.
-- Uložený ako `overdue` vypadol zo všetkých filtrov na `issued`/`sent` —
-- automatická upomienka by takú faktúru obišla a nespárovala by sa ani s
-- platbou z banky. Jediný, kto ho kedy zapísal, bol import.
--
-- Hodnota v type `invoice_status` ostáva (odobrať hodnotu z enumu Postgres
-- nevie bez prestavby stĺpca), ale tabuľka ju už neprijme.
update public.invoices set status = 'issued' where status = 'overdue';

alter table public.invoices
  add constraint invoices_po_splatnosti_sa_neuklada
  check (status <> 'overdue'::public.invoice_status);
