-- Prijatá faktúra, ktorá nepatrí firme (odberateľ na doklade je iná firma).
-- Príznak zapisuje server pri vzniku faktúry; kým trvá, faktúra sa nedá
-- zaúčtovať ani odovzdať. Zruší ho len výslovné potvrdenie „Faktúra patrí
-- tejto firme“ (zapíše sa do histórie dokladu).
-- Spätne kompatibilné: starý kód príznak nenastavuje, stĺpce sú voliteľné.

alter table public.purchase_invoices
  add column if not exists odberatel_nesedi jsonb,
  add column if not exists odberatel_potvrdene_at timestamptz,
  add column if not exists odberatel_potvrdil uuid;

comment on column public.purchase_invoices.odberatel_nesedi is
  'Odberateľ na doklade nie je táto firma: {dovod, odberatel:{nazov,ico,dic,ic_dph}, firma:{nazov}, zistene_at}. Null = sedí alebo sa nedá povedať.';
comment on column public.purchase_invoices.odberatel_potvrdene_at is
  'Kedy človek potvrdil, že faktúra patrí tejto firme (príznak odberatel_nesedi sa zrušil).';
comment on column public.purchase_invoices.odberatel_potvrdil is
  'Kto potvrdil, že faktúra patrí tejto firme.';

create index if not exists purchase_invoices_odberatel_nesedi_idx
  on public.purchase_invoices (company_id)
  where odberatel_nesedi is not null and deleted_at is null;

-- Strážca: faktúra s príznakom sa nezaúčtuje (ani automatom so servisným kľúčom).
create or replace function public.faktero_strazca_cudzej_prijatej()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.odberatel_nesedi is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Vzniká s príznakom: zaúčtovanie z vytvorenia (pravidlo, predvolené kódy) sa nezapíše.
    new.zauctovane_at := null;
    new.zauctoval := null;
    new.zauctovanie_zdroj := null;
    new.zauctovanie_istota := null;
    if new.status = 'booked' then
      new.status := 'received';
    end if;
    return new;
  end if;
  if old.zauctovane_at is null and new.zauctovane_at is not null then
    raise exception 'Faktúra nepatrí tejto firme (odberateľ na doklade je iná firma) — kým nepotvrdíte, že patrí tejto firme, nedá sa zaúčtovať.'
      using errcode = 'P0001';
  end if;
  if coalesce(old.status, '') <> 'booked' and new.status = 'booked' then
    raise exception 'Faktúra nepatrí tejto firme (odberateľ na doklade je iná firma) — kým nepotvrdíte, že patrí tejto firme, nedá sa zaúčtovať.'
      using errcode = 'P0001';
  end if;
  if old.exported_at is null and new.exported_at is not null then
    raise exception 'Faktúra nepatrí tejto firme (odberateľ na doklade je iná firma) — kým nepotvrdíte, že patrí tejto firme, nedá sa odovzdať.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;


drop trigger if exists purchase_invoices_cudzi_odberatel on public.purchase_invoices;
create trigger purchase_invoices_cudzi_odberatel
  before insert or update on public.purchase_invoices
  for each row execute function public.faktero_strazca_cudzej_prijatej();

-- Pravidlo účtovania sa na faktúru s príznakom neuplatní (uplatní sa po potvrdení).
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
    -- Faktúra, ktorá nepatrí firme (iný odberateľ), sa pravidlom nezaúčtuje.
    -- Vnorené IF: bloček stĺpec odberatel_nesedi nemá.
    if new.odberatel_nesedi is not null then
      return new;
    end if;
    p := public.faktero_pravidlo_pre_doklad(new.company_id, new.supplier_ico, new.supplier_name,
           new.payment_method, new.created_by, new.predmet_mailu, 'prijata',
           public.faktero_typ_prijatej(new.type, new.amount_total, new.opravuje_cislo),
           new.odosielatel_mailu, public.faktero_krajina_dokladu(new.supplier_country, new.supplier_ic_dph),
           new.variable_symbol);
  else
    p := public.faktero_pravidlo_pre_doklad(new.company_id, new.supplier_ico, new.supplier_name,
           new.payment_method, new.created_by, new.predmet_mailu, 'blocek', null,
           new.odosielatel_mailu, public.faktero_krajina_dokladu(null, new.supplier_ic_dph), null);
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
  -- Rozúčtovanie pomerom: sumy dopočíta export z rozpisu dokladu.
  if new.rozuctovanie is null and p.rozuctovanie is not null then
    new.rozuctovanie := p.rozuctovanie;
  end if;
  -- Pokladňa má zmysel len pri bločku (hotovostný ide do pokladne v Pohode).
  -- Vnorené IF: plpgsql by `new.pohoda_pokladna` vyhodnotil aj pri prijatej faktúre, ktorá ho nemá.
  if tg_table_name = 'expense_documents' and coalesce(p.pokladna, '') <> '' then
    if coalesce(new.pohoda_pokladna, '') = '' then
      new.pohoda_pokladna := p.pokladna;
    end if;
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

-- História: zmena príznaku (aj potvrdenie „patrí tejto firme“) sa zapíše.
drop trigger if exists purchase_invoices_historia on public.purchase_invoices;
create trigger purchase_invoices_historia
  after insert or update on public.purchase_invoices
  for each row execute function public.zapis_historiu_dokladu('invoice_number', 'supplier_name', 'supplier_ico', 'supplier_iban', 'issue_date', 'delivery_date', 'due_date', 'amount_without_vat', 'vat_amount', 'amount_total', 'currency', 'variable_symbol', 'payment_method', 'status', 'pohoda_predkontacia', 'pohoda_clenenie_dph', 'kv_clenenie', 'stredisko', 'cinnost', 'job_id', 'category', 'note', 'zauctovane_at', 'zauctovanie_zdroj', 'exported_at', 'locked_at', 'deleted_at', 'stitky', 'odberatel_nesedi');
