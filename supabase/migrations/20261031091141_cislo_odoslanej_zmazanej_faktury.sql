-- Odoslaná faktúra si číslo drží aj po zmazaní.
--
-- Generátor `faktero_next_invoice_number` zapĺňa diery po zmazaných faktúrach
-- (unikátny index invoices_cislo_uniq je len na živých). Pre faktúru, ktorú
-- odberateľ už dostal (e-mailom, eFaktúrou, alebo bola označená ako odoslaná),
-- je to chyba: to isté číslo by dostala iná faktúra a u odberateľa by ležali
-- dva rôzne doklady s jedným číslom. Taká diera ostáva, nová faktúra dostane
-- ďalšie číslo. Neodoslanú zmazanú faktúru (preklep, koncept) generátor
-- naďalej použije znova.
--
-- „Odoslaná“ rovnako ako `uzOdoslana()` v datum-vystavenia.ts: sent_at, stav
-- sent, úspešný e-mail v invoice_email_logs alebo nezlyhané doručenie eFaktúry.

create or replace function public.faktero_faktura_odoslana(_invoice_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
           select 1 from public.invoices i
            where i.id = _invoice_id
              and (i.sent_at is not null or i.status::text = 'sent')
         )
      or exists (
           select 1 from public.invoice_email_logs l
            where l.invoice_id = _invoice_id and l.status::text = 'sent'
         )
      or exists (
           select 1
             from public.efaktura_documents d
             join public.efaktura_deliveries v on v.document_id = d.id
            where d.invoice_id = _invoice_id
              and lower(coalesce(v.status::text, '')) not in ('failed', 'error', 'rejected')
         );
$function$;

revoke all on function public.faktero_faktura_odoslana(uuid) from public, anon, authenticated;
grant execute on function public.faktero_faktura_odoslana(uuid) to service_role;

-- Hľadanie čísla medzi zmazanými (živé pokrýva invoices_cislo_uniq).
create index if not exists invoices_cislo_zmazane
  on public.invoices (company_id, invoice_number)
  where deleted_at is not null;

CREATE OR REPLACE FUNCTION public.faktero_next_invoice_number(_company_id uuid, _issue_date date DEFAULT NULL::date, _type text DEFAULT 'regular'::text, _series_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _format text;
  _od_poradia integer;
  _date date := COALESCE(_issue_date, (now() AT TIME ZONE 'Europe/Bratislava')::date);
  _monthly boolean;
  _seq integer;
  _number text;
  _period_start date;
  _period_end date;
  _strop integer;
  _rezervovanych integer;
  _drzanych integer;
  _rad_id uuid;
  _druh text := CASE COALESCE(_type, 'regular')
                  WHEN 'proforma' THEN 'proforma'
                  WHEN 'advance_payment' THEN 'advance_payment'
                  WHEN 'credit_note' THEN 'credit_note'
                  WHEN 'debit_note' THEN 'debit_note'
                  ELSE 'invoice'
                END;
BEGIN IF auth.uid() IS NOT NULL AND NOT public.mfa_ok() THEN RAISE EXCEPTION 'mfa_required' USING ERRCODE = '42501'; END IF;
  IF _uid IS NOT NULL AND NOT public.is_company_member(_company_id, _uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  _rad_id := COALESCE(_series_id, public.faktero_rad_pre_druh(_company_id, _druh));

  SELECT format, greatest(coalesce(start_from, 1), 1)
    INTO _format, _od_poradia
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

  SELECT COUNT(*)
    INTO _rezervovanych
    FROM public.invoice_number_reservations r
   WHERE r.company_id = _company_id
     AND r.used_at IS NULL
     AND r.expires_at > now()
     AND r.issue_date >= _period_start
     AND r.issue_date < _period_end;

  -- Zmazané, ale odoslané faktúry obdobia číslo držia — strop musí rátať aj s nimi.
  SELECT COUNT(*)
    INTO _drzanych
    FROM public.invoices i
   WHERE i.company_id = _company_id
     AND i.deleted_at IS NOT NULL
     AND i.issue_date >= _period_start
     AND i.issue_date < _period_end
     AND public.faktero_faktura_odoslana(i.id);

  SELECT _od_poradia + COUNT(*) + COALESCE(_rezervovanych, 0) + COALESCE(_drzanych, 0)
    INTO _strop
    FROM public.invoices
   WHERE company_id = _company_id
     AND deleted_at IS NULL
     AND issue_date >= _period_start
     AND issue_date < _period_end;

  SELECT k.n, k.cislo
    INTO _seq, _number
    FROM (
      SELECT s.n, public.faktero_cislo_zo_sablony(_format, _date, s.n) AS cislo
        FROM generate_series(_od_poradia, GREATEST(_strop, _od_poradia)) AS s(n)
    ) k
   WHERE NOT EXISTS (
     SELECT 1 FROM public.invoices i
      WHERE i.company_id = _company_id
        AND i.invoice_number = k.cislo
        AND i.deleted_at IS NULL
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.invoices i
      WHERE i.company_id = _company_id
        AND i.invoice_number = k.cislo
        AND i.deleted_at IS NOT NULL
        AND public.faktero_faktura_odoslana(i.id)
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
