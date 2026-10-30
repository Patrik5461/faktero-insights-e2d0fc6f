-- Predvolený dátum dokladov podľa Bratislavy, nie UTC.
-- CURRENT_DATE v databáze (časové pásmo UTC) dával medzi polnocou a 1:00/2:00
-- včerajšok — doklad bez výslovného dátumu tak 1. 1. spadol do minulého roka.
alter table public.invoices alter column issue_date set default ((now() at time zone 'Europe/Bratislava')::date);
alter table public.invoices alter column due_date set default ((now() at time zone 'Europe/Bratislava')::date + 14);
alter table public.quotes alter column issue_date set default ((now() at time zone 'Europe/Bratislava')::date);
alter table public.payments alter column paid_at set default ((now() at time zone 'Europe/Bratislava')::date);
alter table public.purchase_invoice_payments alter column paid_at set default ((now() at time zone 'Europe/Bratislava')::date);
alter table public.other_documents alter column received_date set default ((now() at time zone 'Europe/Bratislava')::date);
alter table public.purchase_orders alter column order_date set default ((now() at time zone 'Europe/Bratislava')::date);
alter table public.sales_orders alter column order_date set default ((now() at time zone 'Europe/Bratislava')::date);
alter table public.cash_entries alter column entry_date set default ((now() at time zone 'Europe/Bratislava')::date);
alter table public.price_actions alter column valid_from set default ((now() at time zone 'Europe/Bratislava')::date);
