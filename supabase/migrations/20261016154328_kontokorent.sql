-- Kontokorentný úver ako tretí druh zmluvy o financovaní.
--
-- Kontokorent nie je úver so splátkovým kalendárom: je to úverový rámec
-- (limit) na bežnom účte. Firma ide do mínusu do výšky limitu, banka raz za
-- mesiac alebo štvrťrok strhne z účtu úrok z vyčerpanej sumy a prípadne
-- poplatok za rámec. Istinu „spláca" každý príjem na účet. Preto nemá istinu,
-- počet splátok ani prvú splátku — má limit, účet, sadzbu a platnosť.
--
-- Pozor pri aplikovaní: nová hodnota enumu sa v tej istej transakcii nedá
-- použiť ako hodnota typu financing_kind. Nič nižšie ju preto ako enum
-- nepoužíva — kontroly porovnávajú `kind::text`. Keby to predsa niekto menil,
-- prvý príkaz treba pustiť samostatne.

ALTER TYPE public.financing_kind ADD VALUE IF NOT EXISTS 'kontokorent';

-- ------------------------------------------------------------------
-- Stĺpce kontokorentu na zmluve
-- ------------------------------------------------------------------

ALTER TABLE public.financing_contracts
  -- Úverový rámec — do koľkých mínusov smie účet ísť.
  ADD COLUMN IF NOT EXISTS credit_limit numeric(14, 2)
    CHECK (credit_limit IS NULL OR credit_limit > 0),
  -- Napojený účet, na ktorom rámec je. Podľa neho sa spoznajú úroky a
  -- poplatky — z iného účtu ich banka nestrhne.
  ADD COLUMN IF NOT EXISTS bank_account_id uuid
    REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  -- IBAN zo zmluvy. Drží sa aj vtedy, keď účet ešte nie je napojený — keď sa
  -- napojí, zmluva sa k nemu priradí podľa IBAN.
  ADD COLUMN IF NOT EXISTS account_iban text,
  -- Poplatok za rámec za ROK v mene zmluvy. Banky ho uvádzajú ročne (často
  -- ako percento z limitu); mesačnú sumu prepočíta formulár.
  ADD COLUMN IF NOT EXISTS limit_fee_yearly numeric(14, 2)
    CHECK (limit_fee_yearly IS NULL OR limit_fee_yearly >= 0),
  -- Do kedy rámec platí. Prázdne = na dobu neurčitú.
  ADD COLUMN IF NOT EXISTS valid_until date,
  -- Ako často banka strhne úrok.
  ADD COLUMN IF NOT EXISTS interest_period text
    CHECK (interest_period IS NULL OR interest_period IN ('mesacne', 'stvrtrocne'));

COMMENT ON COLUMN public.financing_contracts.credit_limit IS
  'Kontokorent: úverový rámec (limit) na účte.';
COMMENT ON COLUMN public.financing_contracts.bank_account_id IS
  'Kontokorent: napojený účet, na ktorom je rámec. Úroky a poplatky sa párujú len z neho.';
COMMENT ON COLUMN public.financing_contracts.account_iban IS
  'Kontokorent: IBAN účtu zo zmluvy (aj keď účet nie je napojený).';
COMMENT ON COLUMN public.financing_contracts.limit_fee_yearly IS
  'Kontokorent: poplatok za úverový rámec za rok.';
COMMENT ON COLUMN public.financing_contracts.valid_until IS
  'Kontokorent: platnosť rámca. NULL = doba neurčitá.';
COMMENT ON COLUMN public.financing_contracts.interest_period IS
  'Kontokorent: obdobie úročenia — mesacne | stvrtrocne.';

-- Istina, počet splátok a prvá splátka pri kontokorente nemajú zmysel.
-- Povinné ostávajú pri leasingu a úvere — stráži to kontrola nižšie.
ALTER TABLE public.financing_contracts
  ALTER COLUMN principal DROP NOT NULL,
  ALTER COLUMN term_months DROP NOT NULL,
  ALTER COLUMN first_due_date DROP NOT NULL;

