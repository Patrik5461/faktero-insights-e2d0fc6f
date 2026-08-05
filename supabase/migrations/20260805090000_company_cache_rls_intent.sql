-- company_cache je jediná zo 78 tabuliek, ktorá má zapnuté RLS bez jedinej policy.
-- Pri audite to vyzeralo ako opomenutie. Nie je — je to zámer: tabuľka je
-- serverová cache odpovedí z registrov (ORSR/FinStat) a v kóde k nej pristupuje
-- výhradne supabaseAdmin (service_role), ktoré RLS obchádza.
-- Viď src/lib/faktero/company-registry.server.ts.
--
-- RLS bez policy = deny-all pre anon aj authenticated, čo je presne požadovaný
-- stav: klient sa k cache nikdy nedostane priamo. Tento komentár tu je preto,
-- aby budúci audit (ani budúci my) nedopĺňal policy "aby tam nejaká bola".

COMMENT ON TABLE public.company_cache IS
  'Serverová cache údajov z obchodných registrov (24h TTL). Prístup výhradne cez service_role — RLS je zapnuté zámerne bez policy (deny-all pre anon/authenticated). Nepridávať policy bez zmeny prístupovej cesty v company-registry.server.ts.';
