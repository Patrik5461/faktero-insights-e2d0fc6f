-- Trigger `stock_movement_recalc_avg` čítal množstvo zo `stock_levels` s
-- poznámkou „trg_apply už bežal". Nebežal: oba sú AFTER INSERT a Postgres ich
-- spúšťa v abecednom poradí podľa mena, takže `stock_movement_recalc_avg`
-- predbehne `trg_stock_movements_apply`. Prečítal preto stav spred pohybu,
-- odpočítal od neho prijaté množstvo, dostal záporné číslo a spustil vetvu
-- „príjem po nulovom stave" — vážená cena sa tak pri každom príjme prepísala
-- poslednou nákupnou cenou namiesto zmiešania.
--
-- Príklad z produkcie: 1 ks za 3,40 € a príjem 20 ks za 4,00 € dal 4,0000 €
-- namiesto správnych 3,9714 €.
--
-- Riešenie nespolieha na poradie triggerov: stav pred pohybom sa dopočíta zo
-- samotných pohybov s vylúčením toho práve vkladaného. Aritmetika je rovnaká
-- ako v recompute_stock_avg_cost, nech dávajú obe cesty ten istý výsledok.
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
      4
    );
  END IF;

  UPDATE public.stock_items
     SET avg_purchase_price = round(_new_avg::numeric, 4),
         last_purchase_price = _cost
   WHERE id = NEW.stock_item_id;

  RETURN NEW;
END
$function$;
