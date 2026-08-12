-- Zrušenie účtu sa na firme so skladom zaseklo.
--
-- 1. `trg_stock_movements_immutable` je SECURITY DEFINER, takže `current_user`
--    v nej je vždy vlastník (postgres) — výnimka pre service_role nikdy
--    nefungovala. Firma so skladovými pohybmi sa preto nedala zmazať.
-- 2. `stock_movements.created_by` má ON DELETE SET NULL, čiže zmazanie
--    prihlásenia spustí UPDATE nad pohybmi — a ten tá istá stráž zakázala.
--    Kto raz naskladnil tovar, nedal sa zmazať vôbec.
--
-- Nemennosť pohybov ostáva; povoľujeme presne dve veci: uvoľnenie autora na
-- NULL (robí to databáza sama pri mazaní používateľa) a mazanie celej firmy
-- cez `faktero_zmaz_firmu`, ktoré si na to zapne príznak v transakcii.

create or replace function public.trg_stock_movements_immutable()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  -- Mazanie celej firmy — príznak nastavuje iba faktero_zmaz_firmu().
  IF coalesce(current_setting('faktero.mazanie_firmy', true), '') = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- SECURITY DEFINER prepíše current_user na vlastníka, preto aj session_user.
  IF current_user = 'service_role' OR session_user = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Uvoľnenie autora (ON DELETE SET NULL pri mazaní používateľa) nie je zmena
  -- pohybu — čísla ostávajú, mizne len meno.
  IF TG_OP = 'UPDATE'
     AND NEW.created_by IS NULL
     AND OLD.created_by IS NOT NULL
     AND to_jsonb(NEW) - 'created_by' = to_jsonb(OLD) - 'created_by' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'FAKTERO_STOCK:movement_immutable' USING ERRCODE = 'P0001';
END
$function$;

-- Zmazanie firmy aj s jej skladovou históriou. Volá sa iba pri rušení účtu.
create or replace function public.faktero_zmaz_firmu(_company_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  PERFORM set_config('faktero.mazanie_firmy', 'on', true);
  DELETE FROM public.companies WHERE id = _company_id;
  PERFORM set_config('faktero.mazanie_firmy', 'off', true);
END
$function$;

-- Právo drží PUBLIC, nie anon — odoberá sa teda PUBLIC.
revoke all on function public.faktero_zmaz_firmu(uuid) from public;
grant execute on function public.faktero_zmaz_firmu(uuid) to service_role;
