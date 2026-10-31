-- Výmena FAKTERO_CRON_TOKEN v úlohách pg_cron (skript /home/patrik/vymen-cron-token.sh).
-- Úlohy vlastní postgres a cron.alter_job dovolí meniť len vlastníkovi,
-- preto security definer. Volá len service_role; nahrádza len presný reťazec
-- starého tokenu (kto ho nepozná, nič nezmení) a nový musí byť 64 hex znakov,
-- takže sa do príkazu úlohy nedá vpašovať SQL.
create or replace function public.faktero_vymen_cron_token(
  p_stary text,
  p_novy text,
  p_skuska boolean default true
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  j record;
  n integer := 0;
begin
  if p_stary is null or length(p_stary) < 16 then
    raise exception 'neplatný starý token';
  end if;
  if not p_skuska and (p_novy is null or p_novy !~ '^[0-9a-f]{64}$') then
    raise exception 'nový token musí byť 64 hex znakov';
  end if;
  for j in select jobid, command from cron.job where strpos(command, p_stary) > 0 loop
    n := n + 1;
    if not p_skuska then
      perform cron.alter_job(j.jobid, command := replace(j.command, p_stary, p_novy));
    end if;
  end loop;
  return n;
end;
$$;

revoke all on function public.faktero_vymen_cron_token(text, text, boolean) from public, anon, authenticated;
grant execute on function public.faktero_vymen_cron_token(text, text, boolean) to service_role;
