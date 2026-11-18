-- Meranie AI: Claude (Anthropic) ako tretí poskytovateľ.
--
-- Gemini Pro (náhľad) často odpovedá 503 „high demand“ a doklad potom číta
-- Claude Opus; rýchle úlohy majú náhradu Claude Haiku. Bez rozšírenia
-- obmedzenia by zápis do `ai_pouzitie` s poskytovateľom 'anthropic' padol.
alter table public.ai_pouzitie
  drop constraint if exists ai_pouzitie_poskytovatel_check;

alter table public.ai_pouzitie
  add constraint ai_pouzitie_poskytovatel_check
  check (poskytovatel in ('gemini', 'openai', 'anthropic'));
