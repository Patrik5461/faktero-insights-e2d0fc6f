alter table public.other_documents add column if not exists priecinok text;
comment on column public.other_documents.priecinok is 'Priečinok ostatného dokladu (zmluvy, objednávky…) — na triedenie, voľný názov.';
create index if not exists other_documents_priecinok on public.other_documents (company_id, priecinok);
