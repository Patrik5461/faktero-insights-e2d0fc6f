-- Zoznam odoslaných upomienok: kto upomienku odoslal ručne (pri automatickej
-- z cronu ostáva prázdne) a index na výpis firmy zoradený podľa času.
alter table public.invoice_reminders
  add column if not exists sent_by uuid references auth.users(id) on delete set null;

comment on column public.invoice_reminders.sent_by is
  'Kto upomienku odoslal ručne; NULL = automaticky (cron) alebo starší záznam.';

create index if not exists idx_invoice_reminders_company_sent
  on public.invoice_reminders (company_id, sent_at desc);

create index if not exists idx_invoice_reminders_sent_by
  on public.invoice_reminders (sent_by) where sent_by is not null;
