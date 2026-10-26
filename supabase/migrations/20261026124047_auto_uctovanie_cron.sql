-- Fronta automatického zaúčtovania každú minútu. Príkaz (s tokenom) sa
-- skopíruje z úlohy webhook-outbox, aby sa token nemusel písať do migrácie.
select cron.unschedule('faktero-auto-uctovanie') where exists (select 1 from cron.job where jobname = 'faktero-auto-uctovanie');
select cron.schedule(
  'faktero-auto-uctovanie',
  '* * * * *',
  replace(command, '/api/public/hooks/webhook-outbox', '/api/public/hooks/auto-uctovanie')
) from cron.job where jobname = 'faktero-webhook-outbox';
