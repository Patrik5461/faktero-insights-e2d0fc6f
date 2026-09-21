-- Záloha schémy bez pg_dump. Na serveri nie je heslo k databáze ani Supabase
-- CLI, takže DDL skladá databáza sama a server ho stiahne ako servisná rola.
-- Funkcia len číta katalóg; volať ju smie iba service_role.
create or replace function public.faktero_schema_ddl()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  vystup text := '';
  r record;
  k record;
begin
  vystup := vystup || '-- Faktero: DDL schémy public (+ politiky storage, crony), ' || now()::text || E'\n';
  vystup := vystup || '-- Vyrobené funkciou public.faktero_schema_ddl(), nie pg_dump.' || E'\n\n';

  for r in
    select t.typname, string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) as hodnoty
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    group by t.typname
    order by t.typname
  loop
    vystup := vystup || format('CREATE TYPE public.%I AS ENUM (%s);', r.typname, r.hodnoty) || E'\n';
  end loop;

  for r in
    select sequence_name from information_schema.sequences
    where sequence_schema = 'public' order by sequence_name
  loop
    vystup := vystup || format('CREATE SEQUENCE IF NOT EXISTS public.%I;', r.sequence_name) || E'\n';
  end loop;

  for r in
    select c.oid, c.relname, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by c.relname
  loop
    vystup := vystup || E'\n' || format('CREATE TABLE public.%I (', r.relname) || E'\n' ||
      coalesce((
        select string_agg(
          format('  %I %s%s%s',
            a.attname,
            format_type(a.atttypid, a.atttypmod),
            case when d.adbin is not null then ' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid) else '' end,
            case when a.attnotnull then ' NOT NULL' else '' end),
          E',\n' order by a.attnum)
        from pg_attribute a
        left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
      ), '') || E'\n);\n';

    for k in
      select conname, pg_get_constraintdef(oid) as definicia
      from pg_constraint where conrelid = r.oid
      order by contype, conname
    loop
      vystup := vystup || format('ALTER TABLE public.%I ADD CONSTRAINT %I %s;', r.relname, k.conname, k.definicia) || E'\n';
    end loop;

    if r.relrowsecurity then
      vystup := vystup || format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.relname) || E'\n';
    end if;
  end loop;

  vystup := vystup || E'\n-- Indexy\n';
  for r in
    select i.indexdef
    from pg_indexes i
    where i.schemaname = 'public'
      and not exists (
        select 1 from pg_constraint c
        join pg_class ci on ci.oid = c.conindid
        where ci.relname = i.indexname
      )
    order by i.tablename, i.indexname
  loop
    vystup := vystup || r.indexdef || ';' || E'\n';
  end loop;

  vystup := vystup || E'\n-- Pohľady\n';
  for r in
    select viewname, definition from pg_views where schemaname = 'public' order by viewname
  loop
    vystup := vystup || format('CREATE OR REPLACE VIEW public.%I AS', r.viewname) || E'\n' || r.definition || E'\n';
  end loop;

  vystup := vystup || E'\n-- Funkcie\n';
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    order by p.proname
  loop
    vystup := vystup || pg_get_functiondef(r.oid) || ';' || E'\n';
  end loop;

  vystup := vystup || E'\n-- Spúšťače\n';
  for r in
    select t.oid
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
    order by c.relname, t.tgname
  loop
    vystup := vystup || pg_get_triggerdef(r.oid) || ';' || E'\n';
  end loop;

  vystup := vystup || E'\n-- Politiky (public a storage)\n';
  for r in
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
    order by schemaname, tablename, policyname
  loop
    vystup := vystup || format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
      r.policyname, r.schemaname, r.tablename, r.permissive, r.cmd,
      array_to_string(r.roles, ', '),
      case when r.qual is not null then ' USING (' || r.qual || ')' else '' end,
      case when r.with_check is not null then ' WITH CHECK (' || r.with_check || ')' else '' end) || E'\n';
  end loop;

  vystup := vystup || E'\n-- Kbelíky úložiska\n';
  for r in select id, public from storage.buckets order by id loop
    vystup := vystup || format('-- bucket %s (public=%s)', r.id, r.public) || E'\n';
  end loop;

  vystup := vystup || E'\n-- Crony\n';
  for r in select jobname, schedule, command from cron.job order by jobname loop
    vystup := vystup || format('-- %s [%s]', r.jobname, r.schedule) || E'\n' || r.command || E'\n';
  end loop;

  return vystup;
end;
$$;

revoke all on function public.faktero_schema_ddl() from public;
revoke all on function public.faktero_schema_ddl() from anon, authenticated;
grant execute on function public.faktero_schema_ddl() to service_role;
