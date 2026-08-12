-- Strop hľadania voľného čísla nesmie počítať len doklady vlastnej rady.
-- Firma, ktorá kedysi vystavila zálohovú faktúru v spoločnej rade (napr.
-- 20260004 medzi faktúrami), by inak narazila: strop by skončil na obsadenom
-- čísle a číslovanie by zlyhalo s „Nepodarilo sa vygenerovať voľné číslo“.
-- Oddelenie rád zabezpečuje predpona ZF, nie tento počet.
create or replace function public.faktero_next_invoice_number(
  _company_id uuid,
  _issue_date date default null::date,
  _type text default 'regular'
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
  _pad_token text;
  _pad integer;
  _number text;
  _period_start date;
  _period_end date;
  _strop integer;
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

  -- Kam až hľadať. Stačí o jedno viac, než koľko živých dokladov v období je —
  -- pri súvislom rade to vyjde na nasledujúce číslo, pri diere na tú dieru.
  SELECT COUNT(*) + 1
    INTO _strop
    FROM public.invoices
   WHERE company_id = _company_id
     AND deleted_at IS NULL
     AND issue_date >= _period_start
     AND issue_date < _period_end;

  -- Najnižšie číslo, ktoré nemá živý doklad. Zmazané doklady číslo neblokujú.
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
   ORDER BY k.n
   LIMIT 1;

  IF _number IS NULL THEN
    RAISE EXCEPTION 'Nepodarilo sa vygenerovať voľné číslo faktúry';
  END IF;

  RETURN jsonb_build_object('invoice_number', _number, 'sequence_number', _seq);
END;
$function$;
