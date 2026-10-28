-- Vypršaný prístup podpory ruší server (hook /api/public/hooks/podpora-pristupy),
-- cron ho volá každú minútu s tou istou hlavičkou ako ostatné hooky Faktera.
select cron.schedule(
  'faktero-podpora-pristupy-expiracia',
  '* * * * *',
  replace(
    (select command from cron.job where jobname = 'faktero-auto-uctovanie'),
    '/api/public/hooks/auto-uctovanie',
    '/api/public/hooks/podpora-pristupy'
  )
);
