
CREATE OR REPLACE FUNCTION public.admin_db_usage_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  _uid uuid := auth.uid();
  _db_size bigint;
  _tables jsonb;
BEGIN
  -- Allow service_role (no auth.uid) or platform admin
  IF _uid IS NOT NULL AND NOT public.is_platform_admin(_uid) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT pg_database_size(current_database()) INTO _db_size;

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'size_bytes')::bigint DESC), '[]'::jsonb)
  INTO _tables
  FROM (
    SELECT jsonb_build_object(
      'schema', schemaname,
      'table', tablename,
      'size_bytes', pg_total_relation_size(format('%I.%I', schemaname, tablename)::regclass),
      'size_pretty', pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, tablename)::regclass))
    ) AS t
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(format('%I.%I', schemaname, tablename)::regclass) DESC
    LIMIT 10
  ) sub;

  RETURN jsonb_build_object(
    'db_size_bytes', _db_size,
    'tables', _tables
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_db_usage_stats() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_db_usage_stats() TO service_role;
