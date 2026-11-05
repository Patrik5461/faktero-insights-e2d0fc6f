-- Párovanie iných dokladov (predpis poistného, platobný výmer, pokuta…) s pohybom
-- z účtu. Väzba je na pohybe, rovnako ako pri vydaných faktúrach
-- (matched_invoice_id), bločkoch (matched_expense_id) a prijatých faktúrach
-- (matched_purchase_invoice_id). Nič sa nepáruje samo — aplikácia len navrhuje
-- a potvrdzuje človek.
--
-- RLS: nové stĺpce sú na tabuľkách, ktoré už majú politiky po riadkoch
-- (bank_transactions: člen číta, správca + oblasť „banka“ na zápis;
-- other_documents: člen + oblasť „ostatne“). Práva sú na celej tabuľke
-- (`authenticated=arwd`), takže nové stĺpce netreba povoľovať zvlášť
-- a `firmy_s_pravom` pokrýva nové stĺpce samo.
--
-- Zámky: iné doklady nejdú do Pohody a nemajú `guard_locked_period` ani
-- `zamok_odovzdaneho_dokladu`. Úhrada (`paid_at`) je navyše zámerne voľná aj
-- pri faktúrach (pozri uzamknutie období) — inak by sa starší predpis nedal
-- označiť za zaplatený. VS a IBAN sú platobné údaje, nie údaje priznania.

-- 1) Väzba pohybu na iný doklad.
alter table public.bank_transactions
  add column if not exists matched_other_document_id uuid
    references public.other_documents(id) on delete set null;

comment on column public.bank_transactions.matched_other_document_id is
  'Iný doklad (predpis, výmer, pokuta…) uhradený týmto pohybom. Odchádzajúca platba.';

-- Jeden doklad = jeden pohyb (ako pri bločkoch), inak by figuroval uhradený dvakrát.
create unique index if not exists bank_transactions_matched_other_document_uniq
  on public.bank_transactions (matched_other_document_id)
  where matched_other_document_id is not null;

-- 2) Údaje na hľadanie platby a ručné „zaplatené“ bez pohybu (napr. v hotovosti na pošte).
alter table public.other_documents
  add column if not exists variable_symbol text,
  add column if not exists iban text,
  add column if not exists paid_at date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'other_documents_variable_symbol_dlzka') then
    alter table public.other_documents
      add constraint other_documents_variable_symbol_dlzka
      check (variable_symbol is null or char_length(variable_symbol) <= 20);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'other_documents_iban_dlzka') then
    alter table public.other_documents
      add constraint other_documents_iban_dlzka
      check (iban is null or char_length(iban) <= 34);
  end if;
end $$;

comment on column public.other_documents.variable_symbol is 'Variabilný symbol na úhradu (predpis SP/ZP, platobný výmer).';
comment on column public.other_documents.iban is 'IBAN, na ktorý sa doklad platí.';
comment on column public.other_documents.paid_at is 'Zaplatené bez pohybu z účtu (hotovosť, pošta) — dátum úhrady.';

-- 3) Strážca firmy: pohyb a doklad musia patriť tej istej firme (cudzí id by FK pustil).
-- Spúšťa sa aj pri zmene company_id, aby sa väzba nedala „preniesť“ do inej firmy.
create or replace function public.bank_transactions_iny_doklad_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.matched_other_document_id is not null and not exists (
    select 1 from public.other_documents d
    where d.id = new.matched_other_document_id and d.company_id = new.company_id
  ) then
    raise exception 'Doklad nepatrí k tejto firme' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.bank_transactions_iny_doklad_guard() from public, anon, authenticated;

drop trigger if exists bank_transactions_iny_doklad_guard on public.bank_transactions;
create trigger bank_transactions_iny_doklad_guard
  before insert or update of matched_other_document_id, company_id on public.bank_transactions
  for each row execute function public.bank_transactions_iny_doklad_guard();

-- 4) História: spárovanie/zrušenie platby sa zapíše aj k inému dokladu (agenda 'ostatny').
create or replace function public.faktero_historia_platby()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  _k record;
  _info jsonb := jsonb_build_object('suma', new.amount, 'mena', new.currency,
                                    'datum', new.booking_date, 'protistrana', new.counterparty);
  _stare uuid;
  _nove uuid;
  _agenda text;
  _i int;
begin
  select * into _k from public.faktero_kto_historie('{}'::jsonb, '{}'::jsonb, false);
  for _i in 1..4 loop
    _agenda := (array['faktura', 'prijata', 'doklad', 'ostatny'])[_i];
    _nove := case _i when 1 then new.matched_invoice_id when 2 then new.matched_purchase_invoice_id
                     when 3 then new.matched_expense_id else new.matched_other_document_id end;
    _stare := case when tg_op = 'INSERT' then null
                   else case _i when 1 then old.matched_invoice_id when 2 then old.matched_purchase_invoice_id
                                when 3 then old.matched_expense_id else old.matched_other_document_id end end;
    if _stare is distinct from _nove then
      if _stare is not null then
        insert into public.historia_dokladov(company_id, agenda, doklad_id, pole, pred, po, kto, kto_typ, kto_popis)
        values (new.company_id, _agenda, _stare, '_platba', _info, null, _k.kto, _k.typ, _k.popis);
      end if;
      if _nove is not null then
        insert into public.historia_dokladov(company_id, agenda, doklad_id, pole, pred, po, kto, kto_typ, kto_popis)
        values (new.company_id, _agenda, _nove, '_platba', null, _info, _k.kto, _k.typ, _k.popis);
      end if;
    end if;
  end loop;
  return new;
end
$function$;

drop trigger if exists bank_transactions_historia_vlozenie on public.bank_transactions;
create trigger bank_transactions_historia_vlozenie
  after insert on public.bank_transactions
  for each row
  when (new.matched_invoice_id is not null or new.matched_purchase_invoice_id is not null
        or new.matched_expense_id is not null or new.matched_other_document_id is not null)
  execute function public.faktero_historia_platby();

drop trigger if exists bank_transactions_historia_parovanie on public.bank_transactions;
create trigger bank_transactions_historia_parovanie
  after update of matched_invoice_id, matched_purchase_invoice_id, matched_expense_id, matched_other_document_id
  on public.bank_transactions
  for each row
  when (old.matched_invoice_id is distinct from new.matched_invoice_id
        or old.matched_purchase_invoice_id is distinct from new.matched_purchase_invoice_id
        or old.matched_expense_id is distinct from new.matched_expense_id
        or old.matched_other_document_id is distinct from new.matched_other_document_id)
  execute function public.faktero_historia_platby();

-- História iného dokladu sleduje aj nové polia.
drop trigger if exists other_documents_historia on public.other_documents;
create trigger other_documents_historia
  after insert or update on public.other_documents
  for each row execute function public.zapis_historiu_dokladu(
    'kind', 'sender', 'subject', 'received_date', 'amount', 'currency', 'due_date', 'note', 'status',
    'employee_id', 'financing_contract_id', 'priecinok', 'exported_at', 'stitky',
    'variable_symbol', 'iban', 'paid_at');

-- 5) Pravidlá „Spárované bez dokladu“ nesmú označiť pohyb, ktorý už uhrádza iný doklad.
create or replace function public.faktero_vybav_pohyby_pravidlami(_company uuid)
 returns integer
 language plpgsql
 set search_path to 'public'
as $function$
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
       and t.matched_other_document_id is null
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
$function$;

revoke all on function public.faktero_vybav_pohyby_pravidlami(uuid) from public, anon;
grant execute on function public.faktero_vybav_pohyby_pravidlami(uuid) to authenticated, service_role;
