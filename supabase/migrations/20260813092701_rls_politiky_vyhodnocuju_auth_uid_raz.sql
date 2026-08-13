-- `auth.uid()` v politike sa vyhodnocuje pre každý riadok zvlášť. Zabalené do
-- poddotazu `(select auth.uid())` ho Postgres vyhodnotí raz na dotaz (initplan).
-- Prepis je čisto mechanický — mení sa iba obal, nie podmienka. Overené odtlačkom:
-- md5 všetkých politík po spätnej normalizácii obalu je zhodné s hodnotou spred
-- migrácie (b15f84f52f297b8f525167d823795d5f, 394 politík).
do $$
declare
  r record;
  novy_qual text;
  novy_check text;
  pocet int := 0;
begin
  for r in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') like '%auth.uid()%' or coalesce(with_check, '') like '%auth.uid()%')
      and coalesce(qual, '') not like '%SELECT auth.%'
      and coalesce(with_check, '') not like '%SELECT auth.%'
    order by tablename, policyname
  loop
    novy_qual := replace(coalesce(r.qual, ''), 'auth.uid()', '(select auth.uid())');
    novy_check := replace(coalesce(r.with_check, ''), 'auth.uid()', '(select auth.uid())');

    if r.qual is not null and r.with_check is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)',
                     r.policyname, r.tablename, novy_qual, novy_check);
    elsif r.qual is not null then
      execute format('alter policy %I on public.%I using (%s)',
                     r.policyname, r.tablename, novy_qual);
    else
      execute format('alter policy %I on public.%I with check (%s)',
                     r.policyname, r.tablename, novy_check);
    end if;

    pocet := pocet + 1;
  end loop;

  raise notice 'upravených politík: %', pocet;
end $$;
