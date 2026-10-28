-- Faktúra slúži zároveň ako dodací list (iný nadpis v PDF + podpisy odovzdania a prevzatia).
alter table public.invoices add column if not exists dodaci_list boolean not null default false;
-- Pečiatka a podpis na tejto faktúre; NULL = podľa nastavenia firmy (companies.invoice_show_stamp).
alter table public.invoices add column if not exists zobrazit_peciatku boolean;
-- Predvolený text nad položkami novej faktúry (napr. „Fakturujeme vám:“); NULL = podľa jazyka dokladu.
alter table public.companies add column if not exists invoice_intro_default text;
comment on column public.invoices.dodaci_list is 'Faktúra slúži zároveň ako dodací list';
comment on column public.invoices.zobrazit_peciatku is 'Pečiatka a podpis v PDF; NULL = podľa companies.invoice_show_stamp';
comment on column public.companies.invoice_intro_default is 'Predvolený text nad položkami novej faktúry';
