-- Bankový pohyb vybavený bez dokladu: „Pohyb nemá doklad“ a transakčná daň (zákon 235/2024 Z. z.).
-- Pravidlá pre banku s výsledkom „Spárované bez dokladu“ sa uplatnia hneď pri príchode pohybu.

alter table public.bank_transactions
  add column if not exists counterparty_iban text,
  add column if not exists vybavenie text,
  add column if not exists vybavenie_poznamka text,
  add column if not exists vybavenie_pravidlo_id uuid references public.pravidla_uctovania(id) on delete set null,
  add column if not exists vybavene_at timestamptz,
  add column if not exists vybavil uuid references auth.users(id) on delete set null;

alter table public.bank_transactions
  drop constraint if exists bank_transactions_vybavenie_check,
  add constraint bank_transactions_vybavenie_check
    check (vybavenie is null or vybavenie in ('bez_dokladu', 'transakcna_dan')),
  drop constraint if exists bank_transactions_vybavenie_poznamka_dlzka,
  add constraint bank_transactions_vybavenie_poznamka_dlzka
    check (vybavenie_poznamka is null or char_length(vybavenie_poznamka) <= 200);

comment on column public.bank_transactions.vybavenie is
  'Pohyb vybavený bez dokladu: bez_dokladu (ručne alebo pravidlom), transakcna_dan. Nepatrí medzi nespárované.';
comment on column public.bank_transactions.counterparty_iban is 'IBAN protistrany, keď ho banka alebo výpis uvádza.';

create index if not exists bank_transactions_vybavenie_idx
  on public.bank_transactions (company_id) where vybavenie is not null;

-- Pravidlo pre banku: IBAN protistrany (variabilny_symbol už je z pravidiel pre faktúry) a výsledok „Spárované bez dokladu“.
alter table public.pravidla_uctovania
  add column if not exists iban_protistrany text,
  add column if not exists bez_dokladu boolean not null default false;

alter table public.pravidla_uctovania
  drop constraint if exists pravidla_uctovania_podmienka,
  add constraint pravidla_uctovania_podmienka check (
    coalesce(nullif(btrim(dodavatel_ico), ''), nullif(btrim(dodavatel_text), ''),
             nullif(btrim(sposob_uhrady), ''), nullif(btrim(predmet_text), ''),
             pouzivatel_id::text, nullif(btrim(typ_dokladu), ''),
             nullif(btrim(bankovy_ucet), ''), smer, nullif(btrim(oznacenie), ''),
             nullif(btrim(odosielatel_text), ''), nullif(btrim(krajina), ''),
             nullif(btrim(variabilny_symbol), ''), nullif(btrim(iban_protistrany), '')) is not null),
  drop constraint if exists pravidla_uctovania_akcia,
  add constraint pravidla_uctovania_akcia check (
    coalesce(nullif(btrim(kategoria), ''), nullif(btrim(predkontacia), ''),
             nullif(btrim(clenenie_dph), ''), nullif(btrim(poznamka), ''),
             nullif(btrim(kv_clenenie), ''), nullif(btrim(pokladna), ''),
             rozuctovanie::text) is not null
    or odpocet is not null or bez_dokladu),
  drop constraint if exists pravidla_uctovania_banka,
  add constraint pravidla_uctovania_banka check (
    druh is distinct from 'banka' or nullif(btrim(predkontacia), '') is not null or bez_dokladu),
  drop constraint if exists pravidla_uctovania_bez_dokladu,
  add constraint pravidla_uctovania_bez_dokladu check (not bez_dokladu or druh = 'banka');

