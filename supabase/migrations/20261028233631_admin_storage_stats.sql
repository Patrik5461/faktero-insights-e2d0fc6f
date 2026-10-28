/*
  Prehľad úložiska pre Admin → Prehľad jedným dotazom. Predtým sa koše
  prechádzali po priečinkoch cez Storage API — pri tisícoch súborov to trvalo
  dlhšie ako 30 s a nginx požiadavku zrušil (stránka sa nenačítala).
  Len pre service_role (volá ju server po overení platform admina).
*/
create or replace function public.admin_storage_stats()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', b.id, 'files', coalesce(o.files, 0), 'size_bytes', coalesce(o.size_bytes, 0)) order by b.id), '[]'::jsonb)
  from storage.buckets b
  left join (
    select bucket_id, count(*)::bigint as files, coalesce(sum((metadata->>'size')::bigint), 0)::bigint as size_bytes
    from storage.objects
    group by bucket_id
  ) o on o.bucket_id = b.id;
$$;

revoke all on function public.admin_storage_stats() from public, anon, authenticated;
grant execute on function public.admin_storage_stats() to service_role;
