-- Dobrovoľné dvojfaktorové overenie (TOTP). Kto ho má zapnuté, k dátam sa
-- dostane len reláciou, ktorá zadala kód (aal2) — ukradnuté heslo nestačí,
-- ani cez priame volanie rozhrania. Kto ho zapnuté nemá, pre toho sa nič nemení.
create or replace function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;

revoke all on function public.mfa_ok() from public;
grant execute on function public.mfa_ok() to authenticated, service_role;

-- Reštriktívna politika sa pridá ku všetkým doterajším — prístup potom
-- musí povoliť pôvodná politika A zároveň táto. `(select …)` sa vyhodnotí
-- raz za dotaz, nie za každý riadok. NOVÁ TABUĽKA ju nedostane sama — pridaj
-- ju v jej migrácii (pozri pamäť faktero-dvojfaktor).
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and rowsecurity loop
    execute format('drop policy if exists "mfa ak je zapnute" on public.%I', t.tablename);
    execute format(
      'create policy "mfa ak je zapnute" on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))',
      t.tablename
    );
  end loop;
end $$;

drop policy if exists "mfa ak je zapnute" on storage.objects;
create policy "mfa ak je zapnute" on storage.objects as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
