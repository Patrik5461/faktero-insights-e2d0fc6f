-- Číselný rad vie, od ktorého poradia začať.
--
-- Bez toho sa po zmene šablóny začalo zase od jednotky: generátor hľadá
-- najnižšie voľné číslo a v novom tvare je voľné aj to prvé. Kto prepíše
-- číslo na „FA-2026-100" a povie „pokračuj v tomto rade", čaká 101 — nie 001.
-- Rovnaké pole potrebuje firma, ktorá prechádza z iného programu a chce
-- nadviazať na svoje doterajšie čísla.
--
-- Telá oboch generátorov sú nižšie celé, aby bolo z jedného miesta vidieť,
-- ako sa hranica používa.

alter table public.number_series
  add column if not exists start_from integer not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'number_series_start_from_check') then
    alter table public.number_series
      add constraint number_series_start_from_check check (start_from >= 1 and start_from <= 999999);
  end if;
end $$;

comment on column public.number_series.start_from is 'Od ktorého poradia rad začína; diery pod touto hranicou sa nezapĺňajú';

create or replace function public.faktero_next_invoice_number(
  _company_id uuid,
  _issue_date date default null::date,
  _type text default 'regular'::text,
  _series_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  _uid uuid := auth.uid();
  _format text;
  _od_poradia integer;
  _date date := COALESCE(_issue_date, (now() AT TIME ZONE 'Europe/Bratislava')::date);
  _monthly boolean;
  _seq integer;
  _number text;
  _period_start date;
  _period_end date;
  _strop integer;
  _rezervovanych integer;
  _rad_id uuid;
  _druh text := CASE COALESCE(_type, 'regular')
                  WHEN 'proforma' THEN 'proforma'
                  WHEN 'advance_payment' THEN 'advance_payment'
                  WHEN 'credit_note' THEN 'credit_note'
                  ELSE 'invoice'
                END;
BEGIN
  IF _uid IS NOT NULL AND NOT public.is_company_member(_company_id, _uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  _rad_id := COALESCE(_series_id, public.faktero_rad_pre_druh(_company_id, _druh));

  SELECT format, greatest(coalesce(start_from, 1), 1)
    INTO _format, _od_poradia
    FROM public.number_series
   WHERE id = _rad_id AND company_id = _company_id
   FOR UPDATE;

  IF _format IS NULL THEN
    RAISE EXCEPTION 'Číselný rad sa nenašiel.';
  END IF;

  _monthly := _format LIKE '%{MM}%';

  IF _monthly THEN
    _period_start := date_trunc('month', _date)::date;
    _period_end := (_period_start + interval '1 month')::date;
  ELSE
    _period_start := date_trunc('year', _date)::date;
    _period_end := (_period_start + interval '1 year')::date;
  END IF;

  SELECT COUNT(*)
    INTO _rezervovanych
    FROM public.invoice_number_reservations r
   WHERE r.company_id = _company_id
     AND r.used_at IS NULL
     AND r.expires_at > now()
     AND r.issue_date >= _period_start
     AND r.issue_date < _period_end;

  SELECT _od_poradia + COUNT(*) + COALESCE(_rezervovanych, 0)
    INTO _strop
    FROM public.invoices
   WHERE company_id = _company_id
     AND deleted_at IS NULL
     AND issue_date >= _period_start
     AND issue_date < _period_end;

  SELECT k.n, k.cislo
    INTO _seq, _number
    FROM (
      SELECT s.n, public.faktero_cislo_zo_sablony(_format, _date, s.n) AS cislo
        FROM generate_series(_od_poradia, GREATEST(_strop, _od_poradia)) AS s(n)
    ) k
   WHERE NOT EXISTS (
     SELECT 1 FROM public.invoices i
      WHERE i.company_id = _company_id
        AND i.invoice_number = k.cislo
        AND i.deleted_at IS NULL
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.invoice_number_reservations r
      WHERE r.company_id = _company_id
        AND r.invoice_number = k.cislo
        AND r.used_at IS NULL
        AND r.expires_at > now()
   )
   ORDER BY k.n
   LIMIT 1;

  IF _number IS NULL THEN
    RAISE EXCEPTION 'Nepodarilo sa vygenerovať voľné číslo faktúry';
  END IF;

  RETURN jsonb_build_object(
    'invoice_number', _number,
    'sequence_number', _seq,
    'series_id', _rad_id
  );
END;
$function$;

create or replace function public.faktero_next_series_number(
  _company_id uuid,
  _kind text,
  _series_id uuid default null,
  _date date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
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
  else
    raise exception 'Druh dokladu % nemá vlastný rad.', _kind;
  end if;

  _n := _od_poradia;
  for _i in _od_poradia..greatest(coalesce(_strop, _od_poradia), _od_poradia) loop
    _cislo := public.faktero_cislo_zo_sablony(_format, _den, _i);
    if _kind = 'quote' then
      select not exists (
        select 1 from public.quotes
         where company_id = _company_id and quote_number = _cislo) into _volne;
    elsif _kind = 'sales_order' then
      select not exists (
        select 1 from public.sales_orders
         where company_id = _company_id and order_number = _cislo) into _volne;
    elsif _kind = 'purchase_order' then
      select not exists (
        select 1 from public.purchase_orders
         where company_id = _company_id and order_number = _cislo) into _volne;
    else
      select not exists (
        select 1 from public.cash_entries
         where company_id = _company_id and entry_number = _cislo) into _volne;
    end if;
    _n := _i;
    exit when _volne;
  end loop;

  if not _volne then
    loop
      _n := _n + 1;
      _cislo := public.faktero_cislo_zo_sablony(_format, _den, _n);
      if _kind = 'quote' then
        select not exists (
          select 1 from public.quotes
           where company_id = _company_id and quote_number = _cislo) into _volne;
      elsif _kind = 'sales_order' then
        select not exists (
          select 1 from public.sales_orders
           where company_id = _company_id and order_number = _cislo) into _volne;
      elsif _kind = 'purchase_order' then
        select not exists (
          select 1 from public.purchase_orders
           where company_id = _company_id and order_number = _cislo) into _volne;
      else
        select not exists (
          select 1 from public.cash_entries
           where company_id = _company_id and entry_number = _cislo) into _volne;
      end if;
      exit when _volne or _n > 1000000;
    end loop;
  end if;

  return jsonb_build_object('number', _cislo, 'sequence_number', _n, 'series_id', _rad_id);
end;
$$;
