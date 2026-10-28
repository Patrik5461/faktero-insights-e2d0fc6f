-- 4) Predvolená zákazka používateľa sa doplní na jeho bloček a prijatú faktúru.
create or replace function public.predvolena_zakazka_dokladu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _job uuid;
begin
  if new.job_id is null then
    select cu.predvolena_zakazka_id into _job
      from public.company_users cu
      join public.jobs j on j.id = cu.predvolena_zakazka_id
     where cu.company_id = new.company_id
       and cu.user_id = coalesce(new.created_by, auth.uid())
       and j.company_id = new.company_id
       and j.status is distinct from 'closed';
    if _job is not null then
      new.job_id := _job;
    end if;
  end if;
  return new;
end
$$;
revoke all on function public.predvolena_zakazka_dokladu() from public, anon, authenticated;
create or replace trigger expense_documents_predvolena_zakazka before insert on public.expense_documents
  for each row execute function public.predvolena_zakazka_dokladu();
create or replace trigger purchase_invoices_predvolena_zakazka before insert on public.purchase_invoices
  for each row execute function public.predvolena_zakazka_dokladu();

-- 5) Párovanie mobilnej appky: jednorazový krátkodobý token, uložený len ako hash.
create table if not exists public.parovanie_zariadenia (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  pouzite_at timestamptz,
  created_at timestamptz not null default now(),
  ip text,
  zariadenie text
);
create index if not exists parovanie_zariadenia_user on public.parovanie_zariadenia (user_id, created_at desc);

alter table public.parovanie_zariadenia enable row level security;
create policy "vlastne parovanie" on public.parovanie_zariadenia for select to authenticated
  using (user_id = (select auth.uid()));
create policy "mfa ak je zapnute" on public.parovanie_zariadenia as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
revoke all on public.parovanie_zariadenia from public, anon;
grant select on public.parovanie_zariadenia to authenticated;
grant all on public.parovanie_zariadenia to service_role;
