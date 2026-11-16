-- Prijaté daňové doklady k prijatej platbe (od dodávateľa).
--
-- Dodávateľ ho vystaví po tom, čo dostal našu zálohu (prijatá zálohová
-- faktúra). Je to daňový doklad — DPH z neho si odpočítame — ale nie záväzok:
-- záloha je už zaplatená. Eviduje sa v `purchase_invoices` s typom
-- `advance_payment` (ten istý kód ako vystavený doklad v `invoices.type`),
-- stavom `paid` a voliteľnou väzbou `advance_invoice_id` na zálohovú faktúru.

-- 1. Nový typ prijatého dokladu.
alter table public.purchase_invoices drop constraint if exists purchase_invoices_type_check;
alter table public.purchase_invoices
  add constraint purchase_invoices_type_check check (type in ('regular', 'proforma', 'advance_payment'));

comment on column public.purchase_invoices.type is
  'regular = prijatá faktúra (daňový doklad), proforma = prijatá zálohová faktúra, advance_payment = prijatý daňový doklad k prijatej platbe (záloha už zaplatená)';
comment on column public.purchase_invoices.advance_invoice_id is
  'Prijatá zálohová faktúra, ktorú táto faktúra zúčtováva (regular), alebo ku ktorej patrí daňový doklad k platbe (advance_payment)';

-- 2. Daňový doklad k platbe sa neplatí — na úhradu je vždy 0. Spúšťač
--    `uhrady_prijatej_zo_stavu` preto pri stave `paid` nevyrobí žiadnu úhradu
--    (inak by vznikla vymyslená platba a doklad by sa ponúkal na párovanie).
create or replace function public.prijata_suma_na_uhradu(_id uuid)
 returns numeric
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  _celkom numeric;
  _firma uuid;
  _zaloha_id uuid;
  _na_doklade numeric := 0;
  _zaloha numeric := 0;
  _typ text;
begin
  select abs(coalesce(amount_total, 0)), company_id, advance_invoice_id, abs(coalesce(advance_amount, 0)), type
    into _celkom, _firma, _zaloha_id, _na_doklade, _typ
    from public.purchase_invoices where id = _id;
  if _celkom is null then return 0; end if;
  -- Daňový doklad k prijatej platbe: záloha je už zaplatená, nič sa neplatí.
  if _typ = 'advance_payment' then return 0; end if;
  if coalesce(_na_doklade, 0) > 0 then
    return greatest(_celkom - _na_doklade, 0);
  end if;
  if _zaloha_id is not null then
    select abs(coalesce(amount_total, 0)) into _zaloha
      from public.purchase_invoices
     where id = _zaloha_id and company_id = _firma and status = 'paid' and deleted_at is null;
  end if;
  return greatest(_celkom - coalesce(_zaloha, 0), 0);
end $function$;

-- 3. Typ prijatého dokladu pre pravidlá účtovania.
create or replace function public.faktero_typ_prijatej(_typ text, _suma numeric, _opravuje text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case when _typ = 'proforma' then 'proforma'
              when _typ = 'advance_payment' then 'advance_payment'
              when coalesce(_suma, 0) < 0 or nullif(btrim(_opravuje), '') is not null then 'credit_note'
              else 'regular' end
$function$;

-- 4. Pravidlo účtovania na daňový doklad k platbe len výslovne pre tento typ
--    dokladu. Pravidlo dodávateľa pre bežné faktúry (náklad 518/321) by doklad
--    zaúčtovalo ako nákup — daňový doklad k zálohe sa účtuje inak (343/314).
create or replace function public.faktero_uplatni_pravidlo()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  p public.pravidla_uctovania;
  pozn text;
  dobropis_b2 boolean := false;
begin
  if new.pravidlo_id is not null or new.exported_at is not null then
    return new;
  end if;
  if tg_table_name = 'purchase_invoices' then
    if new.odberatel_nesedi is not null then
      return new;
    end if;
    if new.type = 'proforma' then
      return new;
    end if;
    p := public.faktero_pravidlo_pre_doklad(new.company_id, new.supplier_ico, new.supplier_name,
           new.payment_method, new.created_by, new.predmet_mailu, 'prijata',
           public.faktero_typ_prijatej(new.type, new.amount_total, new.opravuje_cislo),
           new.odosielatel_mailu, public.faktero_krajina_dokladu(new.supplier_country, new.supplier_ic_dph),
           coalesce(nullif(btrim(new.variable_symbol), ''),
                    public.vs_z_cisla_dokladu(new.invoice_number, true)));
    if new.type = 'advance_payment' and coalesce(p.typ_dokladu, '') <> 'advance_payment' then
      return new;
    end if;
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
  -- Prijatý dobropis do B.2 nepatrí. Vnorené IF: bloček stĺpec `type` nemá.
  if tg_table_name = 'purchase_invoices' and upper(coalesce(p.kv_clenenie, '')) = 'B2' then
    dobropis_b2 := public.faktero_typ_prijatej(new.type, new.amount_total, new.opravuje_cislo) = 'credit_note';
  end if;
  if coalesce(new.kv_clenenie, '') = '' and coalesce(p.kv_clenenie, '') <> '' and not dobropis_b2 then
    new.kv_clenenie := p.kv_clenenie;
  end if;
  if new.rozuctovanie is null and p.rozuctovanie is not null then
    new.rozuctovanie := p.rozuctovanie;
  end if;
  if tg_table_name = 'expense_documents' and coalesce(p.pokladna, '') <> '' then
    if coalesce(new.pohoda_pokladna, '') = '' then
      new.pohoda_pokladna := p.pokladna;
    end if;
  end if;
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
