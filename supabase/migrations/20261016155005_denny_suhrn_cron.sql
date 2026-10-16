-- 3) Cron. Beží o 5:00 aj 6:00 UTC — jeden z behov je 7:00 v Bratislave
--    (letný čas 5:00 UTC, zimný 6:00 UTC). Hook pustí ďalej len ten, ktorý
--    v Bratislave trafí 7:00; druhý hneď odpovie „preskočené". Hook odpovedá
--    hneď (202) a posiela na pozadí, takže timeout pg_net stačí krátky.
--
--    Tajomstvo: hlavička `x-faktero-cron-token` = FAKTERO_CRON_TOKEN zo
--    servera (ecosystem.config.cjs) — tá istá, ktorú používajú stock-alerts,
--    zamestnanci-pripomienky, reminders a ďalšie hooky. Token sa prevezme
--    z existujúceho jobu `faktero-stock-alerts-daily`, aby nebol v gite.
do $$
declare
  _token text;
begin
  select substring(command from $r$'x-faktero-cron-token'\s*,\s*'([^']+)'$r$)
    into _token
  from cron.job
  where jobname = 'faktero-stock-alerts-daily';
  if _token is null then
    raise exception 'Token cronu sa nepodarilo prevziať z faktero-stock-alerts-daily';
  end if;

  if exists (select 1 from cron.job where jobname = 'faktero-denny-suhrn') then
    perform cron.unschedule('faktero-denny-suhrn');
  end if;

  perform cron.schedule(
    'faktero-denny-suhrn',
    '0 5,6 * * *',
    format($c$
  SELECT net.http_post(
    url := 'https://www.faktero.sk/api/public/hooks/denny-suhrn',
    headers := jsonb_build_object('Content-Type','application/json','x-faktero-cron-token',%L),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$c$, _token)
  );
end $$;

-- Ručné spustenie zo servera (nanečisto — nič nepošle, výsledok v pm2 logu):
--   curl -X POST https://www.faktero.sk/api/public/hooks/denny-suhrn \
--     -H "x-faktero-cron-token: $FAKTERO_CRON_TOKEN" -H 'content-type: application/json' \
--     -d '{"hocikedy":true,"nanecisto":true}'
