-- Aplikované v troch častiach: 20261021190425_efaktura_oznam_tabulky, 20261021190428_…_politiky, 20261021190430_…_prava.
-- Oznam o povinnej e-fakturácii od 1. 1. 2027 (okno po prihlásení).
--
-- Dve tabuľky:
--   efaktura_oznam               — stav okna pre dvojicu firma + používateľ
--                                  (zatvorené, kliknuté na „Pokračovať", pozvaný účtovník),
--   efaktura_aktivacia_pozvanky  — pozvánka pre účtovníka, ktorý za firmu vyberie
--                                  Faktero na Portáli finančnej správy. Odkaz
--                                  /aktivacia-efaktury/<token> funguje bez prihlásenia.
--
-- Okno sa ukazuje len majiteľovi a adminovi slovenskej firmy, ktorá eFaktúru
-- ešte nemá aktivovanú (efaktura_profiles.enabled a epostak_firm_id). Logika
-- je v src/lib/faktero/efaktura-oznam.ts.
--
-- Oblasť vlastného prístupu: „faktury" (ako ostatné tabuľky eFaktúry).
-- Skript sa dá pustiť opakovane (IF NOT EXISTS / DROP POLICY IF EXISTS).

-- ------------------------------------------------------------------
-- Stav okna
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.efaktura_oznam (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- CASCADE: riadok nesmie blokovať zrušenie účtu (pamäť faktero-zrusenie-uctu).
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Zatvorené krížikom (alebo Esc / klikom vedľa) — znova najskôr o 7 dní.
  dismissed_at timestamptz,
  -- Kliklo sa na „Pokračovať na prepojenie".
  cta_clicked boolean NOT NULL DEFAULT false,
  cta_clicked_at timestamptz,
  -- Kedy tento používateľ naposledy pozval účtovníka.
  accountant_invited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);
CREATE INDEX IF NOT EXISTS efaktura_oznam_user_idx ON public.efaktura_oznam (user_id);

COMMENT ON TABLE public.efaktura_oznam IS
  'Oznam o e-fakturácii 2027: stav okna po prihlásení pre firmu + používateľa.';

-- ------------------------------------------------------------------
-- Pozvánky pre účtovníka
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.efaktura_aktivacia_pozvanky (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  -- 48 hex znakov (24 náhodných bajtov) — jediná ochrana verejnej stránky.
  token text NOT NULL CHECK (token ~ '^[a-f0-9]{48}$'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Výsledok odoslania e-mailu: keď neodíde, pozvánka platí a v aplikácii je odkaz na skopírovanie.
  email_odoslany_at timestamptz,
  email_chyba text,
  -- Účtovník otvoril odkaz / klikol „Hotovo, vybral som Faktero" (len informatívne —
  -- skutočný stav príde webhookom Finančnej správy).
  otvorena_at timestamptz,
  hotovo_at timestamptz,
  zrusena_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS efaktura_aktivacia_pozvanky_token_uidx
  ON public.efaktura_aktivacia_pozvanky (token);
CREATE INDEX IF NOT EXISTS efaktura_aktivacia_pozvanky_firma_idx
  ON public.efaktura_aktivacia_pozvanky (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS efaktura_aktivacia_pozvanky_invited_by_idx
  ON public.efaktura_aktivacia_pozvanky (invited_by);

COMMENT ON TABLE public.efaktura_aktivacia_pozvanky IS
  'Pozvánka účtovníkovi: vyber Faktero ako poskytovateľa eFaktúry na Portáli FS za firmu.';

-- ------------------------------------------------------------------
-- RLS, dvojfaktor, vlastný prístup, granty
-- ------------------------------------------------------------------
ALTER TABLE public.efaktura_oznam ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.efaktura_aktivacia_pozvanky ENABLE ROW LEVEL SECURITY;

-- Každý vidí a mení len svoj riadok, a len vo firme, kde je majiteľ alebo admin.
DROP POLICY IF EXISTS "vlastny riadok citanie" ON public.efaktura_oznam;
CREATE POLICY "vlastny riadok citanie" ON public.efaktura_oznam
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.is_company_admin(company_id, (SELECT auth.uid())));
DROP POLICY IF EXISTS "vlastny riadok zapis" ON public.efaktura_oznam;
CREATE POLICY "vlastny riadok zapis" ON public.efaktura_oznam
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.is_company_admin(company_id, (SELECT auth.uid())));
DROP POLICY IF EXISTS "vlastny riadok uprava" ON public.efaktura_oznam;
CREATE POLICY "vlastny riadok uprava" ON public.efaktura_oznam
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.is_company_admin(company_id, (SELECT auth.uid())))
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.is_company_admin(company_id, (SELECT auth.uid())));

-- Pozvánky číta majiteľ a admin (potrebujú odkaz na skopírovanie); zapisuje
-- len server cez service_role po overPristup.
DROP POLICY IF EXISTS "spravca cita" ON public.efaktura_aktivacia_pozvanky;
CREATE POLICY "spravca cita" ON public.efaktura_aktivacia_pozvanky
  FOR SELECT TO authenticated
  USING (public.is_company_admin(company_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "mfa ak je zapnute" ON public.efaktura_oznam;
CREATE POLICY "mfa ak je zapnute" ON public.efaktura_oznam AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.mfa_ok())) WITH CHECK ((SELECT public.mfa_ok()));
DROP POLICY IF EXISTS "mfa ak je zapnute" ON public.efaktura_aktivacia_pozvanky;
CREATE POLICY "mfa ak je zapnute" ON public.efaktura_aktivacia_pozvanky AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.mfa_ok())) WITH CHECK ((SELECT public.mfa_ok()));

SELECT public.vlastny_pristup_politiky_na('efaktura_oznam', 'company_id', 'faktury');
SELECT public.vlastny_pristup_politiky_na('efaktura_aktivacia_pozvanky', 'company_id', 'faktury');

-- Právo drží PUBLIC — odobrať treba jemu, nie len anon (pamäť faktero-supabase-public-grant).
REVOKE ALL ON public.efaktura_oznam FROM PUBLIC, anon;
REVOKE ALL ON public.efaktura_aktivacia_pozvanky FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.efaktura_oznam TO authenticated;
GRANT SELECT ON public.efaktura_aktivacia_pozvanky TO authenticated;
GRANT ALL ON public.efaktura_oznam TO service_role;
GRANT ALL ON public.efaktura_aktivacia_pozvanky TO service_role;
