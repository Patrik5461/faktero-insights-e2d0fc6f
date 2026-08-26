-- Jeden eFaktúrový doklad na faktúru.
--
-- `posliEfakturuFn` aj `generateEfakturaXmlFn` s tým počítali — prvý cez
-- `upsert(onConflict: "invoice_id")`, druhý cez ručné „nájdi a uprav".
-- Index ale nikdy nevznikol, takže upsert padal na 42P10 a odoslanie cez
-- rozhranie skončilo zakaždým chybou. `invoice_id` je nullable (doklad môže
-- vzniknúť aj bez faktúry), preto čiastočný index.
create unique index if not exists efaktura_documents_invoice_id_key
  on public.efaktura_documents (invoice_id)
  where invoice_id is not null;
