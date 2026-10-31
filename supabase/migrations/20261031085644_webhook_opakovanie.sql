-- Opakované doručenie webhookov s narastajúcim odstupom (1 min … 24 h, spolu 8 pokusov).
-- Stav: pending (prvý pokus), success, retrying (čaká na ďalší pokus), failed (vzdané).
-- Starý kód nové stĺpce nepozná a nechá ich prázdne — cron berie len riadky s next_attempt_at.
alter table public.webhook_delivery_logs
  add column if not exists next_attempt_at timestamptz,
  add column if not exists sending_until timestamptz,
  add column if not exists last_attempt_at timestamptz;

create index if not exists webhook_delivery_logs_na_rade_idx
  on public.webhook_delivery_logs (next_attempt_at)
  where status in ('pending', 'retrying');

-- Zvonček hľadá vzdané doručenia firmy.
create index if not exists webhook_delivery_logs_firma_stav_idx
  on public.webhook_delivery_logs (company_id, status, created_at desc);

comment on column public.webhook_delivery_logs.next_attempt_at is 'Kedy cron skúsi doručenie znova (len pending/retrying).';
comment on column public.webhook_delivery_logs.sending_until is 'Zámok rozbehnutého pokusu — cron ani „Poslať znova“ riadok dovtedy nevezmú.';
