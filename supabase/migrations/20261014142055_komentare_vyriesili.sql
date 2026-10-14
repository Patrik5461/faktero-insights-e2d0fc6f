-- Moje úlohy: vyriešenie komentára, v ktorom je človek označený.
--
-- Prečo pole `vyriesili uuid[]` a nie `vyriesene_at` + `vyriesil` na komentári:
-- komentár môže označiť viac kolegov naraz („@Jana @Peter pozrite sa").
-- Keby vyriešenie patrilo komentáru, Jana by ho vyriešila aj za Petra a ten
-- by ho zo svojich úloh stratil skôr, než ho vôbec videl. Vyriešenie preto
-- patrí označenému človeku — každý si odškrtne len seba. Samostatná tabuľka
-- (komentár × osoba × čas) by niesla aj čas, ale pre zoznam úloh ho netreba
-- a pole sa filtruje jedným `not cs` bez spojenia.
--
-- Zápis: tabuľka zámerne nemá politiku ani GRANT na UPDATE — autor komentára
-- nesmie meniť text po tom, čo ho kolega prečítal, a označený nesmie meniť nič
-- iné než svoje vyriešenie. Vyriešenie preto zapisuje serverová funkcia
-- `vyriesKomentarFn` (moje-ulohy.functions.ts): komentár načíta prihláseným
-- klientom (RLS + mfa_ok + vlastný prístup), overí, že je volajúci
-- v `upozornit`, a až potom pridá jeho id servisným klientom.

alter table public.komentare_dokladov
  add column if not exists vyriesili uuid[] not null default '{}';

-- Zoznam úloh a zvonček hľadajú „som v upozornit" — bez indexu by to bol
-- prechod celou firmou.
create index if not exists komentare_dokladov_upozornit
  on public.komentare_dokladov using gin (upozornit);