ALTER TABLE public.financing_contracts
  DROP CONSTRAINT IF EXISTS financing_contracts_druh_udaje_check;
ALTER TABLE public.financing_contracts
  ADD CONSTRAINT financing_contracts_druh_udaje_check CHECK (
    CASE WHEN kind::text = 'kontokorent'
      THEN credit_limit IS NOT NULL
      ELSE principal IS NOT NULL AND term_months IS NOT NULL AND first_due_date IS NOT NULL
    END
  );

CREATE INDEX IF NOT EXISTS financing_contracts_ucet_idx
  ON public.financing_contracts (bank_account_id)
  WHERE bank_account_id IS NOT NULL;

-- Granty na financing_contracts sú na celú tabuľku (SELECT, INSERT, UPDATE,
-- DELETE pre authenticated a service_role), nie po stĺpcoch — nové stĺpce
-- teda žiadny ďalší GRANT nepotrebujú.

-- ------------------------------------------------------------------
-- Úroky a poplatky strhnuté bankou
-- ------------------------------------------------------------------

-- Kontokorent nemá splátky, ku ktorým by sa platba dala priradiť. Čo banka
-- strhne, je samostatný náklad: úrok (562) alebo poplatok za rámec (568).
-- Jeden riadok = jeden bankový pohyb.
CREATE TABLE IF NOT EXISTS public.financing_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- company_id zámerne aj tu, rovnako ako pri splátkach — kvôli RLS bez spájania.
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.financing_contracts(id) ON DELETE CASCADE,
  -- Bez pohybu to nemá zmysel: keď pohyb zmizne, zmizne aj záznam.
  bank_transaction_id uuid NOT NULL REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('urok', 'poplatok')),
  -- Kladná suma — koľko banka strhla.
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'EUR',
  charged_on date NOT NULL,
  -- Spároval to Faktero sám, alebo to potvrdil človek.
  source text NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'rucne')),
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Jeden pohyb je najviac jeden úrok alebo poplatok — opakované párovanie ho
-- nesmie zapísať dvakrát.
CREATE UNIQUE INDEX IF NOT EXISTS financing_charges_pohyb_uniq
  ON public.financing_charges (bank_transaction_id);
CREATE INDEX IF NOT EXISTS financing_charges_zmluva_idx
  ON public.financing_charges (contract_id, charged_on);
CREATE INDEX IF NOT EXISTS financing_charges_firma_idx
  ON public.financing_charges (company_id, charged_on);
CREATE INDEX IF NOT EXISTS financing_charges_created_by_idx
  ON public.financing_charges (created_by);

ALTER TABLE public.financing_charges ENABLE ROW LEVEL SECURITY;

-- Rovnako ako splátky: člen firmy.
CREATE POLICY "clenovia citaju poplatky" ON public.financing_charges
  FOR SELECT USING (public.is_company_member(company_id, (SELECT auth.uid())));
CREATE POLICY "clenovia zapisuju poplatky" ON public.financing_charges
  FOR INSERT WITH CHECK (public.is_company_member(company_id, (SELECT auth.uid())));
CREATE POLICY "clenovia upravuju poplatky" ON public.financing_charges
  FOR UPDATE USING (public.is_company_member(company_id, (SELECT auth.uid())));
CREATE POLICY "clenovia mazu poplatky" ON public.financing_charges
  FOR DELETE USING (public.is_company_member(company_id, (SELECT auth.uid())));

-- Dvojfaktor ako na každej tabuľke (pamäť faktero-dvojfaktor).
CREATE POLICY "mfa ak je zapnute" ON public.financing_charges AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.mfa_ok())) WITH CHECK ((SELECT public.mfa_ok()));

-- Vlastný prístup: patrí do oblasti „banka" spolu so zmluvami a splátkami.
SELECT public.vlastny_pristup_politiky_na('financing_charges', 'company_id', 'banka');

-- Právo drží PUBLIC — odobrať treba jemu, nie len anon.
REVOKE ALL ON public.financing_charges FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financing_charges TO authenticated;
GRANT ALL ON public.financing_charges TO service_role;
