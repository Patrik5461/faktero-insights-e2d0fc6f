-- Tabuľka vznikla mimo dashboardu, takže nedostala štandardné granty ako
-- ostatné tabuľky. Zarovnávame ich s bank_accounts; RLS naďalej rozhoduje,
-- kto reálne ktorý riadok uvidí.
grant select, insert, update, delete on public.bank_statements to authenticated;
grant select, insert, update, delete, references, trigger, truncate on public.bank_statements to service_role;
