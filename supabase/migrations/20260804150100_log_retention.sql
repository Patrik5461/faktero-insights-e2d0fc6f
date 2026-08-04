-- Retencia prevádzkových logov.
--
-- Doteraz sa nemazalo nič. Dva problémy:
--   1. api_logs ukladá kompletné request_body a response_body — teda faktúry,
--      odberateľov, adresy a IP. To sú osobné údaje držané bez lehoty, čo je
--      v rozpore so zásadou minimalizácie (GDPR čl. 5 ods. 1 písm. e).
--   2. Tabuľky rastú neobmedzene a spomaľujú dotazy nad nimi — vrátane
--      rate-limit COUNT(*) v handleApi, ktorý beží pri každom API requeste.
--
-- Zámerne sa NEMAŽE:
--   platform_audit_logs, stock_audit_logs  — auditná stopa, uchováva sa
--   invoice_email_logs, quote_email_logs   — doklad o odoslaní faktúry
--   import_logs, export_logs               — viazané na účtovné výstupy

CREATE OR REPLACE FUNCTION public.prune_operational_logs()
RETURNS TABLE (table_name text, rows_affected bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n bigint;
BEGIN
  -- Telá requestov/response po 30 dňoch zahodíme, ale riadok necháme —
  -- štatistiky využitia API a rate limiting fungujú ďalej bez osobných údajov.
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

  -- Účtovné/platobné udalosti držíme rok kvôli dohľadateľnosti platieb.
  DELETE FROM public.billing_events WHERE created_at < now() - interval '365 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'billing_events'; rows_affected := n; RETURN NEXT;

  DELETE FROM public.seo_cache WHERE expires_at < now() - interval '7 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  table_name := 'seo_cache'; rows_affected := n; RETURN NEXT;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_operational_logs() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_operational_logs() TO service_role;

COMMENT ON FUNCTION public.prune_operational_logs() IS
  'Denná retencia prevádzkových logov. Spúšťa pg_cron job faktero-prune-logs.';

-- Index pod mazacie predikáty — bez neho je každé nočné mazanie seq scan.
CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON public.api_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_created_at ON public.webhook_delivery_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_commander_sync_logs_created_at ON public.commander_sync_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_tesla_sync_logs_created_at ON public.tesla_sync_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_company_lookup_logs_created_at ON public.company_lookup_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_billing_events_created_at ON public.billing_events (created_at);

-- Naplánovanie na 03:40 UTC denne. Ak pg_cron v projekte nie je, migrácia
-- prejde a job si doplníš ručne rovnakým príkazom.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('faktero-prune-logs')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'faktero-prune-logs');
    PERFORM cron.schedule(
      'faktero-prune-logs',
      '40 3 * * *',
      $cron$SELECT public.prune_operational_logs();$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron nie je nainštalovaný — prune_operational_logs() treba naplánovať ručne.';
  END IF;
END;
$$;
