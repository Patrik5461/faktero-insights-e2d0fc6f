-- Automatické účtovanie ako v Doklado: pravidlá pre bločky, prijaté aj vystavené
-- faktúry a banku; typ dokladu ako podmienka, KV členenie ako výsledok.
alter table public.pravidla_uctovania
  add column if not exists druh text,
  add column if not exists typ_dokladu text,
  add column if not exists kv_clenenie text,
  add column if not exists bankovy_ucet text,
  add column if not exists smer text,
  add column if not exists oznacenie text;

alter table public.pravidla_uctovania
  add constraint pravidla_uctovania_druh_check
    check (druh is null or druh in ('blocek', 'prijata', 'vystavena', 'banka')),
  add constraint pravidla_uctovania_smer_check
    check (smer is null or smer in ('prijem', 'vydaj'));

comment on column public.pravidla_uctovania.druh is
  'Na čo pravidlo platí: null = bločky aj prijaté faktúry (pôvodné pravidlá), blocek, prijata, vystavena, banka.';

alter table public.invoices add column if not exists pravidlo_id uuid
  references public.pravidla_uctovania(id) on delete set null;

create or replace function public.faktero_pravidlo_pre_doklad(
  _company uuid, _ico text, _meno text, _uhrada text, _pouzivatel uuid, _predmet text,
  _druh text, _typ text)
 returns public.pravidla_uctovania
 language sql stable
 set search_path to 'public'
as $function$
  select p.*
    from public.pravidla_uctovania p
   where p.company_id = _company
     and p.aktivne
     and coalesce(p.druh, '') <> 'banka'
     and (case when p.druh is null then _druh in ('blocek', 'prijata') else p.druh = _druh end)
     and (nullif(btrim(p.dodavatel_ico), '') is not null or nullif(btrim(p.dodavatel_text), '') is not null
          or nullif(btrim(p.sposob_uhrady), '') is not null or p.pouzivatel_id is not null
          or nullif(btrim(p.predmet_text), '') is not null or nullif(btrim(p.typ_dokladu), '') is not null)
     and (nullif(btrim(p.typ_dokladu), '') is null or p.typ_dokladu = _typ)
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
   -- Pravidlo podľa partnera má prednosť pred pravidlom podľa používateľa, predmetu či typu.
   order by (nullif(btrim(p.dodavatel_ico), '') is null and nullif(btrim(p.dodavatel_text), '') is null),
            p.poradie, p.created_at
   limit 1
$function$;

-- Pôvodný podpis ostáva, správa sa ako doteraz (bloček).
create or replace function public.faktero_pravidlo_pre_doklad(
  _company uuid, _ico text, _meno text, _uhrada text, _pouzivatel uuid, _predmet text)
 returns public.pravidla_uctovania
 language sql stable
 set search_path to 'public'
as $function$
  select * from public.faktero_pravidlo_pre_doklad(_company, _ico, _meno, _uhrada, _pouzivatel, _predmet,
    'blocek', null::text)
$function$;

revoke all on function public.faktero_pravidlo_pre_doklad(uuid, text, text, text, uuid, text, text, text) from public, anon;
grant execute on function public.faktero_pravidlo_pre_doklad(uuid, text, text, text, uuid, text, text, text)
  to authenticated, service_role;

/* Typ prijatej faktúry pre pravidlo: zálohová, dobropis (záporná alebo opravuje), inak bežná. */
create or replace function public.faktero_typ_prijatej(_typ text, _suma numeric, _opravuje text)
 returns text language sql immutable set search_path to 'public'
