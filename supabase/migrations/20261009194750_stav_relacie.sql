-- Serverové funkcie overujú token len podpisom (getClaims) — zakázaný účet,
-- zmazaný účet či relácia zrušená cez „odhlásiť všade" by prešli až do
-- vypršania tokenu. Middleware sa pýta tu (s pamäťou na minútu).
create or replace function public.stav_relacie()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'mfa_ok', public.mfa_ok(),
    'aktivna',
      exists (
        select 1 from auth.users u
        where u.id = auth.uid()
          and u.deleted_at is null
          and (u.banned_until is null or u.banned_until <= now())
      )
      and (
        (auth.jwt() ->> 'session_id') is null
        or exists (select 1 from auth.sessions s where s.id = (auth.jwt() ->> 'session_id')::uuid)
      )
  );
$$;

revoke all on function public.stav_relacie() from public, anon;
grant execute on function public.stav_relacie() to authenticated;
