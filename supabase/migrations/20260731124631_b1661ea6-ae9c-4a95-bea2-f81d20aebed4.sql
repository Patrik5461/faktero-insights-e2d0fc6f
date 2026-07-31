CREATE OR REPLACE FUNCTION public.faktero_next_invoice_number(_company_id uuid, _issue_date date DEFAULT NULL)
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
BEGIN
  IF _uid IS NOT NULL AND NOT public.is_company_member(_company_id, _uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Lock the company row so concurrent invoices cannot get the same number.
  SELECT COALESCE(NULLIF(btrim(invoice_number_format), ''), '{YYYY}{NNNN}')
    INTO _format
    FROM public.companies
   WHERE id = _company_id
     FOR UPDATE;

  IF _format IS NULL THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  _monthly := _format LIKE '%{MM}%';

  IF _monthly THEN
    _period_start := date_trunc('month', _date)::date;
    _period_end := (_period_start + interval '1 month')::date;
  ELSE
    _period_start := date_trunc('year', _date)::date;
    _period_end := (_period_start + interval '1 year')::date;
  END IF;

  SELECT COALESCE(MAX(sequence_number), 0) + 1
    INTO _seq
    FROM public.invoices
   WHERE company_id = _company_id
     AND issue_date >= _period_start
     AND issue_date < _period_end;

  SELECT m[1] INTO _pad_token
    FROM regexp_matches(_format, '\{(N{2,4})\}', 'g') AS m
   ORDER BY length(m[1]) DESC
   LIMIT 1;

  _pad := COALESCE(length(_pad_token), 4);

  _number := _format;
  _number := replace(_number, '{YYYY}', to_char(_date, 'YYYY'));
  _number := replace(_number, '{YY}', to_char(_date, 'YY'));
  _number := replace(_number, '{MM}', to_char(_date, 'MM'));
  _number := regexp_replace(_number, '\{N{2,4}\}', lpad(_seq::text, _pad, '0'), 'g');

  RETURN jsonb_build_object('invoice_number', _number, 'sequence_number', _seq);
END;
$function$;