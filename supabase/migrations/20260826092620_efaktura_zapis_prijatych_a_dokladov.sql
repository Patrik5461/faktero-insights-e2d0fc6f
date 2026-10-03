-- 1) Čiastočný index Postgres pri `ON CONFLICT (invoice_id)` nepoužije — inferencia
--    by musela zopakovať aj jeho podmienku, a PostgREST ju neposiela. Bežný unikátny
--    index tu stačí: viac NULL hodnôt sa v ňom navzájom nekoliduje, takže doklad bez
--    faktúry ostáva možný.
drop index if exists public.efaktura_documents_invoice_id_key;
create unique index efaktura_documents_invoice_id_key
  on public.efaktura_documents (invoice_id);

-- 2) Prijatá eFaktúra je štvrtý spôsob, ako sa doklad dostane do evidencie.
--    Bez tejto hodnoty zaevidovanie padalo na kontrolnom obmedzení.
alter table public.purchase_invoices drop constraint if exists purchase_invoices_source_check;
alter table public.purchase_invoices add constraint purchase_invoices_source_check
  check (source = any (array['rucne'::text, 'mail'::text, 'doklad'::text, 'efaktura'::text]));
