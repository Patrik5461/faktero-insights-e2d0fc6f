-- Zapisuje ich server (webhook) cez servisnú rolu. Tá v tomto projekte nemá
-- práva automaticky — bez tohto skončí potvrdenie na
-- „permission denied for table inbox_verifications" a používateľ kód nikdy
-- neuvidí. Rovnaký doplnok už raz potreboval príjem dokladov mailom.
grant select, insert, update, delete on public.inbox_verifications to service_role;
