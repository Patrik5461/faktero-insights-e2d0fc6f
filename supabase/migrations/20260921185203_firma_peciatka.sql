-- Pečiatka firmy na faktúrach a ponukách. Súbor leží v kbelíku company-logos
-- vedľa loga. faktero_invoice_pdf_hash berie celý riadok firmy, takže zmena
-- pečiatky sama vynúti nové PDF.
alter table public.companies add column if not exists stamp_url text;
alter table public.companies add column if not exists invoice_show_stamp boolean not null default true;
