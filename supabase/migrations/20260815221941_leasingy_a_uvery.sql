-- Leasingy a úvery so splátkovým kalendárom.
--
-- Firma si zmluvu zapíše raz, Faktero z nej vyrobí splátkový kalendár a
-- odchádzajúce platby z banky si k splátkam páruje samo. Hodnota oproti
-- tabuľke v Exceli je práve v tom rozpade: pri každej splátke je zvlášť
-- **istina, úrok a DPH**, takže z toho je podklad na zaúčtovanie, nie len
-- evidencia, kedy čo odišlo.

CREATE TYPE public.financing_kind AS ENUM ('leasing', 'uver');

CREATE TABLE public.financing_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind public.financing_kind NOT NULL,
  -- Ako to firma volá — „Octavia, ČSOB Leasing".
  name text NOT NULL,
  provider_name text,
  contract_number text,
  -- Kľúče na párovanie. Suma sama nestačí: splátky sú každý mesiac rovnaké a
  -- dve zmluvy s podobnou splátkou by sa miešali.
  variable_symbol text,
  counterparty_hint text,
  currency text NOT NULL DEFAULT 'EUR',
  -- Financovaná istina. Pri leasingu obstarávacia cena mínus akontácia.
  principal numeric(14, 2) NOT NULL CHECK (principal > 0),
  -- Ročná úroková sadzba v percentách. Nula je platná (bezúročné splátky).
  interest_rate numeric(6, 3) NOT NULL DEFAULT 0 CHECK (interest_rate >= 0),
  term_months integer NOT NULL CHECK (term_months BETWEEN 1 AND 600),
  first_due_date date NOT NULL,
  -- Pevná splátka zo zmluvy. Keď chýba, dopočíta sa anuita.
  payment_amount numeric(14, 2) CHECK (payment_amount IS NULL OR payment_amount > 0),
  -- DPH v splátke, ak ju splátka obsahuje. Pri úvere je to nula.
  vat_rate numeric(5, 2) NOT NULL DEFAULT 0 CHECK (vat_rate >= 0 AND vat_rate <= 100),
  -- Akontácia / mimoriadna splátka zaplatená na začiatku — do kalendára nejde.
  down_payment numeric(14, 2) NOT NULL DEFAULT 0 CHECK (down_payment >= 0),
  -- Zostatková cena pri leasingu, splatná na konci.
  residual_value numeric(14, 2) NOT NULL DEFAULT 0 CHECK (residual_value >= 0),
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  -- Zmluva v úložisku — cesta v buckete `documents`.
  document_path text,
  note text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.financing_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- company_id je tu zámerne aj napriek tomu, že sa dá dočítať cez zmluvu —
  -- RLS aj párovanie by inak museli spájať tabuľky pri každom riadku.
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.financing_contracts(id) ON DELETE CASCADE,
  number integer NOT NULL CHECK (number > 0),
  due_date date NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  principal_part numeric(14, 2) NOT NULL DEFAULT 0,
  interest_part numeric(14, 2) NOT NULL DEFAULT 0,
  vat_amount numeric(14, 2) NOT NULL DEFAULT 0,
  -- Zostatok istiny po tejto splátke — kvôli výkazom a predčasnému splateniu.
  remaining_principal numeric(14, 2) NOT NULL DEFAULT 0,
  paid_at date,
  paid_amount numeric(14, 2),
  bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, number)
);

-- Jeden bankový pohyb smie zaplatiť najviac jednu splátku. Posledná poistka
-- proti tomu, aby opakované párovanie zapísalo tú istú platbu dvakrát.
CREATE UNIQUE INDEX financing_installments_pohyb_uniq
  ON public.financing_installments (bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL;

CREATE INDEX financing_contracts_firma_idx ON public.financing_contracts (company_id, status);
CREATE INDEX financing_contracts_vozidlo_idx ON public.financing_contracts (vehicle_id);
CREATE INDEX financing_installments_firma_idx ON public.financing_installments (company_id, due_date);
CREATE INDEX financing_installments_zmluva_idx ON public.financing_installments (contract_id, number);
CREATE INDEX financing_installments_nezaplatene_idx
  ON public.financing_installments (company_id, due_date)
  WHERE paid_at IS NULL;

-- Pohyb si pamätá, ktorú splátku zaplatil — inak sa nedá zistiť, čo je už
-- spárované, ani párovanie vrátiť.
ALTER TABLE public.bank_transactions
  ADD COLUMN matched_installment_id uuid REFERENCES public.financing_installments(id) ON DELETE SET NULL;

CREATE INDEX bank_transactions_splatka_idx
  ON public.bank_transactions (matched_installment_id)
  WHERE matched_installment_id IS NOT NULL;

ALTER TABLE public.financing_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financing_installments ENABLE ROW LEVEL SECURITY;

-- Zmluvy o financovaní vedie účtovník aj zamestnanec ako ktorýkoľvek doklad;
-- na správu firmy (banka, kľúče) to nesiaha.
CREATE POLICY "clenovia citaju zmluvy" ON public.financing_contracts
  FOR SELECT USING (public.is_company_member(company_id, (SELECT auth.uid())));
CREATE POLICY "clenovia zapisuju zmluvy" ON public.financing_contracts
  FOR INSERT WITH CHECK (public.is_company_member(company_id, (SELECT auth.uid())));
CREATE POLICY "clenovia upravuju zmluvy" ON public.financing_contracts
  FOR UPDATE USING (public.is_company_member(company_id, (SELECT auth.uid())));
CREATE POLICY "clenovia mazu zmluvy" ON public.financing_contracts
  FOR DELETE USING (public.is_company_member(company_id, (SELECT auth.uid())));

CREATE POLICY "clenovia citaju splatky" ON public.financing_installments
  FOR SELECT USING (public.is_company_member(company_id, (SELECT auth.uid())));
CREATE POLICY "clenovia zapisuju splatky" ON public.financing_installments
  FOR INSERT WITH CHECK (public.is_company_member(company_id, (SELECT auth.uid())));
CREATE POLICY "clenovia upravuju splatky" ON public.financing_installments
  FOR UPDATE USING (public.is_company_member(company_id, (SELECT auth.uid())));
CREATE POLICY "clenovia mazu splatky" ON public.financing_installments
  FOR DELETE USING (public.is_company_member(company_id, (SELECT auth.uid())));

REVOKE ALL ON public.financing_contracts FROM public;
REVOKE ALL ON public.financing_installments FROM public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financing_contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financing_installments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financing_contracts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financing_installments TO service_role;

CREATE TRIGGER set_updated_at_financing_contracts
  BEFORE UPDATE ON public.financing_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_financing_installments
  BEFORE UPDATE ON public.financing_installments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
