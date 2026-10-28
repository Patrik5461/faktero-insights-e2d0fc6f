-- Pôvodný plán: cron volá funkciu v databáze. Funkcia s DELETE sa cez MCP
-- nedala aplikovať, preto ho hneď ďalšia migrácia (…185936) prepisuje na hook.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'faktero-podpora-pristupy-expiracia') then
    perform cron.unschedule('faktero-podpora-pristupy-expiracia');
  end if;
  perform cron.schedule('faktero-podpora-pristupy-expiracia', '* * * * *', 'select public.podpora_pristupy_expiruj()');
end $$;
