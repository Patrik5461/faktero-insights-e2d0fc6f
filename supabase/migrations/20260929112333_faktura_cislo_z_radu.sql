-- Číslo faktúry sa berie z číselného radu.
--
-- Tvar čísla dovtedy určovala jediná šablóna na karte firmy a predpona podľa
-- typu dokladu (ZF, DDP) zadrôtovaná vo funkcii. Teraz ho určuje rad: firma
-- si ich môže založiť viac (pobočka, prevádzka) a doklad si pamätá, z ktorého
-- číslo dostal. Keď rad nepríde, použije sa predvolený — a ten sa pri prvom
-- doklade založí presne z doterajšieho tvaru, takže sa nič neprečísluje.
--
-- Zámok drží riadok radu: dve faktúry vystavené naraz z toho istého radu si
-- inak vypýtajú to isté číslo.

create or replace function public.faktero_next_invoice_number(
  _company_id uuid,
  _issue_date date default null::date,
  _type text default 'regular'::text,
  _series_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  _uid uuid := auth.uid();
  _format text;
  _date date := COALESCE(_issue_date, (now() AT TIME ZONE 'Europe/Bratislava')::date);
  _monthly boolean;
  _seq integer;
  _number text;
  _period_start date;
  _period_end date;
  _strop integer;
  _rezervovanych integer;
  _rad_id uuid;
  _druh text := CASE COALESCE(_type, 'regular')
                  WHEN 'proforma' THEN 'proforma'
                  WHEN 'advance_payment' THEN 'advance_payment'
                  WHEN 'credit_note' THEN 'credit_note'
                  ELSE 'invoice'
                END;
BEGIN
  IF _uid IS NOT NULL AND NOT public.is_company_member(_company_id, _uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  _rad_id := COALESCE(_series_id, public.faktero_rad_pre_druh(_company_id, _druh));

  SELECT format INTO _format
    FROM public.number_series
   WHERE id = _rad_id AND company_id = _company_id
   FOR UPDATE;

  IF _format IS NULL THEN
    RAISE EXCEPTION 'Číselný rad sa nenašiel.';
  END IF;

  _monthly := _format LIKE '%{MM}%';

  IF _monthly THEN
    _period_start := date_trunc('month', _date)::date;
    _period_end := (_period_start + interval '1 month')::date;
  ELSE
    _period_start := date_trunc('year', _date)::date;
    _period_end := (_period_start + interval '1 year')::date;
  END IF;

  -- Koľko čísel drží appka rezervovaných pre prácu bez signálu.
  SELECT COUNT(*)
    INTO _rezervovanych
    FROM public.invoice_number_reservations r
   WHERE r.company_id = _company_id
     AND r.used_at IS NULL
     AND r.expires_at > now()
     AND r.issue_date >= _period_start
     AND r.issue_date < _period_end;

  SELECT COUNT(*) + COALESCE(_rezervovanych, 0) + 1
    INTO _strop
    FROM public.invoices
   WHERE company_id = _company_id
     AND deleted_at IS NULL
     AND issue_date >= _period_start
     AND issue_date < _period_end;

  -- Najnižšie číslo, ktoré nemá živý doklad ani živú rezerváciu.
  SELECT k.n, k.cislo
    INTO _seq, _number
    FROM (
      SELECT s.n, public.faktero_cislo_zo_sablony(_format, _date, s.n) AS cislo
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

  RETURN jsonb_build_object(
    'invoice_number', _number,
    'sequence_number', _seq,
    'series_id', _rad_id
  );
END;
$function$;

revoke all on function public.faktero_next_invoice_number(uuid, date, text, uuid) from public;
grant execute on function public.faktero_next_invoice_number(uuid, date, text, uuid) to authenticated, service_role;

-- Stará trojparametrová verzia by s novou robila preťaženie a volanie bez
-- radu by Postgres odmietol ako nejednoznačné.
drop function if exists public.faktero_next_invoice_number(uuid, date, text);
