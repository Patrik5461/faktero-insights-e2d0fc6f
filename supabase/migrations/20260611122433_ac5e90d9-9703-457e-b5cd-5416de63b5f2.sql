CREATE OR REPLACE FUNCTION public.faktero_recurring_cron_status()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT jsonb_build_object(
    'job', (SELECT to_jsonb(j) FROM (
              SELECT jobid, jobname, schedule, active
              FROM cron.job WHERE jobname = 'faktero-recurring-daily'
            ) j),
    'runs', COALESCE((SELECT jsonb_agg(r ORDER BY r.start_time DESC) FROM (
              SELECT jrd.jobid, jrd.status, jrd.return_message, jrd.start_time, jrd.end_time
              FROM cron.job_run_details jrd
              JOIN cron.job cj ON cj.jobid = jrd.jobid
              WHERE cj.jobname = 'faktero-recurring-daily'
              ORDER BY jrd.start_time DESC
              LIMIT 20
            ) r), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.faktero_recurring_cron_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.faktero_recurring_cron_status() TO service_role;