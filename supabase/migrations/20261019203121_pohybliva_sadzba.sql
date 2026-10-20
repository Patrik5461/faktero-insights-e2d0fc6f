-- Aplikované po častiach: 20261019203121_pohybliva_sadzba_zmluvy, …_referencne, …_obdobia, 20261020093718_…_spustac_funkcia, 20261020093822_…_spustac_prava. História indexov: scripts/nahraj-referencne-sadzby.mjs 2020-01-01.
-- Pohyblivá úroková sadzba pri financovaní (kontokorent, úver, leasing).
--
-- Doteraz mala zmluva len `interest_rate`. Pri pohyblivej sadzbe („1M EURIBOR
-- + marža 4,3 % p. a.") sa do nej dostala len marža a Faktero počítalo úrok
-- len z nej. Teraz zmluva nesie zloženie sadzby a index sa dopĺňa sám.
--
-- `interest_rate` ostáva aj pri pohyblivej sadzbe a znamená **poslednú známu
-- celkovú sadzbu** (index + marža). Všetko, čo pohyblivú sadzbu nepozná
-- (zoznam zmlúv, splátkový kalendár úveru, náhľady, exporty), tak dál dostáva
-- celé číslo, nie len maržu. Pri kontokorente ju denný hook kurzov
-- prepisuje na dnešnú; pri úvere/leasingu sa mení len uložením zmluvy (kvôli
-- kalendáru). Existujúce zmluvy dostanú `rate_type = 'pevna'` a nič sa im nemení.

-- ------------------------------------------------------------------
-- 1) Zloženie sadzby na zmluve
-- ------------------------------------------------------------------

-- Pohyblivá sadzba má štyri desatinné miesta (1,9607619 + 4,3 = 6,2608).
ALTER TABLE public.financing_contracts
  ALTER COLUMN interest_rate TYPE numeric(8, 4);

ALTER TABLE public.financing_contracts
  ADD COLUMN IF NOT EXISTS rate_type text NOT NULL DEFAULT 'pevna',
  ADD COLUMN IF NOT EXISTS reference_index text,
  ADD COLUMN IF NOT EXISTS rate_margin numeric(8, 4),
  ADD COLUMN IF NOT EXISTS index_floor numeric(8, 4),
  ADD COLUMN IF NOT EXISTS fixing_rule text,
  ADD COLUMN IF NOT EXISTS fixing_offset_days smallint,
  ADD COLUMN IF NOT EXISTS rate_reset text;

ALTER TABLE public.financing_contracts
  DROP CONSTRAINT IF EXISTS financing_contracts_rate_type_check,
  DROP CONSTRAINT IF EXISTS financing_contracts_reference_index_check,
  DROP CONSTRAINT IF EXISTS financing_contracts_fixing_rule_check,
  DROP CONSTRAINT IF EXISTS financing_contracts_rate_reset_check,
  DROP CONSTRAINT IF EXISTS financing_contracts_rate_margin_check,
  DROP CONSTRAINT IF EXISTS financing_contracts_index_floor_check,
  DROP CONSTRAINT IF EXISTS financing_contracts_fixing_offset_check,
  DROP CONSTRAINT IF EXISTS financing_contracts_pohybliva_udaje_check;

