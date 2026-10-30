-- Pravidlo podľa VS na prijatej faktúre zabralo len pri VS zadanom ručne.
-- Spúšťač purchase_invoices_vs_z_cisla (VS z čísla faktúry) beží abecedne až
-- po purchase_invoices_pravidlo_uctovania, takže pravidlo pri vložení videlo
-- prázdny VS. Pravidlo si ho preto odvodí samo rovnakou funkciou a spúšťač
-- sa zobudí aj pri zmene čísla faktúry.
CREATE OR REPLACE FUNCTION public.faktero_uplatni_pravidlo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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

DROP TRIGGER IF EXISTS purchase_invoices_pravidlo_uctovania ON public.purchase_invoices;
CREATE TRIGGER purchase_invoices_pravidlo_uctovania
  BEFORE INSERT OR UPDATE OF supplier_ico, supplier_name, payment_method, pravidlo_id, variable_symbol,
    supplier_country, supplier_ic_dph, invoice_number
  ON public.purchase_invoices FOR EACH ROW EXECUTE FUNCTION public.faktero_uplatni_pravidlo();
