alter table public.pravidla_uctovania
  add column if not exists pouzivatel_id uuid,
  add column if not exists predmet_text text;
alter table public.purchase_invoices add column if not exists predmet_mailu text;
alter table public.expense_documents add column if not exists predmet_mailu text;
comment on column public.pravidla_uctovania.pouzivatel_id is 'Pravidlo len pre doklady, ktoré zapísal tento používateľ (created_by).';
comment on column public.pravidla_uctovania.predmet_text is 'Pravidlo len pre doklady z mailu, ktorého predmet obsahuje tento text.';

-- Premenné v poznámke podľa dátumu dokladu: #MM#, #YYYY#, #MMYYYY#, #MM/YYYY#,
-- #MM-YYYY#, #MM-1/YYYY# (predchádzajúci mesiac), #MM-1YYYY#.
create or replace function public.faktero_premenne_poznamky(_text text, _den date)
 returns text
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
declare
  d date := coalesce(_den, current_date);
  p date := (date_trunc('month', coalesce(_den, current_date)) - interval '1 month')::date;
  t text := coalesce(_text, '');
begin
  t := replace(t, '#MM-1/YYYY#', to_char(p, 'MM/YYYY'));
  t := replace(t, '#MM-1YYYY#', to_char(p, 'MMYYYY'));
  t := replace(t, '#MM-1#', to_char(p, 'MM'));
  t := replace(t, '#MM/YYYY#', to_char(d, 'MM/YYYY'));
  t := replace(t, '#MM-YYYY#', to_char(d, 'MM-YYYY'));
  t := replace(t, '#MMYYYY#', to_char(d, 'MMYYYY'));
  t := replace(t, '#YYYY#', to_char(d, 'YYYY'));
  t := replace(t, '#MM#', to_char(d, 'MM'));
  return t;
end
$function$;
revoke all on function public.faktero_premenne_poznamky(text, date) from public, anon;
grant execute on function public.faktero_premenne_poznamky(text, date) to authenticated, service_role;

create or replace function public.faktero_pravidlo_pre_doklad(
  _company uuid, _ico text, _meno text, _uhrada text, _pouzivatel uuid, _predmet text)
 returns pravidla_uctovania
 language sql
 stable
 set search_path to 'public'
as $function$
  select p.*
    from public.pravidla_uctovania p
   where p.company_id = _company
     and p.aktivne
     -- Pravidlo musí mať aspoň jedno kritérium.
     and (nullif(btrim(p.dodavatel_ico), '') is not null or nullif(btrim(p.dodavatel_text), '') is not null
          or nullif(btrim(p.sposob_uhrady), '') is not null or p.pouzivatel_id is not null
          or nullif(btrim(p.predmet_text), '') is not null)
     and (nullif(btrim(p.dodavatel_ico), '') is null
          or regexp_replace(coalesce(_ico, ''), '\D', '', 'g') = regexp_replace(p.dodavatel_ico, '\D', '', 'g'))
     and (nullif(btrim(p.dodavatel_text), '') is null
          or translate(lower(coalesce(_meno, '')), 'áäčďéěíĺľňóôŕřšťúůýž', 'aacdeeillnoorrstuuyz')
             like '%' || translate(lower(btrim(p.dodavatel_text)), 'áäčďéěíĺľňóôŕřšťúůýž', 'aacdeeillnoorrstuuyz') || '%')
     and (nullif(btrim(p.sposob_uhrady), '') is null or p.sposob_uhrady = _uhrada)
     and (p.pouzivatel_id is null or p.pouzivatel_id = _pouzivatel)
     and (nullif(btrim(p.predmet_text), '') is null
          or translate(lower(coalesce(_predmet, '')), 'áäčďéěíĺľňóôŕřšťúůýž', 'aacdeeillnoorrstuuyz')
             like '%' || translate(lower(btrim(p.predmet_text)), 'áäčďéěíĺľňóôŕřšťúůýž', 'aacdeeillnoorrstuuyz') || '%')
   -- Pravidlo podľa dodávateľa má prednosť pred pravidlom podľa používateľa či predmetu.
   order by (nullif(btrim(p.dodavatel_ico), '') is null and nullif(btrim(p.dodavatel_text), '') is null), p.poradie, p.created_at
   limit 1
$function$;
revoke all on function public.faktero_pravidlo_pre_doklad(uuid, text, text, text, uuid, text) from public, anon;
grant execute on function public.faktero_pravidlo_pre_doklad(uuid, text, text, text, uuid, text) to authenticated, service_role;

create or replace function public.faktero_pravidlo_pre_doklad(_company uuid, _ico text, _meno text, _uhrada text)
 returns pravidla_uctovania
 language sql
 stable
 set search_path to 'public'
as $function$
  select * from public.faktero_pravidlo_pre_doklad(_company, _ico, _meno, _uhrada, null::uuid, null::text)
$function$;

create or replace function public.faktero_uplatni_pravidlo()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  p public.pravidla_uctovania;
  pozn text;
begin
  -- Doklad odovzdaný do účtovníctva sa nemení; raz uplatnené pravidlo sa neopakuje.
  if new.pravidlo_id is not null or new.exported_at is not null then
    return new;
  end if;
  p := public.faktero_pravidlo_pre_doklad(new.company_id, new.supplier_ico, new.supplier_name,
         new.payment_method, new.created_by, new.predmet_mailu);
  if p.id is null then
    return new;
  end if;
  new.pravidlo_id := p.id;
  if coalesce(new.category, '') = '' and coalesce(p.kategoria, '') <> '' then
    new.category := p.kategoria;
  end if;
  if coalesce(new.pohoda_predkontacia, '') = '' and coalesce(p.predkontacia, '') <> '' then
    new.pohoda_predkontacia := p.predkontacia;
  end if;
  if coalesce(new.pohoda_clenenie_dph, '') = '' and coalesce(p.clenenie_dph, '') <> '' then
    new.pohoda_clenenie_dph := p.clenenie_dph;
  end if;
  -- Odpočet má predvolene `true`, takže „prázdny" nepoznáme — pravidlo rozhoduje.
  if p.odpocet is not null then
    new.odpocet := p.odpocet;
  end if;
  pozn := public.faktero_premenne_poznamky(p.poznamka, new.issue_date);
  if coalesce(pozn, '') <> '' and position(pozn in coalesce(new.note, '')) = 0 then
    new.note := nullif(btrim(concat_ws(' ', nullif(new.note, ''), pozn)), '');
  end if;
  return new;
end;
$function$;

create or replace function public.uplatni_pravidla_uctovania(_company uuid)
 returns integer
 language plpgsql
 set search_path to 'public'
as $function$
declare
  n integer;
  m integer;
begin
  -- Prázdna zmena `pravidlo_id` zobudí spúšťač; ten pravidlo vyhodnotí a zapíše.
  update public.expense_documents d
     set pravidlo_id = null
   where d.company_id = _company
     and d.pravidlo_id is null
     and d.exported_at is null
     and (public.faktero_pravidlo_pre_doklad(d.company_id, d.supplier_ico, d.supplier_name, d.payment_method,
            d.created_by, d.predmet_mailu)).id is not null;
  get diagnostics n = row_count;
  update public.purchase_invoices p
     set pravidlo_id = null
   where p.company_id = _company
     and p.pravidlo_id is null
     and p.exported_at is null
     and p.deleted_at is null
     and (public.faktero_pravidlo_pre_doklad(p.company_id, p.supplier_ico, p.supplier_name, p.payment_method,
            p.created_by, p.predmet_mailu)).id is not null;
  get diagnostics m = row_count;
  return n + m;
end;
$function$;
