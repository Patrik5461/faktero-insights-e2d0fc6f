-- Cesta k súboru uložená v riadku musí ležať v priečinku firmy toho riadku.
--
-- Člen firmy vie cez RLS cestu v riadku prepísať a server ju potom sťahuje
-- alebo podpisuje servisným kľúčom, ktorý politiky Storage obchádza. Server to
-- kontroluje aj v kóde (`cestaPatriFirme`), toto je poistka v databáze:
--   - prvý segment cesty = company_id riadku (pri companies = id),
--   - žiadny segment „.“ ani „..“ a žiadne spätné lomítko (URL by ich zložila
--     do iného priečinka), ani zakódované „%2e“.
--
-- Overené SELECTom 2026-11-06 na sywcjxydnljkzoepfcaz: všetky existujúce
-- riadky podmienku spĺňajú (quotes 8, nespracovane_doklady 82, logo 5,
-- pečiatka 2, invoices 54, import_jobs 3, invoice_attachments 11,
-- bank_statements 189, expense_documents 2159, purchase_invoices 1368,
-- other_document_files 12, delivery_parse_jobs 36, financing_contracts 2),
-- preto sa obmedzenia rovno overujú (bez NOT VALID).

create or replace function public.cesta_vo_firme(cesta text, firma uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cesta is null
    or (
      firma is not null
      and split_part(cesta, '/', 1) = firma::text
      and cesta !~* '(^|/)(\.|%2e)(\.|%2e)?(/|$)'
      and position(E'\\' in cesta) = 0
    );
$$;

-- Funkcia nič nečíta, takže EXECUTE ostáva všetkým — CHECK ju volá pod rolou zapisujúceho.

alter table public.quotes
  add constraint quotes_pdf_url_vo_firme check (public.cesta_vo_firme(pdf_url, company_id));
alter table public.invoices
  add constraint invoices_pdf_url_vo_firme check (public.cesta_vo_firme(pdf_url, company_id));
alter table public.nespracovane_doklady
  add constraint nespracovane_doklady_file_path_vo_firme check (public.cesta_vo_firme(file_path, company_id));
alter table public.companies
  add constraint companies_logo_url_vo_firme check (public.cesta_vo_firme(logo_url, id)),
  add constraint companies_stamp_url_vo_firme check (public.cesta_vo_firme(stamp_url, id));
alter table public.import_jobs
  add constraint import_jobs_file_path_vo_firme check (public.cesta_vo_firme(file_path, company_id));
alter table public.invoice_attachments
  add constraint invoice_attachments_path_vo_firme check (public.cesta_vo_firme(path, company_id));
alter table public.bank_statements
  add constraint bank_statements_storage_path_vo_firme check (public.cesta_vo_firme(storage_path, company_id));
alter table public.expense_documents
  add constraint expense_documents_file_path_vo_firme check (public.cesta_vo_firme(file_path, company_id));
alter table public.purchase_invoices
  add constraint purchase_invoices_file_path_vo_firme check (public.cesta_vo_firme(file_path, company_id));
alter table public.other_document_files
  add constraint other_document_files_path_vo_firme check (public.cesta_vo_firme(path, company_id));
alter table public.delivery_parse_jobs
  add constraint delivery_parse_jobs_storage_path_vo_firme check (public.cesta_vo_firme(storage_path, company_id));
alter table public.financing_contracts
  add constraint financing_contracts_document_path_vo_firme check (public.cesta_vo_firme(document_path, company_id));
