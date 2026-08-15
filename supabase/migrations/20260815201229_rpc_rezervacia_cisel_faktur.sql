-- Rezervuje `_count` najbližších voľných čísel pre prácu bez signálu.
--
-- Formát čísla sa tu zámerne neopakuje — volá sa `faktero_next_invoice_number`,
-- ktorý už rezervácie preskakuje, takže každé ďalšie volanie v tej istej
-- transakcii vráti nasledujúce voľné číslo. Zámok na `companies` drží prvé
-- volanie, takže dvaja ľudia naraz nedostanú to isté.
CREATE OR REPLACE FUNCTION public.faktero_reserve_invoice_numbers(
  _company_id uuid,
  _count integer DEFAULT 5,
  _device text DEFAULT NULL,
  _days integer DEFAULT 14
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _i integer;
  _r jsonb;
  _out jsonb := '[]'::jsonb;
  _date date := (now() AT TIME ZONE 'Europe/Bratislava')::date;
  _expires timestamptz := now() + make_interval(days => GREATEST(COALESCE(_days, 14), 1));
  _zive integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id, _uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _count IS NULL OR _count < 1 OR _count > 30 THEN
    RAISE EXCEPTION 'Rezervovať sa dá 1 až 30 čísel';
  END IF;

  -- Strop na firmu, nech sa nedá zabrať celá rada. Čísla sa aj tak vracajú
  -- späť, keď rezervácia vyprší.
  SELECT COUNT(*) INTO _zive
    FROM public.invoice_number_reservations
   WHERE company_id = _company_id AND used_at IS NULL AND expires_at > now();
  IF _zive + _count > 60 THEN
    RAISE EXCEPTION 'Naraz sa dá držať najviac 60 nepoužitých čísel';
  END IF;

  FOR _i IN 1.._count LOOP
    _r := public.faktero_next_invoice_number(_company_id, _date, 'regular');
    INSERT INTO public.invoice_number_reservations
      (company_id, invoice_number, sequence_number, issue_date, device, created_by, expires_at)
    VALUES (_company_id, _r->>'invoice_number', (_r->>'sequence_number')::integer,
            _date, _device, _uid, _expires);
    _out := _out || jsonb_build_object(
      'invoice_number', _r->>'invoice_number',
      'sequence_number', (_r->>'sequence_number')::integer,
      'issue_date', _date,
      'expires_at', _expires
    );
  END LOOP;

  RETURN _out;
END;
$function$;

-- Vráti nepoužité čísla do rady — pri vypnutí funkcie alebo pri odhlásení.
CREATE OR REPLACE FUNCTION public.faktero_release_invoice_numbers(
  _company_id uuid,
  _numbers text[] DEFAULT NULL
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _pocet integer;
BEGIN
  IF _uid IS NULL OR NOT public.is_company_member(_company_id, _uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.invoice_number_reservations
   WHERE company_id = _company_id
     AND used_at IS NULL
     AND created_by = _uid
     AND (_numbers IS NULL OR invoice_number = ANY(_numbers));
  GET DIAGNOSTICS _pocet = ROW_COUNT;
  RETURN _pocet;
END;
$function$;

REVOKE ALL ON FUNCTION public.faktero_reserve_invoice_numbers(uuid, integer, text, integer) FROM public;
REVOKE ALL ON FUNCTION public.faktero_release_invoice_numbers(uuid, text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.faktero_reserve_invoice_numbers(uuid, integer, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.faktero_release_invoice_numbers(uuid, text[]) TO authenticated;
