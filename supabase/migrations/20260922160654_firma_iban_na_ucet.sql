-- IBAN zapísaný priamo do firmy (onboarding, založenie firmy v appke, API),
-- keď firma ešte nemá žiadny bankový účet, sa stane jej predvoleným účtom.
create or replace function public.companies_iban_na_ucet()
returns trigger language plpgsql security definer set search_path = public as $$
declare i text := upper(regexp_replace(coalesce(new.iban, ''), '\s', '', 'g'));
begin
  if i ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$'
     and not exists (select 1 from public.company_bank_accounts where company_id = new.id) then
    insert into public.company_bank_accounts (company_id, name, iban, swift, is_default)
    values (new.id, 'Hlavný účet', i, nullif(trim(coalesce(new.swift, '')), ''), true)
    on conflict do nothing;
  end if;
  return null;
end $$;
revoke all on function public.companies_iban_na_ucet() from public;
create trigger companies_iban_na_ucet after insert or update of iban on public.companies
  for each row execute function public.companies_iban_na_ucet();
