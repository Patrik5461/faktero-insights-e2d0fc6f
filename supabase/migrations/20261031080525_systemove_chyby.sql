-- Systémové chyby: pády servera, chyby z prehliadača a appky, zlyhané hooky.
-- Rovnaké chyby (rovnaký odtlačok) sa zlučujú do jedného riadku s počtom
-- výskytov, takže sa tabuľka nenafúkne ani pri chybe v slučke.
--
-- Tabuľka je platformová (nie dáta firmy): company_id/user_id sú len štítky
-- pre admina, preto sa na ňu nevzťahuje firmy_s_pravom() — číta ju výhradne
-- platform admin (is_platform_admin), zapisuje len service_role cez RPC.
-- Reštriktívna mfa_ok() platí rovnako ako všade inde.

create table if not exists public.systemove_chyby (
  id uuid primary key default gen_random_uuid(),
  odtlacok text not null unique,
  zdroj text not null check (zdroj in ('server', 'prehliadac', 'appka', 'cron', 'hook')),
  uroven text not null default 'chyba' check (uroven in ('chyba', 'varovanie', 'stare_vydanie')),
  sprava text not null,
  stack text,
  trasa text,
  metoda text,
  http_status integer,
  company_id uuid,
  user_id uuid,
  user_agent text,
  vydanie text,
  pocet integer not null default 1,
  prvy_vyskyt timestamptz not null default now(),
  posledny_vyskyt timestamptz not null default now(),
  vyriesene_at timestamptz,
  vyriesil uuid,
  znovu_otvorene integer not null default 0,
  posledne_upozornenie_at timestamptz
);

create index if not exists systemove_chyby_posledny_idx on public.systemove_chyby (posledny_vyskyt desc);
create index if not exists systemove_chyby_zdroj_idx on public.systemove_chyby (zdroj, posledny_vyskyt desc);

alter table public.systemove_chyby enable row level security;

drop policy if exists "platform admin cita systemove chyby" on public.systemove_chyby;
create policy "platform admin cita systemove chyby" on public.systemove_chyby
  for select to authenticated using ((select public.is_platform_admin(auth.uid())));

drop policy if exists "mfa ak je zapnute" on public.systemove_chyby;
create policy "mfa ak je zapnute" on public.systemove_chyby as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

revoke all on public.systemove_chyby from anon, public, authenticated;
grant select on public.systemove_chyby to authenticated;
grant all on public.systemove_chyby to service_role;