ALTER TABLE public.financing_contracts
  ADD CONSTRAINT financing_contracts_rate_type_check
    CHECK (rate_type IN ('pevna', 'pohybliva')),
  ADD CONSTRAINT financing_contracts_reference_index_check
    CHECK (reference_index IS NULL OR reference_index IN (
      'EURIBOR_1M', 'EURIBOR_3M', 'EURIBOR_6M', 'EURIBOR_12M', 'ESTR',
      'PRIBOR_1M', 'PRIBOR_3M', 'PRIBOR_6M', 'PRIBOR_1R')),
  ADD CONSTRAINT financing_contracts_fixing_rule_check
    CHECK (fixing_rule IS NULL OR fixing_rule IN ('pred_zaciatkom_obdobia', 'mesacny_priemer')),
  ADD CONSTRAINT financing_contracts_rate_reset_check
    CHECK (rate_reset IS NULL OR rate_reset IN ('mesacne', 'stvrtrocne', 'polrocne', 'rocne')),
  -- Marža môže byť výnimočne aj záporná (zvýhodnené úvery), ale nie absurdná.
  ADD CONSTRAINT financing_contracts_rate_margin_check
    CHECK (rate_margin IS NULL OR rate_margin BETWEEN -20 AND 50),
  ADD CONSTRAINT financing_contracts_index_floor_check
    CHECK (index_floor IS NULL OR index_floor BETWEEN -5 AND 20),
  ADD CONSTRAINT financing_contracts_fixing_offset_check
    CHECK (fixing_offset_days IS NULL OR fixing_offset_days BETWEEN 0 AND 10),
  -- Pohyblivá sadzba bez indexu, marže a frekvencie sa nedá spočítať.
  ADD CONSTRAINT financing_contracts_pohybliva_udaje_check CHECK (
    rate_type <> 'pohybliva' OR (
      reference_index IS NOT NULL AND rate_margin IS NOT NULL
      AND rate_reset IS NOT NULL AND fixing_rule IS NOT NULL
    )
  );

COMMENT ON COLUMN public.financing_contracts.interest_rate IS
  'Ročná sadzba v %. Pri pohyblivej sadzbe posledná známa celková (index + marža).';
COMMENT ON COLUMN public.financing_contracts.rate_type IS
  'pevna | pohybliva';
COMMENT ON COLUMN public.financing_contracts.reference_index IS
  'Pohyblivá sadzba: referenčný index (EURIBOR_1M…, ESTR, PRIBOR_1M…).';
COMMENT ON COLUMN public.financing_contracts.rate_margin IS
  'Pohyblivá sadzba: marža (prirážka) v % p. a.';
COMMENT ON COLUMN public.financing_contracts.index_floor IS
  'Pohyblivá sadzba: dolná hranica indexu v % (typicky 0). NULL = bez hranice.';
COMMENT ON COLUMN public.financing_contracts.fixing_rule IS
  'Pohyblivá sadzba: pred_zaciatkom_obdobia (N pracovných dní pred začiatkom) | mesacny_priemer (priemer za predchádzajúci mesiac).';
COMMENT ON COLUMN public.financing_contracts.fixing_offset_days IS
  'Pohyblivá sadzba: koľko pracovných dní (TARGET) pred začiatkom obdobia sa index fixuje.';
COMMENT ON COLUMN public.financing_contracts.rate_reset IS
  'Pohyblivá sadzba: ako často sa mení — mesacne | stvrtrocne | polrocne | rocne.';

-- Granty na financing_contracts sú na celú tabuľku — nové stĺpce ďalší GRANT
-- nepotrebujú (rovnako ako pri kontokorente).

-- ------------------------------------------------------------------
-- 2) Číselník referenčných sadzieb
-- ------------------------------------------------------------------

-- `druh`: denna = hodnota k dňu; mesacny_priemer = priemer za mesiac
-- (datum = prvý deň mesiaca). EURIBOR je len mesačný (ECB), €STR a PRIBOR denne.
CREATE TABLE IF NOT EXISTS public.referencne_sadzby (
  index text NOT NULL CHECK (index IN (
    'EURIBOR_1M', 'EURIBOR_3M', 'EURIBOR_6M', 'EURIBOR_12M', 'ESTR',
    'PRIBOR_1M', 'PRIBOR_3M', 'PRIBOR_6M', 'PRIBOR_1R')),
  druh text NOT NULL CHECK (druh IN ('denna', 'mesacny_priemer')),
  datum date NOT NULL,
  hodnota numeric(10, 6) NOT NULL CHECK (hodnota BETWEEN -10 AND 50),
  zdroj text NOT NULL CHECK (zdroj IN ('ECB', 'CNB', 'rucne')),
  nacitane timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (index, druh, datum),
  CHECK (druh <> 'mesacny_priemer' OR extract(day FROM datum) = 1)
);

COMMENT ON TABLE public.referencne_sadzby IS
  'Referenčné úrokové sadzby (EURIBOR mesačný priemer z ECB, €STR denne z ECB, PRIBOR denne z ČNB). Plní ich hook kurzy-ecb, históriu scripts/nahraj-referencne-sadzby.mjs.';

