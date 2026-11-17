-- Doplnenie testovacích firiem pre existujúce firmy (druhá časť migrácie testovacie_firmy).
-- 8b. Doplnenie pre existujúce firmy ---------------------------------------
--    Bez QA/skúšobných firiem (Faktero Demo, QA Česká, Test, Test Zmazanie,
--    test2, Testovacia firma) a bez zablokovaných firiem (suspended_at).

do $$
declare
  _r record;
  _n integer := 0;
begin
  for _r in
    select c.id
      from public.companies c
     where c.testovacia_pre is null
       and c.suspended_at is null
       and c.id not in (
         '6161ba4f-98b1-44d5-8fe7-5ffde2d76369', -- Faktero Demo s.r.o.
         'bf72406d-e40a-43c9-ada2-40c9330fae80', -- QA Česká s.r.o.
         'ec3ff79b-1bbc-4726-80e3-93577751a123', -- Test
         '6f22edcc-a110-43bd-8a92-6f36f4aaec48', -- Test Zmazanie s.r.o.
         'dfe7e0d7-77a9-4ede-b978-d3ee8f896f15', -- test2
         '4a7a8ff8-488f-402d-975f-cf5fbb8290df'  -- Testovacia firma
       )
       and not exists (select 1 from public.companies t where t.testovacia_pre = c.id)
     order by c.created_at
  loop
    perform public.faktero_zaloz_testovaciu_firmu(_r.id);
    _n := _n + 1;
  end loop;
  raise notice 'Založených testovacích firiem: %', _n;
end $$;
