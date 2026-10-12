-- Číselník kombinovanej nomenklatúry (CN 2026, Eurostat / Úrad pre publikácie EÚ)
-- — 8-miestne kódy s vysvetľujúcim textom v SK, CS, EN, DE, HU. Na výber colného
-- kódu pri produkte, skladovej karte a položke dokladu. Verejné údaje, len čítanie.
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create table if not exists public.colne_kody (
  kod text primary key check (kod ~ '^[0-9]{8}$'),
  rok integer not null default 2026,
  kapitola text not null,
  popis_sk text not null,
  popis_cs text,
  popis_en text,
  popis_de text,
  popis_hu text,
  /** Text na vyhľadávanie: malé písmená bez diakritiky (SK + CS + EN). */
  hladaj text not null
);

create index if not exists colne_kody_hladaj_trgm on public.colne_kody using gin (hladaj extensions.gin_trgm_ops);

alter table public.colne_kody enable row level security;
create policy "colne kody citaju prihlaseni" on public.colne_kody for select to authenticated using (true);
revoke all on public.colne_kody from public, anon;
grant select on public.colne_kody to authenticated;
grant all on public.colne_kody to service_role;

/** Vyhľadanie kódu podľa čísla (začiatok kódu) alebo slov v popise; najviac 30. */
create or replace function public.hladaj_colne_kody(q text, jazyk text default 'sk')
returns table (kod text, popis text)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with v as (
    select regexp_replace(coalesce(q, ''), '[\s.]', '', 'g') as d,
           array_remove(regexp_split_to_array(lower(extensions.unaccent(trim(coalesce(q, '')))), '\s+'), '') as slova
  )
  select k.kod,
         case jazyk when 'cs' then coalesce(k.popis_cs, k.popis_sk)
                    when 'en' then coalesce(k.popis_en, k.popis_sk)
                    when 'de' then coalesce(k.popis_de, k.popis_sk)
                    when 'hu' then coalesce(k.popis_hu, k.popis_sk)
                    else k.popis_sk end
  from public.colne_kody k, v
  where (v.d ~ '^[0-9]{2,8}$' and k.kod like v.d || '%')
     or (v.d !~ '^[0-9]+$' and cardinality(v.slova) > 0
         and k.hladaj like all (select '%' || s || '%' from unnest(v.slova) s))
  order by (v.d ~ '^[0-9]{2,8}$' and k.kod like v.d || '%') desc,
           extensions.similarity(k.hladaj, array_to_string(v.slova, ' ')) desc,
           k.kod
  limit 30;
$$;
revoke all on function public.hladaj_colne_kody(text, text) from public, anon;
grant execute on function public.hladaj_colne_kody(text, text) to authenticated;
