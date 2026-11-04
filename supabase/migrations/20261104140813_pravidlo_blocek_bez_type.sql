-- Hotfix 4. 11. 2026: migrácia opravne_doklady_kv_z_pravidla pridala do
-- faktero_uplatni_pravidlo podmienku s `new.type` v jednom výraze s
-- tg_table_name — plpgsql ju vyhodnotil aj pri bločku (expense_documents
-- stĺpec type nemá) a každé uloženie bločku padlo na 42703
-- „record new has no field type“. Kontrola prijatého dobropisu je teraz
-- vo vnorenom IF len pre purchase_invoices.

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
    -- Prijatá zálohová faktúra sa neúčtuje — pravidlo jej kódy nedáva.
    if new.type = 'proforma' then
      return new;
    end if;
    p := public.faktero_pravidlo_pre_doklad(new.company_id, new.supplier_ico, new.supplier_name,
           new.payment_method, new.created_by, new.predmet_mailu, 'prijata',
           public.faktero_typ_prijatej(new.type, new.amount_total, new.opravuje_cislo),
           new.odosielatel_mailu, public.faktero_krajina_dokladu(new.supplier_country, new.supplier_ic_dph),
           -- VS z čísla faktúry doplní až neskorší spúšťač (purchase_invoices_vs_z_cisla).
           coalesce(nullif(btrim(new.variable_symbol), ''),
                    public.vs_z_cisla_dokladu(new.invoice_number, true)));
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