as $function$
  select case when _typ = 'proforma' then 'proforma'
              when coalesce(_suma, 0) < 0 or nullif(btrim(_opravuje), '') is not null then 'credit_note'
              else 'regular' end
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
  if tg_table_name = 'purchase_invoices' then
    p := public.faktero_pravidlo_pre_doklad(new.company_id, new.supplier_ico, new.supplier_name,
           new.payment_method, new.created_by, new.predmet_mailu, 'prijata',
           public.faktero_typ_prijatej(new.type, new.amount_total, new.opravuje_cislo));
  else
    p := public.faktero_pravidlo_pre_doklad(new.company_id, new.supplier_ico, new.supplier_name,
           new.payment_method, new.created_by, new.predmet_mailu, 'blocek', null);
  end if;
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
  if coalesce(new.kv_clenenie, '') = '' and coalesce(p.kv_clenenie, '') <> '' then
    new.kv_clenenie := p.kv_clenenie;
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

/* Vystavená faktúra: podľa odberateľa, typu a vystavovateľa doplní kódy pre Pohodu a KV. */
create or replace function public.faktero_uplatni_pravidlo_vystavenej()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  p public.pravidla_uctovania;
begin
  if new.pravidlo_id is not null or new.zauctovane_at is not null or new.deleted_at is not null then
    return new;
  end if;
  p := public.faktero_pravidlo_pre_doklad(new.company_id, new.customer_ico, new.customer_name,
         null, new.created_by, null, 'vystavena', new.type::text);
  if p.id is null then
    return new;
  end if;
  new.pravidlo_id := p.id;
  if coalesce(new.pohoda_predkontacia, '') = '' and coalesce(p.predkontacia, '') <> '' then
    new.pohoda_predkontacia := p.predkontacia;
  end if;
  if coalesce(new.pohoda_clenenie_dph, '') = '' and coalesce(p.clenenie_dph, '') <> '' then
    new.pohoda_clenenie_dph := p.clenenie_dph;
  end if;
  if coalesce(new.kv_clenenie, '') = '' and coalesce(p.kv_clenenie, '') <> '' then
    new.kv_clenenie := p.kv_clenenie;
  end if;
  return new;
end;
$function$;

drop trigger if exists invoices_pravidlo_uctovania on public.invoices;
create trigger invoices_pravidlo_uctovania
  before insert or update of customer_ico, customer_name, type, pravidlo_id on public.invoices
  for each row execute function public.faktero_uplatni_pravidlo_vystavenej();

create or replace function public.uplatni_pravidla_uctovania(_company uuid)
 returns integer
 language plpgsql
 set search_path to 'public'
as $function$
declare
  n integer;
  m integer;
  v integer;
begin
  -- Prázdna zmena `pravidlo_id` zobudí spúšťač; ten pravidlo vyhodnotí a zapíše.
  update public.expense_documents d
     set pravidlo_id = null
   where d.company_id = _company
     and d.pravidlo_id is null
     and d.exported_at is null
     and (public.faktero_pravidlo_pre_doklad(d.company_id, d.supplier_ico, d.supplier_name, d.payment_method,
            d.created_by, d.predmet_mailu, 'blocek', null)).id is not null;
  get diagnostics n = row_count;
  update public.purchase_invoices p
     set pravidlo_id = null
   where p.company_id = _company
     and p.pravidlo_id is null
     and p.exported_at is null
     and p.deleted_at is null
     and (public.faktero_pravidlo_pre_doklad(p.company_id, p.supplier_ico, p.supplier_name, p.payment_method,
            p.created_by, p.predmet_mailu, 'prijata',
            public.faktero_typ_prijatej(p.type, p.amount_total, p.opravuje_cislo))).id is not null;
  get diagnostics m = row_count;
  update public.invoices i
     set pravidlo_id = null
   where i.company_id = _company
     and i.pravidlo_id is null
     and i.zauctovane_at is null
     and i.deleted_at is null
     and (public.faktero_pravidlo_pre_doklad(i.company_id, i.customer_ico, i.customer_name, null,
            i.created_by, null, 'vystavena', i.type::text)).id is not null;
  get diagnostics v = row_count;
  return n + m + v;
end;
$function$;
