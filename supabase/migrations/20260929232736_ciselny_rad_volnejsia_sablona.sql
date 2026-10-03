-- Vlastná šablóna čísla má byť naozaj vlastná.
--
-- Kontrola vyžadovala poradie zapísané ako {NN}–{NNNNNN}. Kto si chcel číslo
-- napísať po svojom, narazil na hlášku — pritom poradie vie doplniť aplikácia
-- sama (`normalizujSablonu`). Databáza teraz stráži len to, bez čoho by rad
-- nefungoval: aspoň jedno miesto pre poradie, jednomiestne vrátane.

alter table public.number_series drop constraint if exists number_series_format_check;
alter table public.number_series
  add constraint number_series_format_check
  check (btrim(format) <> '' and format ~ '\{N{1,6}\}');

-- Číslo zo šablóny musí vedieť doplniť aj jednomiestne poradie, inak by
-- {N} ostalo v čísle ako text.
create or replace function public.faktero_cislo_zo_sablony(_format text, _date date, _n integer)
returns text
language plpgsql
immutable
as $$
declare
  _pad_token text;
  _pad integer;
begin
  select m[1] into _pad_token
    from regexp_matches(_format, '\{(N{1,6})\}', 'g') as m
   order by length(m[1]) desc
   limit 1;
  _pad := coalesce(length(_pad_token), 4);

  return regexp_replace(
           replace(
             replace(
               replace(_format, '{YYYY}', to_char(_date, 'YYYY')),
               '{YY}', to_char(_date, 'YY')),
             '{MM}', to_char(_date, 'MM')),
           '\{N{1,6}\}', lpad(_n::text, _pad, '0'), 'g');
end;
$$;
