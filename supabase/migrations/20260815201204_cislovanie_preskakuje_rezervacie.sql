-- Číslovanie musí obísť čísla, ktoré si appka drží pre prácu bez signálu.
--
-- Bez toho by generátor to isté číslo pokojne pridelil niekomu, kto fakturuje
-- online, a po pripojení by sa odložená faktúra pobila s existujúcou.
--
-- Vypršaná rezervácia neblokuje — generátor hľadá najnižšie voľné číslo, takže
-- nepoužité rezervované číslo sa po vypršaní samo vráti do rady.
CREATE OR REPLACE FUNCTION public.faktero_next_invoice_number(_company_id uuid, _issue_date date DEFAULT NULL::date, _type text DEFAULT 'regular'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _format text;
  _date date := COALESCE(_issue_date, (now() AT TIME ZONE 'Europe/Bratislava')::date);
  _monthly boolean;
  _seq integer;
  _pad_token text;
  _pad integer;
  _number text;
  _period_start date;
  _period_end date;
  _strop integer;
  _rezervovanych integer;
  _zalohova boolean := COALESCE(_type, 'regular') = 'proforma';
BEGIN
  IF _uid IS NOT NULL AND NOT public.is_company_member(_company_id, _uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(NULLIF(btrim(invoice_number_format), ''), '{YYYY}{NNNN}')
    INTO _format
    FROM public.companies
   WHERE id = _company_id
     FOR UPDATE;

  IF _format IS NULL THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  -- Vlastná rada pre zálohové doklady.
  IF _zalohova THEN
    _format := 'ZF' || _format;
  END IF;

  _monthly := _format LIKE '%{MM}%';

  IF _monthly THEN
    _period_start := date_trunc('month', _date)::date;
    _period_end := (_period_start + interval '1 month')::date;
  ELSE
    _period_start := date_trunc('year', _date)::date;
    _period_end := (_period_start + interval '1 year')::date;
  END IF;

  SELECT m[1] INTO _pad_token
    FROM regexp_matches(_format, '\{(N{2,4})\}', 'g') AS m
   ORDER BY length(m[1]) DESC
   LIMIT 1;

  _pad := COALESCE(length(_pad_token), 4);

  -- Koľko čísel drží appka rezervovaných pre prácu bez signálu. Musia sa
  -- prirátať k stropu, inak by pri viacerých rezerváciách nebolo kam dohľadať.
  SELECT COUNT(*)
    INTO _rezervovanych
    FROM public.invoice_number_reservations r
   WHERE r.company_id = _company_id
     AND r.used_at IS NULL
     AND r.expires_at > now()
     AND r.issue_date >= _period_start
     AND r.issue_date < _period_end;

  -- Kam až hľadať. Stačí o jedno viac, než koľko živých dokladov v období je —
  -- pri súvislom rade to vyjde na nasledujúce číslo, pri diere na tú dieru.
  SELECT COUNT(*) + COALESCE(_rezervovanych, 0) + 1
    INTO _strop
    FROM public.invoices
   WHERE company_id = _company_id
     AND deleted_at IS NULL
     AND issue_date >= _period_start
     AND issue_date < _period_end;

  -- Najnižšie číslo, ktoré nemá živý doklad ani živú rezerváciu. Zmazané
  -- doklady a vypršané rezervácie číslo neblokujú.
  SELECT k.n, k.cislo
    INTO _seq, _number
    FROM (
      SELECT s.n,
             regexp_replace(
               replace(
                 replace(
                   replace(_format, '{YYYY}', to_char(_date, 'YYYY')),
                   '{YY}', to_char(_date, 'YY')),
                 '{MM}', to_char(_date, 'MM')),
               '\{N{2,4}\}', lpad(s.n::text, _pad, '0'), 'g') AS cislo
        FROM generate_series(1, GREATEST(_strop, 1)) AS s(n)
    ) k
   WHERE NOT EXISTS (
     SELECT 1 FROM public.invoices i
      WHERE i.company_id = _company_id
        AND i.invoice_number = k.cislo
        AND i.deleted_at IS NULL
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.invoice_number_reservations r
      WHERE r.company_id = _company_id
        AND r.invoice_number = k.cislo
        AND r.used_at IS NULL
        AND r.expires_at > now()
   )
   ORDER BY k.n
   LIMIT 1;

  IF _number IS NULL THEN
    RAISE EXCEPTION 'Nepodarilo sa vygenerovať voľné číslo faktúry';
  END IF;

  RETURN jsonb_build_object('invoice_number', _number, 'sequence_number', _seq);
END;
$function$;
