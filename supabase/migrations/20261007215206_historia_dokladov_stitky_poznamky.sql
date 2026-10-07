create table if not exists public.historia_dokladov (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agenda text not null check (agenda in ('prijata','doklad')),
  doklad_id uuid not null,
  pole text not null,
  pred jsonb,
  po jsonb,
  kto uuid,
  kedy timestamptz not null default now()
);
create index if not exists historia_dokladov_doklad on public.historia_dokladov (doklad_id, kedy desc);
comment on table public.historia_dokladov is 'História zmien prijatých faktúr a bločkov: pole, hodnota pred a po, kto a kedy. Zapisuje ju len spúšťač.';

alter table public.historia_dokladov enable row level security;
create policy "clenovia citaju historiu" on public.historia_dokladov for select to authenticated
  using (public.is_company_member(company_id, (select auth.uid())));
create policy "mfa ak je zapnute" on public.historia_dokladov as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
select public.vlastny_pristup_politiky_na('historia_dokladov', 'company_id', 'doklady');
revoke all on public.historia_dokladov from public, anon;
grant select on public.historia_dokladov to authenticated;
grant all on public.historia_dokladov to service_role;

create or replace function public.zapis_historiu_dokladu()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  _stare jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  _nove jsonb := to_jsonb(new);
  _agenda text := case tg_table_name when 'purchase_invoices' then 'prijata' else 'doklad' end;
  _s text;
begin
  if tg_op = 'INSERT' then
    insert into public.historia_dokladov(company_id, agenda, doklad_id, pole, pred, po, kto)
    values (new.company_id, _agenda, new.id, '_vytvoreny', null, null, coalesce(auth.uid(), (_nove ->> 'created_by')::uuid));
    return new;
  end if;
  foreach _s in array tg_argv loop
    if (_stare -> _s) is distinct from (_nove -> _s) then
      insert into public.historia_dokladov(company_id, agenda, doklad_id, pole, pred, po, kto)
      values (new.company_id, _agenda, new.id, _s, _stare -> _s, _nove -> _s, auth.uid());
    end if;
  end loop;
  return new;
end
$function$;
revoke all on function public.zapis_historiu_dokladu() from public, anon;

drop trigger if exists purchase_invoices_historia on public.purchase_invoices;
create trigger purchase_invoices_historia after insert or update on public.purchase_invoices
  for each row execute function public.zapis_historiu_dokladu(
    'invoice_number','supplier_name','supplier_ico','supplier_iban','issue_date','delivery_date','due_date',
    'amount_without_vat','vat_amount','amount_total','currency','variable_symbol','payment_method','status',
    'pohoda_predkontacia','pohoda_clenenie_dph','kv_clenenie','stredisko','cinnost','job_id','category','note',
    'zauctovane_at','exported_at','locked_at','deleted_at','stitky');
drop trigger if exists expense_documents_historia on public.expense_documents;
create trigger expense_documents_historia after insert or update on public.expense_documents
  for each row execute function public.zapis_historiu_dokladu(
    'supplier_name','supplier_ico','document_number','issue_date','total_amount','vat_amount','net_amount',
    'currency','payment_method','status','pohoda_predkontacia','pohoda_clenenie_dph','kv_clenenie','stredisko',
    'cinnost','job_id','category','note','exported_at','locked_at','stitky');

-- Štítky dokladu (najviac 5) a preddefinované poznámky firmy.
alter table public.purchase_invoices add column if not exists stitky text[] not null default '{}';
alter table public.expense_documents add column if not exists stitky text[] not null default '{}';
alter table public.purchase_invoices drop constraint if exists purchase_invoices_stitky_max;
alter table public.purchase_invoices add constraint purchase_invoices_stitky_max check (cardinality(stitky) <= 5);
alter table public.expense_documents drop constraint if exists expense_documents_stitky_max;
alter table public.expense_documents add constraint expense_documents_stitky_max check (cardinality(stitky) <= 5);
alter table public.companies add column if not exists preddefinovane_poznamky text[] not null default '{}';