-- Zápis / zlúčenie jednej chyby. Vráti, či treba poslať upozornenie:
-- len pri novej alebo znovu otvorenej chybe úrovne „chyba“ a najviac raz za
-- hodinu na odtlačok.
create or replace function public.zapis_systemovu_chybu(p jsonb, p_pocet integer default 1)
returns table (id uuid, nova boolean, upozornit boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
declare
  r public.systemove_chyby%rowtype;
  v_odtlacok text := left(p->>'odtlacok', 64);
  v_nova boolean := false;
  v_znovu boolean := false;
  v_pocet integer := greatest(1, least(coalesce(p_pocet, 1), 100000));
  v_uuid_re text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_upozornit boolean;
  v_id uuid;
begin
  if v_odtlacok is null or v_odtlacok = '' then
    raise exception 'chýba odtlačok';
  end if;

  select * into r from public.systemove_chyby s where s.odtlacok = v_odtlacok for update;
  if found then
    v_znovu := r.vyriesene_at is not null;
    update public.systemove_chyby s set
      pocet = s.pocet + v_pocet,
      posledny_vyskyt = now(),
      -- Posledný kontext je pre ladenie užitočnejší ako prvý.
      stack = coalesce(left(p->>'stack', 8000), s.stack),
      trasa = coalesce(left(p->>'trasa', 500), s.trasa),
      metoda = coalesce(left(p->>'metoda', 10), s.metoda),
      http_status = coalesce(case when (p->>'http_status') ~ '^\d{1,3}$' then (p->>'http_status')::int end, s.http_status),
      company_id = coalesce(case when (p->>'company_id') ~ v_uuid_re then (p->>'company_id')::uuid end, s.company_id),
      user_id = coalesce(case when (p->>'user_id') ~ v_uuid_re then (p->>'user_id')::uuid end, s.user_id),
      user_agent = coalesce(left(p->>'user_agent', 300), s.user_agent),
      vydanie = coalesce(left(p->>'vydanie', 60), s.vydanie),
      znovu_otvorene = s.znovu_otvorene + case when v_znovu then 1 else 0 end,
      vyriesene_at = null,
      vyriesil = null
    where s.id = r.id
    returning s.* into r;
  else
    insert into public.systemove_chyby as s (
      odtlacok, zdroj, uroven, sprava, stack, trasa, metoda, http_status,
      company_id, user_id, user_agent, vydanie, pocet
    ) values (
      v_odtlacok,
      p->>'zdroj',
      coalesce(p->>'uroven', 'chyba'),
      left(coalesce(nullif(p->>'sprava', ''), '(bez správy)'), 1000),
      left(p->>'stack', 8000),
      left(p->>'trasa', 500),
      left(p->>'metoda', 10),
      case when (p->>'http_status') ~ '^\d{1,3}$' then (p->>'http_status')::int end,
      case when (p->>'company_id') ~ v_uuid_re then (p->>'company_id')::uuid end,
      case when (p->>'user_id') ~ v_uuid_re then (p->>'user_id')::uuid end,
      left(p->>'user_agent', 300),
      left(p->>'vydanie', 60),
      v_pocet
    )
    on conflict (odtlacok) do update set
      pocet = s.pocet + excluded.pocet,
      posledny_vyskyt = now()
    returning s.id, (s.xmax = 0) into v_id, v_nova;
    select * into r from public.systemove_chyby s where s.id = v_id;
  end if;

  v_upozornit := r.uroven = 'chyba' and (v_nova or v_znovu)
    and (r.posledne_upozornenie_at is null or r.posledne_upozornenie_at < now() - interval '1 hour');
  if v_upozornit then
    update public.systemove_chyby s set posledne_upozornenie_at = now() where s.id = r.id;
  end if;
  return query select r.id, v_nova, v_upozornit;
end;
$$;

revoke all on function public.zapis_systemovu_chybu(jsonb, integer) from public, anon, authenticated;
grant execute on function public.zapis_systemovu_chybu(jsonb, integer) to service_role;

-- Zlyhané behy pg_cron a chybné odpovede pg_net (hooky volané cez net.http_post).
-- Schémy cron/net PostgREST nevidí; funkcia je len pre service_role a server
-- ju volá až po overení platform admina.
create or replace function public.admin_zlyhane_crony(p_od timestamptz)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'behy', coalesce((
      select jsonb_agg(x order by x.posledny desc)
      from (
        select coalesce(j.jobname, 'job ' || d.jobid) as nazov,
               count(*) as pocet,
               max(d.start_time) as posledny,
               (array_agg(left(d.return_message, 500) order by d.start_time desc))[1] as sprava,
               (select count(*) from cron.job_run_details d2
                 where d2.jobid = d.jobid and d2.start_time >= p_od) as behov_spolu
        from cron.job_run_details d
        left join cron.job j on j.jobid = d.jobid
        where d.status = 'failed' and d.start_time >= p_od
        group by d.jobid, j.jobname
      ) x
    ), '[]'::jsonb),
    'http', coalesce((
      select jsonb_agg(y order by y.posledny desc)
      from (
        select r.status_code,
               coalesce(r.timed_out, false) as timed_out,
               left(r.error_msg, 300) as error_msg,
               count(*) as pocet,
               max(r.created) as posledny,
               (array_agg(left(r.content, 300) order by r.created desc))[1] as obsah
        from net._http_response r
        where r.created >= p_od
          and (r.error_msg is not null or coalesce(r.timed_out, false) or r.status_code >= 400)
        group by r.status_code, coalesce(r.timed_out, false), left(r.error_msg, 300)
      ) y
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_zlyhane_crony(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_zlyhane_crony(timestamptz) to service_role;

-- Čistenie: chyby, ktoré sa 90 dní neopakovali, preč.
create or replace function public.vycisti_systemove_chyby()
returns integer
language sql
security definer
set search_path to 'public'
as $$
  with d as (
    delete from public.systemove_chyby where posledny_vyskyt < now() - interval '90 days' returning 1
  ) select count(*)::int from d;
$$;

revoke all on function public.vycisti_systemove_chyby() from public, anon, authenticated;
grant execute on function public.vycisti_systemove_chyby() to service_role;

do $$
begin
  perform cron.unschedule('faktero-systemove-chyby-cistenie')
  where exists (select 1 from cron.job where jobname = 'faktero-systemove-chyby-cistenie');
  perform cron.schedule('faktero-systemove-chyby-cistenie', '50 3 * * *', 'select public.vycisti_systemove_chyby();');
end $$;
