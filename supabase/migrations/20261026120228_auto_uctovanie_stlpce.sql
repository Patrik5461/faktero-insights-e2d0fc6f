-- Automatické zaúčtovanie: nastavenie firmy a stopa po automate na dokladoch.
alter table public.companies
  add column if not exists auto_uctovanie_rezim text not null default 'bezpecny',
  add column if not exists auto_uctovanie_limit numeric(14,2) not null default 5000,
  add column if not exists auto_uctovanie_od timestamptz not null default now();
alter table public.companies drop constraint if exists companies_auto_uctovanie_rezim_check;
alter table public.companies add constraint companies_auto_uctovanie_rezim_check
  check (auto_uctovanie_rezim in ('vypnuty','bezpecny','plny'));
alter table public.companies drop constraint if exists companies_auto_uctovanie_limit_check;
alter table public.companies add constraint companies_auto_uctovanie_limit_check
  check (auto_uctovanie_limit >= 0);

alter table public.expense_documents
  add column if not exists zauctovane_at timestamptz,
  add column if not exists zauctoval uuid references auth.users(id) on delete set null;

do $$
declare t text;
begin
  foreach t in array array['purchase_invoices','expense_documents','invoices'] loop
    execute format('alter table public.%I
      add column if not exists zauctovanie_zdroj text,
      add column if not exists zauctovanie_istota smallint,
      add column if not exists auto_uctovanie_navrh jsonb,
      add column if not exists auto_uctovanie_at timestamptz', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_zauctovanie_zdroj_check');
    execute format($c$alter table public.%I add constraint %I check (zauctovanie_zdroj in ('pravidlo','zvyk','ai','manual'))$c$, t, t || '_zauctovanie_zdroj_check');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_zauctovanie_istota_check');
    execute format('alter table public.%I add constraint %I check (zauctovanie_istota between 0 and 100)', t, t || '_zauctovanie_istota_check');
    execute format('create index if not exists %I on public.%I (company_id, created_at) where auto_uctovanie_at is null and zauctovane_at is null', t || '_auto_uctovanie_fronta', t);
  end loop;
end $$;
