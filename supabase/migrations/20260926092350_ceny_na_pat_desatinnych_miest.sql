-- Jednotkové ceny s piatimi desatinnými miestami.
--
-- Doteraz mali cenové stĺpce numeric(_,4). Kto predáva po kusoch za zlomky
-- centa (spojovací materiál, réžia prepočítaná na minútu), musel cenu
-- zaokrúhliť a na tisícoch kusov sa rozdiel prejaví. Rozširuje sa len mierka,
-- počet celých číslic ostáva rovnaký, takže sa žiadny existujúci údaj nezmestí
-- horšie než doteraz.

-- Pohľad drží stĺpce stock_items, preto ho treba na čas odstrániť.
drop view if exists public.stock_items_with_availability;

alter table public.products
  alter column unit_price type numeric(15, 5);

alter table public.stock_items
  alter column purchase_price      type numeric(15, 5),
  alter column sale_price          type numeric(15, 5),
  alter column avg_purchase_price  type numeric(13, 5),
  alter column last_purchase_price type numeric(13, 5);

alter table public.stock_movements
  alter column unit_price  type numeric(15, 5),
  alter column unit_cost   type numeric(13, 5),
  alter column total_value type numeric(15, 5);

-- Aby sa cena pri prenose produktu na doklad neorezala späť na štyri miesta.
alter table public.invoice_items
  alter column unit_price type numeric(15, 5);

alter table public.quote_items
  alter column unit_price type numeric(15, 5);

create view public.stock_items_with_availability
  with (security_invoker = on) as
 SELECT si.id,
    si.company_id,
    si.product_id,
    si.sku,
    si.barcode,
    si.purchase_price,
    si.sale_price,
    si.vat_rate,
    si.unit,
    si.track_stock,
    si.min_stock,
    si.created_at,
    si.updated_at,
    si.archived_at,
    si.category_id,
    si.supplier_id,
    si.photo_url,
    si.location,
    si.description,
    si.name_en,
    si.avg_purchase_price,
    si.last_purchase_price,
    COALESCE(lvl.on_hand, 0::numeric) AS on_hand_qty,
    COALESCE(res.reserved, 0::numeric) AS reserved_qty,
    COALESCE(lvl.on_hand, 0::numeric) - COALESCE(res.reserved, 0::numeric) AS available_qty
   FROM stock_items si
     LEFT JOIN ( SELECT stock_levels.stock_item_id,
            sum(stock_levels.quantity) AS on_hand
           FROM stock_levels
          GROUP BY stock_levels.stock_item_id) lvl ON lvl.stock_item_id = si.id
     LEFT JOIN ( SELECT stock_reservations.stock_item_id,
            sum(stock_reservations.quantity) AS reserved
           FROM stock_reservations
          WHERE stock_reservations.status = 'active'::text
          GROUP BY stock_reservations.stock_item_id) res ON res.stock_item_id = si.id;

-- Právo drží PUBLIC, preto sa odoberá menovite; inak by pohľad videl aj anon.
revoke all on public.stock_items_with_availability from public;
grant select on public.stock_items_with_availability to authenticated, service_role;

-- Vážená nákupná cena sa zaokrúhľovala na štyri miesta, čím by sa piate miesto
-- pri prvom príjme stratilo.
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
         last_purchase_price = _cost
   WHERE id = NEW.stock_item_id;

  RETURN NEW;
END
$function$;
