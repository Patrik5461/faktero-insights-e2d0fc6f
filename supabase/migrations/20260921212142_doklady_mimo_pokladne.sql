-- Hotovostný bloček, ktorý sa do pokladne nezapočítava — pri importe starých
-- dokladov z inej aplikácie by inak pokladňa za minulé mesiace nesedela.
alter table public.expense_documents
  add column if not exists mimo_pokladne boolean not null default false;
