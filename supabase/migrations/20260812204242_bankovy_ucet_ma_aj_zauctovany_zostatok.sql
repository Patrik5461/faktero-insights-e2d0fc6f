-- Banka posiela dve čísla: disponibilný zostatok (to, čo vidno v internet
-- bankingu) a zaúčtovaný. Doteraz sa ukladalo len jedno a záležalo na poradí
-- v odpovedi, ktoré to bude — účet v ČSOB tak ukazoval 4 593,78 € namiesto
-- skutočných 204 575,08 €. `balance` je odteraz disponibilný zostatok,
-- `booked_balance` zaúčtovaný (NULL = banka poslala len jedno číslo).
alter table public.bank_accounts
  add column if not exists booked_balance numeric;

comment on column public.bank_accounts.balance is 'Disponibilný zostatok — číslo, ktoré klient vidí v banke.';
comment on column public.bank_accounts.booked_balance is 'Zaúčtovaný zostatok. NULL, keď ho banka neposlala.';
