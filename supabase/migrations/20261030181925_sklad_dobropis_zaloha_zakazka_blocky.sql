/*
  Sklad pri faktúrach a zákazka s bločkami (test 30. 10. 2026, druhé kolo).

  1. Zálohová faktúra (proforma) a doklad k prijatej platbe (advance_payment)
     po odoslaní/uhradení vydávali tovar zo skladu. Tovar potom vydala ešte
     vyúčtovacia faktúra — sklad klesol dvakrát. Zálohy sklad nehýbu.

  2. Dobropis po odoslaní/uhradení tovar zo skladu ešte raz VYDAL (pohyb
     `faktura` so zápornou položkou, spúšťač berie -abs). Dobropis tovar vracia,
     takže zapisuje príjem typu `dobropis`; storno dobropisu ho vydá späť.
     Hľadanie už zapísaného pohybu ignoruje storno-pohyby (reversed_movement_id),
     takže funguje rovnako pre faktúru aj dobropis.

  3. Zákazku s priradeným bločkom (expense_documents.job_id) strážca mazania
     pustil a cudzí kľúč (ON DELETE SET NULL) bloček ticho odpojil.

  Spätne kompatibilné: mení sa len telo funkcií, stĺpce ani spúšťače nie.
*/

create or replace function public.trg_invoice_stock_sync()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  _wh uuid;
  _item record;
  _moved_out boolean;
  _moved_back boolean;
  _existing_out uuid;
  _existing_job uuid;
  _dobropis boolean;
  _typ_von public.stock_movement_type;
  _typ_spat public.stock_movement_type;
begin
  if new.status is not distinct from old.status then return new; end if;
  if coalesce(new.deferred_stock_issue, false) then return new; end if;
  -- Ťarchopis mení len cenu; zálohy sú výzva na platbu, tovar vydá až vyúčtovacia faktúra.
  if new.type::text in ('debit_note', 'proforma', 'advance_payment') then return new; end if;

  _wh := public.default_warehouse_id(new.company_id);
  if _wh is null then return new; end if;

  _moved_out := new.status in ('sent','paid') and coalesce(old.status::text,'') not in ('sent','paid');
  _moved_back := new.status in ('cancelled','draft') and coalesce(old.status::text,'') in ('sent','paid');

  if not (_moved_out or _moved_back) then return new; end if;

  -- Dobropis tovar vracia na sklad, faktúra ho vydáva.
  _dobropis := new.type::text = 'credit_note';
  _typ_von := case when _dobropis then 'dobropis'::public.stock_movement_type else 'faktura'::public.stock_movement_type end;
  _typ_spat := case when _dobropis then 'faktura'::public.stock_movement_type else 'dobropis'::public.stock_movement_type end;

  for _item in
    select ii.id as item_id, ii.stock_item_id, abs(ii.quantity) as quantity, ii.unit_price
    from public.invoice_items ii
    where ii.invoice_id = new.id and ii.stock_item_id is not null and ii.quantity <> 0
  loop
    select m.id, m.job_id into _existing_out, _existing_job
    from public.stock_movements m
    where m.company_id = new.company_id
      and m.reference_type = 'invoice'
      and m.reference_id = new.id
      and m.reference_item_id = _item.item_id
      and m.type = _typ_von
      and m.reversed_movement_id is null
      and not exists (
        select 1 from public.stock_movements r
        where r.reversed_movement_id = m.id
      )
    order by m.created_at desc limit 1;

    if _moved_out then
      if _existing_out is null then
        insert into public.stock_movements(
          company_id, warehouse_id, stock_item_id, type, quantity, unit_price, total_value,
          reference_type, reference_id, reference_item_id,
          source_document_type, source_document_id, note, job_id)
        values (new.company_id, _wh, _item.stock_item_id, _typ_von, _item.quantity, _item.unit_price,
          _item.quantity * _item.unit_price, 'invoice', new.id, _item.item_id,
          'invoice', new.id,
          case when _dobropis then 'Auto: dobropis ' else 'Auto: faktúra ' end || new.invoice_number,
          new.job_id);
      end if;
    elsif _moved_back and _existing_out is not null then
      -- Zákazka sa berie z rušeného pohybu, nie z faktúry: keby sa medzitým
      -- na faktúre zmenila, storno by nákladom nepokrylo pôvodnú zákazku.
      insert into public.stock_movements(
        company_id, warehouse_id, stock_item_id, type, quantity, unit_price, total_value,
        reference_type, reference_id, reference_item_id, reversed_movement_id,
        source_document_type, source_document_id, note, job_id)
      values (new.company_id, _wh, _item.stock_item_id, _typ_spat, _item.quantity, _item.unit_price,
        _item.quantity * _item.unit_price, 'invoice', new.id, _item.item_id, _existing_out,
        'invoice', new.id,
        case when _dobropis then 'Auto: storno dobropisu ' else 'Auto: storno faktúry ' end || new.invoice_number,
        _existing_job);
    end if;
  end loop;

  return new;
end
$function$;

create or replace function public.jobs_block_delete_with_documents()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if exists (select 1 from public.invoices          where job_id = old.id)
  or exists (select 1 from public.purchase_invoices where job_id = old.id)
  or exists (select 1 from public.expense_documents where job_id = old.id)
  or exists (select 1 from public.stock_movements   where job_id = old.id)
  or exists (select 1 from public.trips             where job_id = old.id)
  or exists (select 1 from public.purchase_orders   where job_id = old.id)
  or exists (select 1 from public.sales_orders      where job_id = old.id)
  or exists (select 1 from public.quotes            where job_id = old.id) then
    raise exception 'Zákazka má naviazané doklady, zmazať sa nedá. Uzavrite ju.';
  end if;
  return old;
end $function$;

revoke all on function public.trg_invoice_stock_sync() from public, anon, authenticated;
revoke all on function public.jobs_block_delete_with_documents() from public, anon, authenticated;
