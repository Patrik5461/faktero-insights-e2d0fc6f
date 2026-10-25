-- Kedy sa z účtu naposledy podarilo stiahnuť pohyby a prečo to naposledy zlyhalo.
-- Zostatok banka vydá aj po vypršaní súhlasu na čítanie pohybov (SCA expired),
-- takže účet vyzeral živý a platby pritom týždne nechodili.
alter table public.bank_accounts
  add column if not exists pohyby_ok_at timestamptz,
  add column if not exists pohyby_chyba text;

update public.bank_accounts a
   set pohyby_ok_at = t.posledne
  from (select bank_account_id, max(created_at) posledne from public.bank_transactions group by bank_account_id) t
 where t.bank_account_id = a.id and a.pohyby_ok_at is null;
