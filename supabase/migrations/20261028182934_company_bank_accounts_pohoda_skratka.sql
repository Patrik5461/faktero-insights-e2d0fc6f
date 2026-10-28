-- Skratka bankového účtu v Pohode (napr. „TB", „VUB") — faktúra s týmto účtom
-- ide do Pohody s touto skratkou namiesto spoločnej companies.pohoda_banka.
alter table public.company_bank_accounts add column if not exists pohoda_skratka text;
comment on column public.company_bank_accounts.pohoda_skratka is 'Skratka bankového účtu v Pohode (pre účtovníctvo); prázdne = companies.pohoda_banka.';
