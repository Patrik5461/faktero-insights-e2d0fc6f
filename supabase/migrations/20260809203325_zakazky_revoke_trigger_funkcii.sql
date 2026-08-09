-- Trigger funkcie nemajú byť volateľné cez REST. Postgres dáva `EXECUTE`
-- automaticky roli PUBLIC, takže bez tohto sa dajú zavolať aj neprihláseným
-- používateľom cez /rest/v1/rpc/... — rovnaká pasca ako pri RPC v auguste.
--
-- Právo na spustenie trigger funkcie sa overuje pri CREATE TRIGGER, nie pri
-- každom spustení, takže odobratie na už vytvorené triggery nemá vplyv.
revoke all on function public.jobs_guard_assignment() from public, anon, authenticated;
revoke all on function public.jobs_block_delete_with_documents() from public, anon, authenticated;
