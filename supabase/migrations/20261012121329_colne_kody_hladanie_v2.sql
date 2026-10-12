-- Hľadanie colného kódu: číslo podľa začiatku kódu (zoradené podľa kódu), slová
-- s ohľadom na skloňovanie (dlhšie slovo sa hľadá bez posledných dvoch písmen —
-- „železo“ nájde „železa“) a popis, ktorý hľadaným slovom začína, ide prvý.
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
  ),
  k2 as (
    select v.d, v.slova,
           (v.d ~ '^[0-9]{2,8}$') as cislo,
           array(select case when length(s) >= 5 then left(s, length(s) - 2) else s end from unnest(v.slova) s) as kmene
    from v
  )
  select k.kod,
         case jazyk when 'cs' then coalesce(k.popis_cs, k.popis_sk)
                    when 'en' then coalesce(k.popis_en, k.popis_sk)
                    when 'de' then coalesce(k.popis_de, k.popis_sk)
                    when 'hu' then coalesce(k.popis_hu, k.popis_sk)
                    else k.popis_sk end
  from public.colne_kody k, k2
  where (k2.cislo and k.kod like k2.d || '%')
     or (not k2.cislo and cardinality(k2.kmene) > 0
         and k.hladaj like all (select '%' || s || '%' from unnest(k2.kmene) s))
  order by
    case when k2.cislo then k.kod end,
    (lower(extensions.unaccent(case jazyk when 'cs' then coalesce(k.popis_cs, k.popis_sk) else k.popis_sk end))
       like (k2.kmene[1] || '%')) desc,
    extensions.similarity(k.hladaj, array_to_string(k2.slova, ' ')) desc,
    k.kod
  limit 30;
$$;
