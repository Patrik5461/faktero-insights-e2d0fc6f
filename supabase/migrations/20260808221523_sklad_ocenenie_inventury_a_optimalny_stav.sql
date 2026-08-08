-- Prevzaté z Pohody (príručka, Sklady → Inventúra): rozdiel zistený inventúrou
-- sa oceňuje **váženou nákupnou cenou**, nie nulou. Bez toho má manko nulovú
-- hodnotu a z inventúry sa nedá zistiť, o koľko peňazí firma prišla.
--
-- Trigger dopĺňal unit_cost len pri výdaji a príjme; pri type 'inventura',
-- 'oprava' a 'dobropis' ostávalo NULL. Doplníme ho rovnako ako pri výdaji —
-- teda váženou cenou platnou v okamihu pohybu.
create or replace function public.trg_stock_movement_cost_snapshot()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  _avg numeric;
BEGIN
  IF NEW.type = 'prijem' AND NEW.unit_cost IS NULL THEN
    -- Príjem prináša vlastnú obstarávaciu cenu.
    NEW.unit_cost := NEW.unit_price;
  ELSIF NEW.unit_cost IS NULL THEN
    -- Všetko ostatné (výdaj, faktúra, inventúra, oprava, dobropis) sa oceňuje
    -- váženou nákupnou cenou zásoby v okamihu pohybu.
    SELECT avg_purchase_price INTO _avg FROM public.stock_items WHERE id = NEW.stock_item_id;
    NEW.unit_cost := COALESCE(_avg, 0);
  END IF;
  RETURN NEW;
END
$function$;

-- Pohoda vedie pri zásobe minimálny aj **optimálny** stav. Minimum je hranica,
-- pri ktorej treba objednať; optimum je stav, na ktorý sa má doobjednať.
-- Doobjednanie len po minimum je totiž zbytočné — zásoba je hneď zase na hranici.
alter table public.stock_items
  add column if not exists optimal_stock numeric not null default 0;

comment on column public.stock_items.min_stock is
  'Hranica, pod ktorou sa zásoba hlási ako nedostatková.';
comment on column public.stock_items.optimal_stock is
  'Stav, na ktorý sa má doobjednať. Keď je 0, návrh objednávky dopĺňa po min_stock.';
