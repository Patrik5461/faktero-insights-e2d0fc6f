-- Meranie využitia AI.
--
-- Kredit u Gemini ani u OpenAI sa cez ich rozhranie vyčítať nedá, takže jediné,
-- čo sa dá ukázať, je vlastná spotreba: kto, kedy, ktorým modelom a za koľko.
-- Doteraz sa nezapisovalo nič — o tom, že Gemini vypadol a platí sa OpenAI, bol
-- záznam len v logu procesu.
create table if not exists public.ai_pouzitie (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  poskytovatel text not null check (poskytovatel in ('gemini', 'openai')),
  model text not null,
  -- Agenda, ktorá si model vypýtala (bloček, doklad z pošty, výpis…).
  ucel text not null default 'neznáme',
  company_id uuid references public.companies(id) on delete set null,
  vstupne_tokeny integer,
  vystupne_tokeny integer,
  trvanie_ms integer,
  ok boolean not null default true,
  -- true, keď sa na tohto poskytovateľa šlo až po zlyhaní predošlého.
  nahrada boolean not null default false,
  chyba text
);

create index if not exists ai_pouzitie_cas on public.ai_pouzitie (created_at desc);

alter table public.ai_pouzitie enable row level security;

-- Tabuľku číta a píše len server (servisný kľúč), prihlásený človek k nej
-- nemá čo hľadať. Právo drží aj PUBLIC, preto sa odoberá menovite.
revoke all on public.ai_pouzitie from public;
revoke all on public.ai_pouzitie from anon;
revoke all on public.ai_pouzitie from authenticated;
grant all on public.ai_pouzitie to service_role;

-- Poistka podľa pravidla, že každá nová tabuľka dostane dvojfaktor.
drop policy if exists "mfa ak je zapnute" on public.ai_pouzitie;
create policy "mfa ak je zapnute" on public.ai_pouzitie as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- Súhrn pre admin obrazovku: zoskupené po dňoch, nie riadok po riadku.
create or replace function public.ai_pouzitie_suhrn(_od timestamptz)
returns table (
  den date,
  poskytovatel text,
  model text,
  ucel text,
  ok boolean,
  volani bigint,
  vstup bigint,
  vystup bigint,
  trvanie bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ((a.created_at at time zone 'Europe/Bratislava')::date) as den,
    a.poskytovatel,
    a.model,
    a.ucel,
    a.ok,
    count(*) as volani,
    coalesce(sum(a.vstupne_tokeny), 0) as vstup,
    coalesce(sum(a.vystupne_tokeny), 0) as vystup,
    coalesce(sum(a.trvanie_ms), 0) as trvanie
  from public.ai_pouzitie a
  where a.created_at >= _od
  group by 1, 2, 3, 4, 5;
$$;

revoke all on function public.ai_pouzitie_suhrn(timestamptz) from public;
revoke all on function public.ai_pouzitie_suhrn(timestamptz) from anon;
revoke all on function public.ai_pouzitie_suhrn(timestamptz) from authenticated;
grant execute on function public.ai_pouzitie_suhrn(timestamptz) to service_role;
