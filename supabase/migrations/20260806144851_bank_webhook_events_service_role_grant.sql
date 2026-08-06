-- Tabuľku zapisuje výhradne serverový kód pod service_role; tá pri vytvorení
-- nedostala default privilégiá, takže insert končil na "permission denied".
grant select, insert, update, delete on public.bank_webhook_events to service_role;
