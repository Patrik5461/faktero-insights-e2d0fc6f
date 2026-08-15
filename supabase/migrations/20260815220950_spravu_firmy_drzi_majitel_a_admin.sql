-- Napojenia, kľúče a platby patria majiteľovi a administrátorovi.
--
-- Politiky na týchto tabuľkách žiadali `is_company_writer` = člen firmy okrem
-- účtovníka. Prepúšťali teda **zamestnanca**: ten si vedel založiť API kľúč,
-- webhook aj zmeniť IBAN firmy. Účtovník, ktorý je na to odbornejší, nie.
-- Nedávalo to zmysel a bola to tichá diera — cez API kľúč sa dá čítať a meniť
-- celá firma a cez IBAN presmerovať cudzie peniaze.
--
-- Doklady sa tým nemenia: tie vedie každý člen vrátane zamestnanca aj účtovníka.

DO $$
DECLARE
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
  t text;
BEGIN
  FOREACH t IN ARRAY spravcovske LOOP
    -- Staré názvy hovorili o účtovníkovi; po tejto zmene sa týkajú každého,
    -- kto nie je majiteľ ani administrátor. Nech názov nezavádza.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'ucetnik nezapisuje', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'ucetnik neupravuje', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'ucetnik nemaze', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
         WITH CHECK (public.is_company_admin(company_id, (SELECT auth.uid())))',
      'spravu drzi majitel a admin - zapis', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
         USING (public.is_company_admin(company_id, (SELECT auth.uid())))',
      'spravu drzi majitel a admin - uprava', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
         USING (public.is_company_admin(company_id, (SELECT auth.uid())))',
      'spravu drzi majitel a admin - mazanie', t);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.is_company_writer(uuid, uuid) IS
  'Člen firmy okrem účtovníka. Od 2026-08-16 ju nepoužíva žiadna politika — správu drží is_company_admin, doklady vedie každý člen. Ponechaná pre prípad, že by sa rola účtovníka znovu obmedzovala.';
