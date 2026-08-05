-- Denný cron /api/public/hooks/trial-lifecycle vracia 500 s hláškou
--   „permission denied for function faktero_process_trial_expiry"
-- Overené volaním na produkcii 2026-08-05.
--
-- Príčina: migrácia 20260709151320 funkciu vytvorí a hneď spraví
--   REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated;
-- Odobratím práva PUBLIC stratí implicitné EXECUTE aj service_role, a nový
-- GRANT sa už nikde nedoplní. Server ju pritom volá cez supabaseAdmin, teda
-- práve ako service_role.
--
-- Dôsledok: uplynuté trialy sa neprepínajú na plán Starter. Zatiaľ bez
-- viditeľnej škody — v DB momentálne nie je ani jedno predplatné v stave
-- 'trialing' —, ale prvý reálny trial by zostal visieť v 'trialing' natrvalo.
--
-- Zámer pôvodného REVOKE (nedostupné pre anon a authenticated) zostáva.

GRANT EXECUTE ON FUNCTION public.faktero_process_trial_expiry() TO service_role;