ALTER TABLE public.referencne_sadzby ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referencne sadzby citaju prihlaseni" ON public.referencne_sadzby;
CREATE POLICY "referencne sadzby citaju prihlaseni" ON public.referencne_sadzby
  FOR SELECT TO authenticated USING (true);

-- Dvojfaktor podľa pravidla pre každú novú tabuľku.
DROP POLICY IF EXISTS "mfa ak je zapnute" ON public.referencne_sadzby;
CREATE POLICY "mfa ak je zapnute" ON public.referencne_sadzby AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.mfa_ok())) WITH CHECK ((SELECT public.mfa_ok()));

-- Zapisuje len service_role (hook). Právo drží PUBLIC — odobrať treba jemu.
REVOKE ALL ON public.referencne_sadzby FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.referencne_sadzby TO authenticated;
GRANT ALL ON public.referencne_sadzby TO service_role;

-- ------------------------------------------------------------------
-- 3) Ručne zadaná sadzba za obdobie
-- ------------------------------------------------------------------

-- Keď banka oznámi skutočnú sadzbu (alebo ju človek odvodí zo strhnutého
-- úroku), prepíše vypočítanú za dané obdobie fixácie.
CREATE TABLE IF NOT EXISTS public.financing_rate_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.financing_contracts(id) ON DELETE CASCADE,
  -- Prvý deň obdobia fixácie (mesiaca, štvrťroka…).
  period_start date NOT NULL CHECK (extract(day FROM period_start) = 1),
  -- Celková ročná sadzba v % (index + marža), nie len index.
  rate numeric(8, 4) NOT NULL CHECK (rate BETWEEN -10 AND 100),
  -- rucne = zadal človek; banka = prevzaté z oznámenia/výpisu banky.
  source text NOT NULL DEFAULT 'rucne' CHECK (source IN ('rucne', 'banka')),
  note text CHECK (note IS NULL OR length(note) <= 500),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, period_start)
);

CREATE INDEX IF NOT EXISTS financing_rate_periods_firma_idx
  ON public.financing_rate_periods (company_id);
CREATE INDEX IF NOT EXISTS financing_rate_periods_created_by_idx
  ON public.financing_rate_periods (created_by);

ALTER TABLE public.financing_rate_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clenovia citaju sadzby obdobi" ON public.financing_rate_periods
  FOR SELECT USING (public.is_company_member(company_id, (SELECT auth.uid())));
CREATE POLICY "clenovia zapisuju sadzby obdobi" ON public.financing_rate_periods
  FOR INSERT WITH CHECK (public.is_company_member(company_id, (SELECT auth.uid())));
CREATE POLICY "clenovia upravuju sadzby obdobi" ON public.financing_rate_periods
  FOR UPDATE USING (public.is_company_member(company_id, (SELECT auth.uid())));
CREATE POLICY "clenovia mazu sadzby obdobi" ON public.financing_rate_periods
  FOR DELETE USING (public.is_company_member(company_id, (SELECT auth.uid())));

-- Dvojfaktor ako na každej tabuľke (pamäť faktero-dvojfaktor).
CREATE POLICY "mfa ak je zapnute" ON public.financing_rate_periods AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.mfa_ok())) WITH CHECK ((SELECT public.mfa_ok()));

-- Vlastný prístup: oblasť „banka" spolu so zmluvami, splátkami a poplatkami.
SELECT public.vlastny_pristup_politiky_na('financing_rate_periods', 'company_id', 'banka');

-- Ručná sadzba musí patriť zmluve tej istej firmy.
CREATE OR REPLACE FUNCTION public.financing_rate_periods_firma()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.financing_contracts c
    WHERE c.id = NEW.contract_id AND c.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Zmluva nepatrí k firme.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.financing_rate_periods_firma() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS financing_rate_periods_firma ON public.financing_rate_periods;
CREATE TRIGGER financing_rate_periods_firma
  BEFORE INSERT OR UPDATE ON public.financing_rate_periods
  FOR EACH ROW EXECUTE FUNCTION public.financing_rate_periods_firma();

REVOKE ALL ON public.financing_rate_periods FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financing_rate_periods TO authenticated;
GRANT ALL ON public.financing_rate_periods TO service_role;
