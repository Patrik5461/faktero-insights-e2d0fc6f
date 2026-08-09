/*
 * Materiál predaný na faktúre je náklad zákazky rovnako ako ručný výdaj.
 * `trg_invoice_stock_sync` však pohyb typu `faktura` vytváral bez `job_id`,
 * takže zákazka s tovarom na faktúre vychádzala bez nákladov a s maržou 100 %.
 */
create or replace function public.trg_invoice_stock_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  _wh uuid;
  _item record;
  _moved_out boolean;
  _moved_back boolean;
  _existing_out uuid;
  _existing_job uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF COALESCE(NEW.deferred_stock_issue, false) THEN RETURN NEW; END IF;

  _wh := public.default_warehouse_id(NEW.company_id);
  IF _wh IS NULL THEN RETURN NEW; END IF;

  _moved_out := NEW.status IN ('sent','paid') AND COALESCE(OLD.status::text,'') NOT IN ('sent','paid');
  _moved_back := NEW.status IN ('cancelled','draft') AND COALESCE(OLD.status::text,'') IN ('sent','paid');

  IF NOT (_moved_out OR _moved_back) THEN RETURN NEW; END IF;

  FOR _item IN
    SELECT ii.id AS item_id, ii.stock_item_id, ii.quantity, ii.unit_price
    FROM public.invoice_items ii
    WHERE ii.invoice_id = NEW.id AND ii.stock_item_id IS NOT NULL
  LOOP
    IF _moved_out THEN
      SELECT m.id INTO _existing_out
      FROM public.stock_movements m
      WHERE m.company_id = NEW.company_id
        AND m.reference_type = 'invoice'
        AND m.reference_id = NEW.id
        AND m.reference_item_id = _item.item_id
        AND m.type = 'faktura'
        AND NOT EXISTS (
          SELECT 1 FROM public.stock_movements r
          WHERE r.reversed_movement_id = m.id AND r.type = 'dobropis'
        )
      ORDER BY m.created_at DESC LIMIT 1;

      IF _existing_out IS NULL THEN
        INSERT INTO public.stock_movements(
          company_id, warehouse_id, stock_item_id, type, quantity, unit_price, total_value,
          reference_type, reference_id, reference_item_id,
          source_document_type, source_document_id, note, job_id)
        VALUES (NEW.company_id, _wh, _item.stock_item_id, 'faktura', _item.quantity, _item.unit_price,
          _item.quantity * _item.unit_price, 'invoice', NEW.id, _item.item_id,
          'invoice', NEW.id,
          'Auto: faktúra ' || NEW.invoice_number, NEW.job_id);
      END IF;
    ELSIF _moved_back THEN
      SELECT m.id, m.job_id INTO _existing_out, _existing_job
      FROM public.stock_movements m
      WHERE m.company_id = NEW.company_id
        AND m.reference_type = 'invoice'
        AND m.reference_id = NEW.id
        AND m.reference_item_id = _item.item_id
        AND m.type = 'faktura'
        AND NOT EXISTS (
          SELECT 1 FROM public.stock_movements r
          WHERE r.reversed_movement_id = m.id AND r.type = 'dobropis'
        )
      ORDER BY m.created_at DESC LIMIT 1;

      IF _existing_out IS NOT NULL THEN
        -- Zákazka sa berie z rušeného pohybu, nie z faktúry: keby sa medzitým
        -- na faktúre zmenila, storno by nákladom nepokrylo pôvodnú zákazku.
        INSERT INTO public.stock_movements(
          company_id, warehouse_id, stock_item_id, type, quantity, unit_price, total_value,
          reference_type, reference_id, reference_item_id, reversed_movement_id,
          source_document_type, source_document_id, note, job_id)
        VALUES (NEW.company_id, _wh, _item.stock_item_id, 'dobropis', _item.quantity, _item.unit_price,
          _item.quantity * _item.unit_price, 'invoice', NEW.id, _item.item_id, _existing_out,
          'invoice', NEW.id,
          'Auto: storno faktúry ' || NEW.invoice_number, _existing_job);
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END
$function$;

/*
 * Výnimka pre pohyby odvodené z faktúry.
 *
 * Pohyb typu `faktura`/`dobropis` nie je nové priradenie zákazky — je to tieň
 * faktúry, ktorá tú zákazku už nesie. Bez výnimky by sa po uzavretí zákazky
 * nedala stornovať faktúra vystavená ešte za jej otvorenia: storno pohybu by
 * narazilo na kontrolu stavu a zhodilo by celú zmenu stavu faktúry.
 *
 * Kontrola firmy platí aj tu — tá sa neobchádza nikdy.
 */
create or replace function public.jobs_guard_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare j record;
begin
  if new.job_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.job_id is not distinct from new.job_id then
    return new;
  end if;

  select company_id, status into j from public.jobs where id = new.job_id;
  if not found then
    raise exception 'Zákazka neexistuje.';
  end if;
  if j.company_id <> new.company_id then
    raise exception 'Zákazka patrí inej firme.';
  end if;
  if j.status <> 'active'
     and not (tg_table_name = 'stock_movements' and new.reference_type = 'invoice') then
    raise exception 'Zákazka nie je otvorená, doklad sa k nej priradiť nedá.';
  end if;
  return new;
end $$;

revoke all on function public.jobs_guard_assignment() from public, anon, authenticated;
