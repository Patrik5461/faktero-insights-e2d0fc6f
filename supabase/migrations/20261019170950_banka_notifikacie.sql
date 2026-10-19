-- Aplikované v dvoch častiach: 20261019170950_banka_notifikacie_tabulky a 20261019170952_banka_notifikacie_prava.
-- Párovanie platieb cez e-mailové notifikácie banky.
--
-- Pre banky bez API (alebo bez nášho napojenia) si firma v internetbankingu
-- zapne posielanie notifikácií o pohyboch na účte na vlastnú tajnú adresu
-- `banka-<token>@<MAIL_PRIJEM_DOMENA>`. Z každého e-mailu vznikne bankový
-- pohyb (alebo záznam na kontrolu) a pohyb sa spáruje s faktúrou.
--
-- Zápis robí výhradne server (`supabaseAdmin` po `overPristup`) — klient
-- dostáva len SELECT. Oblasť vlastného prístupu: „banka".

-- ------------------------------------------------------------------
-- Zdroj pohybu
-- ------------------------------------------------------------------
-- NULL = banka/API/výpis ako doteraz, 'email' = vznikol z notifikácie.
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS zdroj text
    CHECK (zdroj IS NULL OR zdroj IN ('email'));
COMMENT ON COLUMN public.bank_transactions.zdroj IS
  'Odkiaľ pohyb prišiel: NULL = banka / výpis, email = e-mailová notifikácia banky.';
-- Granty na bank_transactions sú na celú tabuľku — nový stĺpec ďalší GRANT nepotrebuje.

-- ------------------------------------------------------------------
-- Adresy pre notifikácie (jedna na bankový účet)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.banka_notifikacie_adresy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  -- Tajná časť adresy za „banka-" (malé písmená a číslice, 16 znakov).
  token text NOT NULL CHECK (token ~ '^[a-z0-9]{16}$'),
  -- Kód banky z `BANKY` v src/lib/faktero/banka-notifikacie.ts, 'ina' = iná.
  banka text NOT NULL DEFAULT 'ina',
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_received_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS banka_notifikacie_adresy_token_uidx
  ON public.banka_notifikacie_adresy (token);
CREATE UNIQUE INDEX IF NOT EXISTS banka_notifikacie_adresy_ucet_uidx
  ON public.banka_notifikacie_adresy (bank_account_id);
CREATE INDEX IF NOT EXISTS banka_notifikacie_adresy_firma_idx
  ON public.banka_notifikacie_adresy (company_id);
CREATE INDEX IF NOT EXISTS banka_notifikacie_adresy_created_by_idx
  ON public.banka_notifikacie_adresy (created_by);

-- ------------------------------------------------------------------
-- Prijaté notifikácie (denník + fronta na kontrolu)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.banka_notifikacie_maily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  adresa_id uuid REFERENCES public.banka_notifikacie_adresy(id) ON DELETE SET NULL,
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  provider_email_id text,
  message_id text,
  from_email text,
  subject text,
  received_at timestamptz NOT NULL DEFAULT now(),
  -- spracovane = vznikol pohyb, na_kontrolu = čaká na človeka,
  -- duplicita = ten istý pohyb už je, zahodene = človek ho zahodil,
  -- potvrdenie = overovací e-mail preposielania (Gmail), nie_pohyb = mail
  -- od banky, ktorý o pohybe nie je (reklama, zmena hesla), chyba = zlyhanie.
  stav text NOT NULL DEFAULT 'na_kontrolu'
    CHECK (stav IN ('spracovane', 'na_kontrolu', 'duplicita', 'zahodene', 'potvrdenie', 'nie_pohyb', 'chyba')),
  -- pravidlo:<banka> | ai | rucne
  sposob text,
  -- Rozpoznaná banka (kód), ak sa dá.
  banka text,
  -- Ako dopadlo overenie odosielateľa (napr. „DKIM vub.sk").
  overenie text,
  -- Prečo je mail na kontrole / čo sa stalo — pre človeka.
  dovod text,
  -- Vytiahnuté údaje (suma, mena, smer, dátum, VS/KS/ŠS, protistrana, IBAN…),
  -- pri potvrdení preposielania len kód, odkaz a schránka.
  udaje jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Holý text mailu (najviac 20 000 znakov), aby sa dal ručne zaradiť.
  -- Pri potvrdení preposielania sa neukladá.
  text_mailu text,
  bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  vyriesene_at timestamptz,
  vyriesil uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
-- Ten istý e-mail dvakrát nespracujeme (opakovaný webhook, preposlaný dvakrát).
CREATE UNIQUE INDEX IF NOT EXISTS banka_notifikacie_maily_provider_uidx
  ON public.banka_notifikacie_maily (provider_email_id) WHERE provider_email_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS banka_notifikacie_maily_message_uidx
  ON public.banka_notifikacie_maily (company_id, message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS banka_notifikacie_maily_firma_idx
  ON public.banka_notifikacie_maily (company_id, received_at DESC);
CREATE INDEX IF NOT EXISTS banka_notifikacie_maily_adresa_idx
  ON public.banka_notifikacie_maily (adresa_id);
CREATE INDEX IF NOT EXISTS banka_notifikacie_maily_ucet_idx
  ON public.banka_notifikacie_maily (bank_account_id);
CREATE INDEX IF NOT EXISTS banka_notifikacie_maily_pohyb_idx
  ON public.banka_notifikacie_maily (bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS banka_notifikacie_maily_vyriesil_idx
  ON public.banka_notifikacie_maily (vyriesil);

-- ------------------------------------------------------------------
-- RLS, dvojfaktor, vlastný prístup, granty
-- ------------------------------------------------------------------
ALTER TABLE public.banka_notifikacie_adresy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banka_notifikacie_maily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clenovia citaju" ON public.banka_notifikacie_adresy
  FOR SELECT TO authenticated USING (public.is_company_member(company_id, (SELECT auth.uid())));
CREATE POLICY "clenovia citaju" ON public.banka_notifikacie_maily
  FOR SELECT TO authenticated USING (public.is_company_member(company_id, (SELECT auth.uid())));

CREATE POLICY "mfa ak je zapnute" ON public.banka_notifikacie_adresy AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.mfa_ok())) WITH CHECK ((SELECT public.mfa_ok()));
CREATE POLICY "mfa ak je zapnute" ON public.banka_notifikacie_maily AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.mfa_ok())) WITH CHECK ((SELECT public.mfa_ok()));

SELECT public.vlastny_pristup_politiky_na('banka_notifikacie_adresy', 'company_id', 'banka');
SELECT public.vlastny_pristup_politiky_na('banka_notifikacie_maily', 'company_id', 'banka');

-- Právo drží PUBLIC — odobrať treba jemu, nie len anon (pamäť faktero-supabase-public-grant).
REVOKE ALL ON public.banka_notifikacie_adresy FROM PUBLIC, anon;
REVOKE ALL ON public.banka_notifikacie_maily FROM PUBLIC, anon;
-- Klient len číta; zapisuje server cez service_role.
GRANT SELECT ON public.banka_notifikacie_adresy TO authenticated;
GRANT SELECT ON public.banka_notifikacie_maily TO authenticated;
GRANT ALL ON public.banka_notifikacie_adresy TO service_role;
GRANT ALL ON public.banka_notifikacie_maily TO service_role;
