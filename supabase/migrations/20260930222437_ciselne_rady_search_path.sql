-- Obe funkcie sú čisté prevody textu bez dotazu do tabuliek, ale bez
-- pevného `search_path` ich linter hlási: kto si vie nastaviť vlastnú cestu,
-- podstrčí im vlastné `regexp_replace` či `to_char`. Prázdna cesta to zavrie,
-- vstavané funkcie sa volajú cez `pg_catalog`.
alter function public.faktero_nazov_radu(text) set search_path = '';
alter function public.faktero_cislo_zo_sablony(text, date, integer) set search_path = '';
