-- Samofakturácia (§ 72 ods. 4 zákona o DPH): faktúru za dodávateľa vyhotoví
-- odberateľ. Treba na to vopred písomnú dohodu a dodávateľ musí každú faktúru
-- odsúhlasiť. Pre odberateľa je to prijatá faktúra, preto žije v purchase_invoices.

-- Dohoda pri kontakte z adresára.
alter table public.customers
  add column if not exists samofakturacia_od date,
  add column if not exists samofakturacia_do date,
  add column if not exists samofakturacia_dohoda text;

alter table public.purchase_invoices
  add column if not exists samofakturacia boolean not null default false,
  add column if not exists samofakturacia_stav text,
  add column if not exists samofakturacia_token text,
  add column if not exists samofakturacia_poznamka text,
  add column if not exists samofakturacia_odoslana_at timestamptz,
  add column if not exists samofakturacia_rozhodnutie_at timestamptz,
  add column if not exists samofakturacia_rozhodol text,
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists supplier_street text,
  add column if not exists supplier_city text,
  add column if not exists supplier_zip text,
  add column if not exists supplier_country text,
  add column if not exists supplier_email text;

alter table public.purchase_invoices
  drop constraint if exists purchase_invoices_samofakturacia_stav_chk;
alter table public.purchase_invoices
  add constraint purchase_invoices_samofakturacia_stav_chk check (
    samofakturacia_stav is null
    or samofakturacia_stav in ('caka', 'odsuhlasena', 'zamietnuta')
  );

create unique index if not exists purchase_invoices_samofakturacia_token_key
  on public.purchase_invoices (samofakturacia_token)
  where samofakturacia_token is not null;

create index if not exists purchase_invoices_customer_id_idx
  on public.purchase_invoices (customer_id)
  where customer_id is not null;

-- Číselný rad samofaktúr.
alter table public.number_series drop constraint if exists number_series_kind_check;
alter table public.number_series add constraint number_series_kind_check check (
  kind = any (array['invoice','proforma','credit_note','advance_payment','quote',
                    'sales_order','purchase_order','cash','self_billing'])
);

create or replace function public.faktero_nazov_radu(_kind text)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select case _kind
           when 'invoice' then 'Faktúry'
           when 'credit_note' then 'Dobropisy'
           when 'proforma' then 'Zálohové faktúry'
           when 'advance_payment' then 'Doklady k prijatej platbe'
           when 'quote' then 'Cenové ponuky'
           when 'sales_order' then 'Prijaté objednávky'
           when 'purchase_order' then 'Objednávky u dodávateľa'
           when 'cash' then 'Pokladničné doklady'
           when 'self_billing' then 'Samofaktúry'
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
           when 'proforma' then 'ZF' || _zaklad
           when 'advance_payment' then 'DDP' || _zaklad
           when 'quote' then 'Q{YYYY}{NNNN}'
           when 'sales_order' then 'OBJ{YYYY}{NNNN}'
           when 'purchase_order' then 'OBJ{YYYY}{NNNN}'
           when 'cash' then 'PD{YYYY}{NNNN}'
           when 'self_billing' then 'SF{YYYY}{NNNN}'
           else _zaklad
         end;
end;
$function$;

-- Obsadenosť čísla podľa druhu na jednom mieste, aby sa vetvy nemuseli
-- opakovať v oboch cykloch.
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
begin
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
