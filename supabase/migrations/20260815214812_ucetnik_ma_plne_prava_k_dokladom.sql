-- Účtovník prestáva byť len na čítanie.
--
-- Doteraz ho blokovalo 120 restrictive politík cez `is_company_writer`
-- (= člen firmy a **nie** účtovník). Povoľujúce politiky pritom už žiadajú len
-- členstvo, takže tie restrictive boli jediná prekážka.
--
-- Delí sa to zámerne na dve skupiny:
--
--   * **Doklady a agendy** — politiky sa rušia, účtovník ich môže zapisovať aj
--     meniť ako ktorýkoľvek iný člen firmy. To je to, čo od účtovníka firma
--     naozaj chce: zaúčtovať, opraviť, spárovať platbu.
--
--   * **Napojenia, kľúče a platby** — politiky ostávajú. Externý účtovník nemá
--     mať prístup k bankovému napojeniu, k odosielaniu platieb, k API kľúčom
--     ani k platobnej bráne. Zmena IBAN-u firmy je navyše klasická cesta, ako
--     presmerovať cudzie peniaze.
--
-- Správu používateľov a predplatné stráži `is_company_admin` (owner/admin),
-- toho sa netýka nič z tohto — účtovník sa k nim nedostane ani naďalej.

DO $$
DECLARE
  -- Tabuľky, kde účtovník písať **nesmie**. Všetko ostatné sa uvoľňuje.
  spravcovske text[] := ARRAY[
    'api_keys',
    'webhooks',
    'bank_accounts',
    'bank_connections',
    'bank_payments',
    'company_payment_providers',
    'tesla_connections',
    'tesla_vehicle_links',
    'commander_connections',
    'commander_vehicle_links',
    'efaktura_profiles'
  ];
  r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND permissive = 'RESTRICTIVE'
       AND policyname IN ('ucetnik nezapisuje', 'ucetnik neupravuje', 'ucetnik nemaze')
       AND NOT (tablename = ANY(spravcovske))
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Na správcovských tabuľkách názvy politík ostávajú pravdivé: účtovník tam
-- naozaj nezapisuje. Doplní sa len poznámka, aby bolo jasné, že je to zvyšok
-- zámerný a nie prehliadnutý.
COMMENT ON FUNCTION public.is_company_writer(uuid, uuid) IS
  'Člen firmy okrem účtovníka. Od 2026-08-16 sa používa už len na napojeniach, kľúčoch a platbách — doklady smie účtovník zapisovať ako ktorýkoľvek iný člen.';
