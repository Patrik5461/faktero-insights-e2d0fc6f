-- Nočné upratovanie berie aj potvrdenia preposielania: deň po vypršaní sú na nič
-- (odkaz od Googlu už dávno neplatí) a nesú adresu cudzej schránky.
CREATE OR REPLACE FUNCTION public.prune_operational_logs()
 RETURNS TABLE(table_name text, rows_affected bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  n bigint;
BEGIN
  UPDATE public.api_logs
     SET request_body = NULL, response_body = NULL
   WHERE created_at < now() - interval '30 days'
     AND (request_body IS NOT NULL OR response_body IS NOT NULL);
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'api_logs (telá vymazané)'; rows_affected := n; RETURN NEXT;

  DELETE FROM public.api_logs WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'api_logs'; rows_affected := n; RETURN NEXT;

  DELETE FROM public.webhook_logs WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'webhook_logs'; rows_affected := n; RETURN NEXT;

  DELETE FROM public.webhook_delivery_logs WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'webhook_delivery_logs'; rows_affected := n; RETURN NEXT;

  DELETE FROM public.commander_sync_logs WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'commander_sync_logs'; rows_affected := n; RETURN NEXT;

  DELETE FROM public.tesla_sync_logs WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'tesla_sync_logs'; rows_affected := n; RETURN NEXT;

  DELETE FROM public.company_lookup_logs WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'company_lookup_logs'; rows_affected := n; RETURN NEXT;

  DELETE FROM public.billing_events WHERE created_at < now() - interval '365 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'billing_events'; rows_affected := n; RETURN NEXT;

  DELETE FROM public.seo_cache WHERE expires_at < now() - interval '7 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'seo_cache'; rows_affected := n; RETURN NEXT;

  DELETE FROM public.inbox_verifications WHERE expires_at < now() - interval '1 day';
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'inbox_verifications'; rows_affected := n; RETURN NEXT;

  RETURN;
END;
$function$;
