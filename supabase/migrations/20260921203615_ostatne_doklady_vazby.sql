-- Ostatný doklad sa dá priradiť k zamestnancovi (exekúcia) a k zmluve
-- o leasingu či úvere. ON DELETE SET NULL: zmazaním zamestnanca či zmluvy
-- doklad nezmizne, len stratí väzbu.
alter table public.other_documents
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists financing_contract_id uuid references public.financing_contracts(id) on delete set null;

create index if not exists other_documents_employee_idx on public.other_documents (employee_id) where employee_id is not null;
create index if not exists other_documents_financing_idx on public.other_documents (financing_contract_id) where financing_contract_id is not null;

-- Väzba smie viesť len na zamestnanca a zmluvu tej istej firmy — inak by sa
-- cez vlastný doklad dalo odkazovať na cudzie záznamy.
create or replace function public.other_documents_vazby_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.employee_id is not null and not exists (
    select 1 from public.employees e where e.id = new.employee_id and e.company_id = new.company_id
  ) then
    raise exception 'Zamestnanec nepatrí k tejto firme';
  end if;
  if new.financing_contract_id is not null and not exists (
    select 1 from public.financing_contracts f where f.id = new.financing_contract_id and f.company_id = new.company_id
  ) then
    raise exception 'Zmluva nepatrí k tejto firme';
  end if;
  return new;
end $$;

revoke all on function public.other_documents_vazby_guard() from public;

create trigger other_documents_vazby_guard
  before insert or update of employee_id, financing_contract_id, company_id on public.other_documents
  for each row execute function public.other_documents_vazby_guard();