-- Banka sama označila pohyb ako transakčnú daň? Zhodné s `jeTransakcnaDan` v pohyb-vybavenie.ts.
create or replace function public.faktero_je_transakcna_dan(_popis text, _protistrana text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select translate(lower(coalesce(_popis, '') || ' ' || coalesce(_protistrana, '')),
                   'áäčďéěíĺľňóôŕřšťúůýž', 'aacdeeillnoorrstuuyz')
         ~ '(transakcn[a-z]*\s+dan|transaction\s+tax|financial\s+transaction\s+tax)'
$$;

-- Pravidlo „Spárované bez dokladu“ pre pohyb. Zhodné s `pravidloBezDokladu` v pohyb-vybavenie.ts.
create or replace function public.faktero_pravidlo_bez_dokladu(
  _company uuid, _ucet text, _suma numeric, _iban text, _vs text, _protistrana text, _popis text)
returns public.pravidla_uctovania
language sql
stable
set search_path = public
as $$
  select p.*
    from public.pravidla_uctovania p
   where p.company_id = _company
     and p.aktivne
     and p.druh = 'banka'
     and p.bez_dokladu
     -- Typ pohybu sa pozná až pri výpise do Pohody, pri príchode pohybu ho nevieme.
     and nullif(btrim(p.oznacenie), '') is null
     -- Samotný účet či smer by vybavil všetko — treba aspoň protistranu, IBAN alebo VS.
     and (nullif(btrim(p.iban_protistrany), '') is not null
          or nullif(btrim(p.variabilny_symbol), '') is not null
          or nullif(btrim(p.dodavatel_text), '') is not null)
     and (nullif(btrim(p.bankovy_ucet), '') is null
          or upper(regexp_replace(p.bankovy_ucet, '\s', '', 'g'))
             = upper(regexp_replace(coalesce(_ucet, ''), '\s', '', 'g')))
     and (p.smer is null or p.smer = case when _suma < 0 then 'vydaj' else 'prijem' end)
     and (nullif(btrim(p.iban_protistrany), '') is null
          or upper(regexp_replace(p.iban_protistrany, '\s', '', 'g'))
             = upper(regexp_replace(coalesce(_iban, ''), '\s', '', 'g')))
     and (nullif(btrim(p.variabilny_symbol), '') is null
          or (ltrim(regexp_replace(coalesce(_vs, ''), '\D', '', 'g'), '0') <> ''
              and ltrim(regexp_replace(p.variabilny_symbol, '\D', '', 'g'), '0')
                  = ltrim(regexp_replace(coalesce(_vs, ''), '\D', '', 'g'), '0')))
     and (nullif(btrim(p.dodavatel_text), '') is null
          or translate(lower(coalesce(_protistrana, '') || ' ' || coalesce(_popis, '')),
                       'áäčďéěíĺľňóôŕřšťúůýž', 'aacdeeillnoorrstuuyz')
             like '%' || translate(lower(btrim(p.dodavatel_text)),
                                   'áäčďéěíĺľňóôŕřšťúůýž', 'aacdeeillnoorrstuuyz') || '%')
   order by p.poradie,
            ((nullif(btrim(p.bankovy_ucet), '') is not null)::int + (p.smer is not null)::int
             + (nullif(btrim(p.iban_protistrany), '') is not null)::int
             + (nullif(btrim(p.variabilny_symbol), '') is not null)::int
             + (nullif(btrim(p.dodavatel_text), '') is not null)::int) desc,
            p.created_at
   limit 1
$$;

-- Pri príchode pohybu (TB, Wise, Revolut, Wallester, nahratý výpis, e-mail, API).
create or replace function public.faktero_vybav_novy_pohyb()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.pravidla_uctovania;
  ucet text;
begin
  if new.vybavenie is not null
     or new.matched_invoice_id is not null or new.matched_purchase_invoice_id is not null
     or new.matched_expense_id is not null or new.matched_installment_id is not null then
    return new;
  end if;
  if coalesce(new.amount, 0) < 0 and public.faktero_je_transakcna_dan(new.description, new.counterparty) then
    new.vybavenie := 'transakcna_dan';
    new.vybavene_at := now();
    return new;
  end if;
  select iban into ucet from public.bank_accounts where id = new.bank_account_id;
  r := public.faktero_pravidlo_bez_dokladu(new.company_id, ucet, new.amount, new.counterparty_iban,
                                           new.variable_symbol, new.counterparty, new.description);
  if r.id is not null then
    new.vybavenie := 'bez_dokladu';
    new.vybavenie_pravidlo_id := r.id;
    new.vybavenie_poznamka := left(nullif(btrim(public.faktero_premenne_poznamky(coalesce(r.poznamka, ''), new.booking_date)), ''), 200);
    new.vybavene_at := now();
  end if;
  return new;
end
$$;

drop trigger if exists bank_transactions_vybavenie on public.bank_transactions;
create trigger bank_transactions_vybavenie
  before insert on public.bank_transactions
  for each row execute function public.faktero_vybav_novy_pohyb();

-- Uplatní pravidlá „bez dokladu“ na staršie nespárované pohyby firmy (po uložení pravidla).
-- Beží s právami volajúceho, takže zapíše len to, čo mu RLS dovolí.
create or replace function public.faktero_vybav_pohyby_pravidlami(_company uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  with kandidati as (
    select t.id, r.id as pravidlo_id, r.poznamka, t.booking_date
      from public.bank_transactions t
      left join public.bank_accounts a on a.id = t.bank_account_id
      cross join lateral public.faktero_pravidlo_bez_dokladu(
        t.company_id, a.iban, t.amount, t.counterparty_iban, t.variable_symbol, t.counterparty, t.description) r
     where t.company_id = _company
       and t.vybavenie is null
       and t.matched_invoice_id is null and t.matched_purchase_invoice_id is null
       and t.matched_expense_id is null and t.matched_installment_id is null
       and not exists (select 1 from public.payments p where p.bank_transaction_id = t.id)
       and not exists (select 1 from public.financing_charges f where f.bank_transaction_id = t.id)
       and r.id is not null
  )
  update public.bank_transactions t
     set vybavenie = 'bez_dokladu',
         vybavenie_pravidlo_id = k.pravidlo_id,
         vybavenie_poznamka = left(nullif(btrim(public.faktero_premenne_poznamky(coalesce(k.poznamka, ''), k.booking_date)), ''), 200),
         vybavene_at = now()
    from kandidati k
   where t.id = k.id;
  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.faktero_je_transakcna_dan(text, text) from public, anon;
revoke all on function public.faktero_pravidlo_bez_dokladu(uuid, text, numeric, text, text, text, text) from public, anon;
revoke all on function public.faktero_vybav_novy_pohyb() from public, anon, authenticated;
revoke all on function public.faktero_vybav_pohyby_pravidlami(uuid) from public, anon;
grant execute on function public.faktero_je_transakcna_dan(text, text) to authenticated, service_role;
grant execute on function public.faktero_pravidlo_bez_dokladu(uuid, text, numeric, text, text, text, text) to authenticated, service_role;
grant execute on function public.faktero_vybav_novy_pohyb() to service_role;
grant execute on function public.faktero_vybav_pohyby_pravidlami(uuid) to authenticated, service_role;

-- Jednorazovo: pohyby, ktoré banka sama nazvala transakčnou daňou (len tento príznak).
update public.bank_transactions t
   set vybavenie = 'transakcna_dan', vybavene_at = now()
 where t.vybavenie is null
   and t.amount < 0
   and public.faktero_je_transakcna_dan(t.description, t.counterparty)
   and t.matched_invoice_id is null and t.matched_purchase_invoice_id is null
   and t.matched_expense_id is null and t.matched_installment_id is null
   and not exists (select 1 from public.payments p where p.bank_transaction_id = t.id)
   and not exists (select 1 from public.financing_charges f where f.bank_transaction_id = t.id);
