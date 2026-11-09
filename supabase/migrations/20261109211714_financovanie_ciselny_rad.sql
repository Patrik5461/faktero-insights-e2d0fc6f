-- Vlastný číselný rad splátok leasingu, úveru a kontokorentu.
--
-- Rad je obyčajný `number_series` s novým druhom 'financing' — tá istá šablóna
-- ({YYYY}, {YY}, {MM}, {NN}…{NNNNNN}), `start_from` a správa v Nastavenia →
-- Číselné rady. Kalendár (zmluva) si rad vyberie v `number_series_id`; bez neho
-- splátka vlastné číslo nemá a číslo jej pridelí Pohoda pri importe.
--
-- Každá splátka dostane číslo dokladu (`cislo_dokladu`) podľa dátumu
-- splatnosti a poradia splátky. Raz pridelené číslo sa nemení — prepočet
-- kalendára riadky prepisuje na mieste (podľa `number`), stĺpec nechá tak a
-- spúšťač nižšie stráži, že ho nič neprepíše ani nezmaže.

-- 1. Druh radu
alter table public.number_series drop constraint if exists number_series_kind_check;
alter table public.number_series add constraint number_series_kind_check check (
  kind = any (array['invoice','proforma','credit_note','debit_note','advance_payment','quote',
                    'sales_order','purchase_order','cash','self_billing','financing'])
);

