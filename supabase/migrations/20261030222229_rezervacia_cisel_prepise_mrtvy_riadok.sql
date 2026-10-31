-- Rezervácia čísel pre faktúry bez signálu sa zasekla na starom riadku.
--
-- Generátor `faktero_next_invoice_number` vráti najnižšie voľné číslo a za
-- obsadené berie len živé faktúry a živé (nepoužité, nevypršané) rezervácie.
-- V tabuľke rezervácií ale ostávajú aj vypršané a použité riadky (faktúru
-- medzitým zmazali) a jedinečný index (company_id, invoice_number) potom
-- nepustil novú rezerváciu toho istého čísla: celé volanie spadlo a appka
-- ukazovala „Pripravených čísel: 0" — natrvalo, lebo starý riadok nikto neupratuje.
--
-- Riadok, na ktorý generátor ukázal, je podľa definície mŕtvy (inak by číslo
-- nevrátil), preto sa prepíše na novú rezerváciu.
CREATE OR REPLACE FUNCTION public.faktero_reserve_invoice_numbers(_company_id uuid, _count integer DEFAULT 5, _device text DEFAULT NULL::text, _days integer DEFAULT 14)
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
BEGIN IF auth.uid() IS NOT NULL AND NOT public.mfa_ok() THEN RAISE EXCEPTION 'mfa_required' USING ERRCODE = '42501'; END IF;
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
    -- Vypršaný alebo použitý riadok s tým istým číslom (faktúra zmazaná) sa
    -- prepíše — generátor by živú rezerváciu ani živú faktúru nevrátil.
    INSERT INTO public.invoice_number_reservations
      (company_id, invoice_number, sequence_number, issue_date, device, created_by, expires_at)
    VALUES (_company_id, _r->>'invoice_number', (_r->>'sequence_number')::integer,
            _date, _device, _uid, _expires)
    ON CONFLICT (company_id, invoice_number) DO UPDATE SET
      sequence_number = EXCLUDED.sequence_number,
      issue_date = EXCLUDED.issue_date,
      device = EXCLUDED.device,
      created_by = EXCLUDED.created_by,
      expires_at = EXCLUDED.expires_at,
      created_at = now(),
      used_at = NULL,
      invoice_id = NULL;
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
