-- Prvý príjem doplní nákupnú cenu na karte.
--
-- `purchase_price` je ručné pole a pri tovare založenom z katalógu ostávalo
-- nulové aj po príjmoch za 4 a 6 € — v zozname skladových položiek potom
-- svietilo „Nákupná 0,00 €", hoci vážená cena bola 5 €. Keď na karte nikdy
-- žiadna nákupná cena nebola, prevezme sa z príjmu; ručne zadanú cenu
-- trigger neprepisuje.
create or replace function public.trg_stock_movement_recalc_avg()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  _pre_qty numeric;
  _delta numeric;
  _current_avg numeric;
  _cost numeric;
  _new_avg numeric;
BEGIN
  IF NEW.type <> 'prijem' THEN
    RETURN NEW;
  END IF;

  _delta := abs(NEW.quantity);
  _cost := COALESCE(NEW.unit_cost, NEW.unit_price);

  SELECT COALESCE(SUM(
           CASE
             WHEN type IN ('prijem','dobropis') THEN abs(quantity)
             WHEN type IN ('vydaj','faktura')   THEN -abs(quantity)
             ELSE quantity
           END), 0)
    INTO _pre_qty
    FROM public.stock_movements
   WHERE stock_item_id = NEW.stock_item_id
     AND id <> NEW.id;

  SELECT avg_purchase_price INTO _current_avg
    FROM public.stock_items WHERE id = NEW.stock_item_id;

  IF _pre_qty <= 0 THEN
    -- Príjem po nulovom alebo zápornom stave: skutočná obstarávacia cena sa
    -- stáva váženou.
    _new_avg := _cost;
  ELSE
    _new_avg := round(
      ((_pre_qty * COALESCE(_current_avg, 0) + _delta * _cost) / (_pre_qty + _delta))::numeric,
      5
    );
  END IF;

  UPDATE public.stock_items
     SET avg_purchase_price = round(_new_avg::numeric, 5),
         last_purchase_price = _cost,
         purchase_price = CASE
           WHEN COALESCE(purchase_price, 0) = 0 AND COALESCE(_cost, 0) > 0 THEN _cost
           ELSE purchase_price
         END
   WHERE id = NEW.stock_item_id;

  RETURN NEW;
END
$function$;
