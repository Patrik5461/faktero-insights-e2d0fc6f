-- Výdaj zo skladu nikdy neprešiel. V celej databáze bolo 311 pohybov a všetky
-- typu 'prijem' — každý pokus o výdaj, faktúru, opravu či inventúrne manko
-- skončil na `stock_levels_quantity_nonneg`.
--
-- Príčina: `INSERT ... ON CONFLICT DO UPDATE` vyhodnocuje CHECK na
-- **navrhovanom** riadku ešte predtým, než zistí konflikt a prepne sa na UPDATE.
-- Pri výdaji je navrhovaná hodnota záporná (-50), takže kontrola padne, hoci
-- výsledok po pripočítaní k existujúcemu stavu by bol kladný (1).
--
-- Riešenie: najprv UPDATE existujúceho riadka — tam sa CHECK vyhodnocuje až na
-- konečnej hodnote. INSERT sa použije len vtedy, keď riadok ešte neexistuje, a
-- vtedy je záporné množstvo naozaj chyba (nedá sa vydať z prázdneho skladu).
create or replace function public.apply_stock_movement(
  _company_id uuid, _warehouse_id uuid, _stock_item_id uuid, _delta numeric)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  UPDATE public.stock_levels
     SET quantity = quantity + _delta,
         updated_at = now()
   WHERE warehouse_id = _warehouse_id
     AND stock_item_id = _stock_item_id;

  IF NOT FOUND THEN
    INSERT INTO public.stock_levels(company_id, warehouse_id, stock_item_id, quantity)
    VALUES (_company_id, _warehouse_id, _stock_item_id, _delta)
    ON CONFLICT (warehouse_id, stock_item_id)
    DO UPDATE SET quantity = public.stock_levels.quantity + EXCLUDED.quantity,
                  updated_at = now();
  END IF;
END $function$;
