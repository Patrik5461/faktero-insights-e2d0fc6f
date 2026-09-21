-- Denné pripomienky k zamestnancom o 7:15 UTC. Token na hook sa prevezme z
-- existujúceho jobu, aby tajomstvo nebolo v texte migrácie ani v gite.
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

  if exists (select 1 from cron.job where jobname = 'faktero-zamestnanci-pripomienky-daily') then
    perform cron.unschedule('faktero-zamestnanci-pripomienky-daily');
  end if;

  perform cron.schedule(
    'faktero-zamestnanci-pripomienky-daily',
    '15 7 * * *',
    format($c$
  SELECT net.http_post(
    url := 'https://www.faktero.sk/api/public/hooks/zamestnanci-pripomienky',
    headers := jsonb_build_object('Content-Type','application/json','x-faktero-cron-token',%L),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$c$, _token)
  );
end $$;
