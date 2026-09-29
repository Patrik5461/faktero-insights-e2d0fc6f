-- Číslo zmazaného dokladu ostáva obsadené — okrem faktúr.
--
-- Ponuky, objednávky aj pokladňa majú jedinečnosť čísla cez celú tabuľku, aj
-- na zmazaných riadkoch (`quotes_company_id_quote_number_key`). Generátor
-- zmazané preskakoval, takže ponúkol číslo, ktoré databáza vzápätí odmietla a
-- ponuka sa neuložila vôbec. Faktúry to majú inak: ich unikátny index platí
-- len na živých dokladoch a diery po zmazaných sa zapĺňajú zámerne.

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

  select format into _format
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
    select count(*) + 1 into _strop from public.quotes
     where company_id = _company_id and issue_date >= _od and issue_date < _do;
  elsif _kind = 'sales_order' then
    select count(*) + 1 into _strop from public.sales_orders
     where company_id = _company_id and order_date >= _od and order_date < _do;
  elsif _kind = 'purchase_order' then
    select count(*) + 1 into _strop from public.purchase_orders
     where company_id = _company_id and order_date >= _od and order_date < _do;
  elsif _kind = 'cash' then
    select count(*) + 1 into _strop from public.cash_entries
     where company_id = _company_id and entry_date >= _od and entry_date < _do;
  else
    raise exception 'Druh dokladu % nemá vlastný rad.', _kind;
  end if;

  _n := 1;
  for _i in 1..greatest(coalesce(_strop, 1), 1) loop
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
    /*
      Všetky čísla po strop sú obsadené — stane sa to, keď v období pribudli
      doklady s ručne zadaným číslom z toho istého radu. Pokračuje sa za
      stropom, nech doklad vznikne.
    */
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

revoke all on function public.faktero_next_series_number(uuid, text, uuid, date) from public;
grant execute on function public.faktero_next_series_number(uuid, text, uuid, date) to authenticated, service_role;
