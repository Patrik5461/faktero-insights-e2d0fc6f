-- Väzba prijatej eFaktúry na prijatú faktúru, ktorá z nej vznikla.
-- Stĺpec existoval od začiatku bez cudzieho kľúča („future link“). Kľúč dovolí
-- PostgREST vnorený výber purchase_invoices -> efaktura_received_documents
-- (odznak „eFaktúra prijatá“ v zozname jedným dotazom) a po zmazaní prijatej
-- faktúry väzbu sám uvoľní, takže eFaktúra sa dá zaevidovať znova.
-- Spätne kompatibilné: sirôt je 0 (overené pred aplikovaním), kód nič nemení.
update public.efaktura_received_documents r
   set matched_supplier_invoice_id = null
 where matched_supplier_invoice_id is not null
   and not exists (select 1 from public.purchase_invoices p where p.id = r.matched_supplier_invoice_id);

alter table public.efaktura_received_documents
  add constraint efaktura_received_documents_matched_supplier_invoice_id_fkey
  foreign key (matched_supplier_invoice_id) references public.purchase_invoices(id) on delete set null;

notify pgrst, 'reload schema';
