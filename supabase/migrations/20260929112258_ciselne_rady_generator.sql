-- Generátor čísel podľa číselného radu.
--
-- Rad sa zakladá lenivo: firma, ktorá o radoch nikdy nepočula, dostane pri
-- prvom doklade ten istý tvar čísla, aký mala dovtedy — šablónu faktúry z
-- karty firmy, ostatné druhy s predponou, ktorú mali natvrdo v kóde. Nič sa
-- tým neprečísluje, len sa to po prvý raz pomenuje.
--
-- Telá funkcií sú v migrácii 20260929112523_ciselne_rady_generator_oprava.sql
-- (faktero_next_series_number) a tu; obe sú `create or replace`, takže posledná
-- verzia platí.

create or replace function public.faktero_predvolena_sablona(_company_id uuid, _kind text)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
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
           else _zaklad
         end;
end;
$$;

create or replace function public.faktero_nazov_radu(_kind text)
returns text
language sql
immutable
as $$
  select case _kind
           when 'invoice' then 'Faktúry'
           when 'credit_note' then 'Dobropisy'
           when 'proforma' then 'Zálohové faktúry'
           when 'advance_payment' then 'Doklady k prijatej platbe'
           when 'quote' then 'Cenové ponuky'
           when 'sales_order' then 'Prijaté objednávky'
           when 'purchase_order' then 'Objednávky u dodávateľa'
           when 'cash' then 'Pokladničné doklady'
           else 'Doklady'
         end;
$$;

-- Predvolený rad druhu dokladu; keď ešte nie je, založí ho z doterajšieho tvaru.
create or replace function public.faktero_rad_pre_druh(_company_id uuid, _kind text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _id uuid;
begin
  select id into _id
    from public.number_series
   where company_id = _company_id and kind = _kind and is_default and active
   limit 1;
  if _id is not null then return _id; end if;

  select id into _id
    from public.number_series
   where company_id = _company_id and kind = _kind and active
   order by created_at
   limit 1;
  if _id is not null then return _id; end if;

  insert into public.number_series (company_id, kind, name, format, is_default)
  values (
    _company_id,
    _kind,
    public.faktero_nazov_radu(_kind),
    public.faktero_predvolena_sablona(_company_id, _kind),
    true
  )
  on conflict do nothing
  returning id into _id;

  if _id is null then
    select id into _id
      from public.number_series
     where company_id = _company_id and kind = _kind
     order by is_default desc, created_at
     limit 1;
  end if;

  return _id;
end;
$$;

-- Zloží číslo zo šablóny — tokeny {YYYY} {YY} {MM} a {NN}–{NNNNNN}.
create or replace function public.faktero_cislo_zo_sablony(_format text, _date date, _n integer)
returns text
language plpgsql
immutable
as $$
declare
  _pad_token text;
  _pad integer;
begin
  select m[1] into _pad_token
    from regexp_matches(_format, '\{(N{2,6})\}', 'g') as m
   order by length(m[1]) desc
   limit 1;
  _pad := coalesce(length(_pad_token), 4);

  return regexp_replace(
           replace(
             replace(
               replace(_format, '{YYYY}', to_char(_date, 'YYYY')),
               '{YY}', to_char(_date, 'YY')),
             '{MM}', to_char(_date, 'MM')),
           '\{N{2,6}\}', lpad(_n::text, _pad, '0'), 'g');
end;
$$;

revoke all on function public.faktero_rad_pre_druh(uuid, text) from public;
grant execute on function public.faktero_rad_pre_druh(uuid, text) to authenticated, service_role;
revoke all on function public.faktero_predvolena_sablona(uuid, text) from public;
grant execute on function public.faktero_predvolena_sablona(uuid, text) to authenticated, service_role;
revoke all on function public.faktero_cislo_zo_sablony(text, date, integer) from public;
grant execute on function public.faktero_cislo_zo_sablony(text, date, integer) to authenticated, service_role;
revoke all on function public.faktero_nazov_radu(text) from public;
grant execute on function public.faktero_nazov_radu(text) to authenticated, service_role;