create or replace function public.faktero_nazov_radu(_kind text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case _kind
           when 'invoice' then 'Faktúry'
           when 'credit_note' then 'Dobropisy'
           when 'debit_note' then 'Ťarchopisy'
           when 'proforma' then 'Zálohové faktúry'
           when 'advance_payment' then 'Doklady k prijatej platbe'
           when 'quote' then 'Cenové ponuky'
           when 'sales_order' then 'Prijaté objednávky'
           when 'purchase_order' then 'Objednávky u dodávateľa'
           when 'cash' then 'Pokladničné doklady'
           when 'self_billing' then 'Samofaktúry'
           when 'financing' then 'Splátky leasingov a úverov'
           else 'Doklady'
         end;
$function$;

create or replace function public.faktero_predvolena_sablona(_company_id uuid, _kind text)
 returns text
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  _zaklad text;
begin
  select coalesce(nullif(btrim(invoice_number_format), ''), '{YYYY}{NNNN}')
    into _zaklad
    from public.companies
   where id = _company_id;
  _zaklad := coalesce(_zaklad, '{YYYY}{NNNN}');

  return case _kind
           when 'invoice' then _zaklad
           when 'credit_note' then _zaklad
           when 'debit_note' then _zaklad
           when 'proforma' then 'ZF' || _zaklad
           when 'advance_payment' then 'DDP' || _zaklad
           when 'quote' then 'Q{YYYY}{NNNN}'
           when 'sales_order' then 'OBJ{YYYY}{NNNN}'
           when 'purchase_order' then 'OBJ{YYYY}{NNNN}'
           when 'cash' then 'PD{YYYY}{NNNN}'
           when 'self_billing' then 'SF{YYYY}{NNNN}'
           when 'financing' then 'SPL{YYYY}{NNNN}'
           else _zaklad
         end;
end;
$function$;

-- 2. Stĺpce
alter table public.financing_contracts
  add column if not exists number_series_id uuid references public.number_series(id) on delete set null;

alter table public.financing_installments
  add column if not exists cislo_dokladu text,
  add column if not exists number_series_id uuid references public.number_series(id) on delete set null;

create index if not exists financing_contracts_number_series_idx
  on public.financing_contracts (number_series_id) where number_series_id is not null;
create index if not exists financing_installments_number_series_idx
  on public.financing_installments (number_series_id) where number_series_id is not null;

-- Číslo dokladu je v rámci firmy jedinečné (rad môžu zdieľať viaceré kalendáre).
create unique index if not exists financing_installments_cislo_dokladu_key
  on public.financing_installments (company_id, cislo_dokladu)
  where cislo_dokladu is not null;

-- 3. Pridelené číslo sa nemení
create or replace function public.financing_installments_cislo_nemenne()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if old.cislo_dokladu is not null then
    new.cislo_dokladu := old.cislo_dokladu;
    new.number_series_id := old.number_series_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists financing_installments_cislo_nemenne on public.financing_installments;
create trigger financing_installments_cislo_nemenne
  before update on public.financing_installments
  for each row execute function public.financing_installments_cislo_nemenne();

-- 4. Obsadenosť a generátor poznajú nový druh
create or replace function public.faktero_cislo_obsadene(_company_id uuid, _kind text, _cislo text)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if _kind = 'quote' then
    return exists (select 1 from public.quotes
                    where company_id = _company_id and quote_number = _cislo);
  elsif _kind = 'sales_order' then
    return exists (select 1 from public.sales_orders
                    where company_id = _company_id and order_number = _cislo);
  elsif _kind = 'purchase_order' then
    return exists (select 1 from public.purchase_orders
                    where company_id = _company_id and order_number = _cislo);
  elsif _kind = 'cash' then
    return exists (select 1 from public.cash_entries
                    where company_id = _company_id and entry_number = _cislo);
  elsif _kind = 'self_billing' then
    return exists (select 1 from public.purchase_invoices
                    where company_id = _company_id and samofakturacia
                      and invoice_number = _cislo);
  elsif _kind = 'financing' then
    return exists (select 1 from public.financing_installments
                    where company_id = _company_id and cislo_dokladu = _cislo);
  end if;
  raise exception 'Druh dokladu % nemá vlastný rad.', _kind;
end;
$function$;
revoke all on function public.faktero_cislo_obsadene(uuid, text, text) from public, anon, authenticated;

create or replace function public.faktero_next_series_number(_company_id uuid, _kind text, _series_id uuid default null::uuid, _date date default null::date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  _uid uuid := auth.uid();
  _den date := coalesce(_date, (now() at time zone 'Europe/Bratislava')::date);
  _rad_id uuid;
  _format text;
  _od_poradia integer;
  _mesacny boolean;
  _od date;
  _do date;
  _strop integer;
  _i integer;
  _n integer;
  _cislo text;
  _volne boolean;
BEGIN IF auth.uid() IS NOT NULL AND NOT public.mfa_ok() THEN RAISE EXCEPTION 'mfa_required' USING ERRCODE = '42501'; END IF;
  if _uid is not null and not public.is_company_member(_company_id, _uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  _rad_id := coalesce(_series_id, public.faktero_rad_pre_druh(_company_id, _kind));

  select format, greatest(coalesce(start_from, 1), 1)
    into _format, _od_poradia
    from public.number_series
   where id = _rad_id and company_id = _company_id
   for update;
  if _format is null then raise exception 'Číselný rad sa nenašiel.'; end if;

  _mesacny := _format like '%{MM}%';
  if _mesacny then
    _od := date_trunc('month', _den)::date;
    _do := (_od + interval '1 month')::date;
  else
    _od := date_trunc('year', _den)::date;
    _do := (_od + interval '1 year')::date;
  end if;

  -- Zmazané doklady sa počítajú tiež: ich číslo je stále obsadené.
  if _kind = 'quote' then
    select _od_poradia + count(*) into _strop from public.quotes
     where company_id = _company_id and issue_date >= _od and issue_date < _do;
  elsif _kind = 'sales_order' then
    select _od_poradia + count(*) into _strop from public.sales_orders
     where company_id = _company_id and order_date >= _od and order_date < _do;
  elsif _kind = 'purchase_order' then
    select _od_poradia + count(*) into _strop from public.purchase_orders
     where company_id = _company_id and order_date >= _od and order_date < _do;
  elsif _kind = 'cash' then
    select _od_poradia + count(*) into _strop from public.cash_entries
     where company_id = _company_id and entry_date >= _od and entry_date < _do;
  elsif _kind = 'self_billing' then
    select _od_poradia + count(*) into _strop from public.purchase_invoices
     where company_id = _company_id and samofakturacia
       and issue_date >= _od and issue_date < _do;
  elsif _kind = 'financing' then
    -- Splátka sa čísluje podľa dátumu splatnosti.
    select _od_poradia + count(*) into _strop from public.financing_installments
     where company_id = _company_id and cislo_dokladu is not null
       and due_date >= _od and due_date < _do;
  else
    raise exception 'Druh dokladu % nemá vlastný rad.', _kind;
  end if;

  _n := _od_poradia;
  _volne := false;
  for _i in _od_poradia..greatest(coalesce(_strop, _od_poradia), _od_poradia) loop
    _cislo := public.faktero_cislo_zo_sablony(_format, _den, _i);
    _volne := not public.faktero_cislo_obsadene(_company_id, _kind, _cislo);
    _n := _i;
    exit when _volne;
  end loop;

  if not _volne then
    loop
      _n := _n + 1;
      _cislo := public.faktero_cislo_zo_sablony(_format, _den, _n);
      _volne := not public.faktero_cislo_obsadene(_company_id, _kind, _cislo);
      exit when _volne or _n > 1000000;
    end loop;
  end if;

  return jsonb_build_object('number', _cislo, 'sequence_number', _n, 'series_id', _rad_id);
end;
$function$;

-- 5. Pridelenie čísel splátkam kalendára
--
-- Čísla dostanú len splátky bez čísla, v poradí splátok (= podľa splatnosti),
-- každá z radu kalendára ku dňu svojej splatnosti. `_installment_ids` obmedzí
-- pridelenie na vybrané splátky (export vybraných). Kalendár bez radu → 0.
create or replace function public.faktero_cisla_splatok(
  _company_id uuid,
  _contract_id uuid,
  _installment_ids uuid[] default null
)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  _uid uuid := auth.uid();
  _rad uuid;
  _s record;
  _r jsonb;
  _pocet integer := 0;
begin
  if _uid is not null then
    if not public.mfa_ok() then
      raise exception 'mfa_required' using errcode = '42501';
    end if;
    if not public.is_company_member(_company_id, _uid)
       or not (_company_id = any ((select public.firmy_s_pravom('banka', true))::uuid[])) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  select c.number_series_id into _rad
    from public.financing_contracts c
    join public.number_series ns on ns.id = c.number_series_id
                                and ns.company_id = c.company_id
                                and ns.kind = 'financing'
   where c.id = _contract_id and c.company_id = _company_id;
  if _rad is null then
    return 0;
  end if;

  -- Zámok radu hneď na začiatku: dva súbežné exporty si čísla nepomiešajú.
  perform 1 from public.number_series where id = _rad for update;

  for _s in
    select id, due_date
      from public.financing_installments
     where contract_id = _contract_id
       and company_id = _company_id
       and cislo_dokladu is null
       and (_installment_ids is null or id = any (_installment_ids))
     order by number
  loop
    _r := public.faktero_next_series_number(_company_id, 'financing', _rad, _s.due_date);
    update public.financing_installments
       set cislo_dokladu = _r ->> 'number',
           number_series_id = _rad
     where id = _s.id;
    _pocet := _pocet + 1;
  end loop;

  return _pocet;
end;
$function$;

revoke all on function public.faktero_cisla_splatok(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.faktero_cisla_splatok(uuid, uuid, uuid[]) to authenticated, service_role;
