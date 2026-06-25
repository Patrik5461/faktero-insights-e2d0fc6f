-- ============================================================================
-- eFaktúra 2027 Core — foundation tables
-- ============================================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.efaktura_channel AS ENUM ('peppol', 'digitalny_postar', 'email', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.efaktura_doc_format AS ENUM ('ubl_2_1', 'peppol_bis_3', 'cii_d16b');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.efaktura_doc_status AS ENUM ('draft', 'generated', 'validated', 'invalid', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.efaktura_delivery_status AS ENUM ('pending', 'sent', 'accepted', 'delivered', 'failed', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.efaktura_received_status AS ENUM ('received', 'parsed', 'matched', 'accepted', 'rejected', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 1) efaktura_profiles — per-company configuration & readiness
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.efaktura_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  preferred_channel public.efaktura_channel NOT NULL DEFAULT 'peppol',
  peppol_participant_id text,        -- e.g. 0088:1234567890123 (GLN) or 9915:SK1234567
  peppol_scheme text,                -- iso6523 scheme, e.g. '0088', '9915'
  peppol_provider text,              -- access point provider name (storacle/galaxy/etc.)
  peppol_endpoint_url text,          -- AP endpoint, future use
  digitalny_postar_id text,          -- Finančná správa SR mailbox id, future use
  default_document_format public.efaktura_doc_format NOT NULL DEFAULT 'peppol_bis_3',
  test_mode boolean NOT NULL DEFAULT true,
  readiness_score smallint NOT NULL DEFAULT 0,
  readiness_checked_at timestamptz,
  readiness_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  activated_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT efaktura_profiles_score_range CHECK (readiness_score BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS efaktura_profiles_company_idx ON public.efaktura_profiles(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.efaktura_profiles TO authenticated;
GRANT ALL ON public.efaktura_profiles TO service_role;

ALTER TABLE public.efaktura_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY efaktura_profiles_select ON public.efaktura_profiles
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE POLICY efaktura_profiles_insert ON public.efaktura_profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_admin(company_id, auth.uid()));

CREATE POLICY efaktura_profiles_update ON public.efaktura_profiles
  FOR UPDATE TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()))
  WITH CHECK (public.is_company_admin(company_id, auth.uid()));

CREATE POLICY efaktura_profiles_delete ON public.efaktura_profiles
  FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()));

CREATE TRIGGER efaktura_profiles_set_updated_at
  BEFORE UPDATE ON public.efaktura_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2) efaktura_documents — generated XML per outgoing invoice
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.efaktura_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  format public.efaktura_doc_format NOT NULL DEFAULT 'peppol_bis_3',
  schema_version text NOT NULL DEFAULT '3.0',
  customization_id text,             -- e.g. urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0
  profile_id text,                   -- e.g. urn:fdc:peppol.eu:2017:poacc:billing:01:1.0
  document_number text,              -- mirrors invoice number for quick lookup
  issue_date date,
  currency text NOT NULL DEFAULT 'EUR',
  total numeric(14,2),
  xml_payload text,                  -- generated XML
  payload_hash text,                 -- sha256 for integrity
  status public.efaktura_doc_status NOT NULL DEFAULT 'draft',
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS efaktura_documents_company_idx ON public.efaktura_documents(company_id);
CREATE INDEX IF NOT EXISTS efaktura_documents_invoice_idx ON public.efaktura_documents(invoice_id);
CREATE INDEX IF NOT EXISTS efaktura_documents_status_idx ON public.efaktura_documents(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.efaktura_documents TO authenticated;
GRANT ALL ON public.efaktura_documents TO service_role;

ALTER TABLE public.efaktura_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY efaktura_documents_select ON public.efaktura_documents
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE POLICY efaktura_documents_insert ON public.efaktura_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE POLICY efaktura_documents_update ON public.efaktura_documents
  FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE POLICY efaktura_documents_delete ON public.efaktura_documents
  FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()));

CREATE TRIGGER efaktura_documents_set_updated_at
  BEFORE UPDATE ON public.efaktura_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3) efaktura_deliveries — delivery attempts via providers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.efaktura_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.efaktura_documents(id) ON DELETE CASCADE,
  channel public.efaktura_channel NOT NULL,
  provider text,                     -- access point provider / poštár / email
  recipient_participant_id text,     -- Peppol ID of recipient
  recipient_scheme text,             -- iso6523 scheme of recipient
  recipient_endpoint text,           -- email / URL / mailbox
  status public.efaktura_delivery_status NOT NULL DEFAULT 'pending',
  provider_message_id text,          -- id from external provider
  attempt_count integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  delivered_at timestamptz,
  error_code text,
  error_message text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS efaktura_deliveries_company_idx ON public.efaktura_deliveries(company_id);
CREATE INDEX IF NOT EXISTS efaktura_deliveries_document_idx ON public.efaktura_deliveries(document_id);
CREATE INDEX IF NOT EXISTS efaktura_deliveries_status_idx ON public.efaktura_deliveries(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.efaktura_deliveries TO authenticated;
GRANT ALL ON public.efaktura_deliveries TO service_role;

ALTER TABLE public.efaktura_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY efaktura_deliveries_select ON public.efaktura_deliveries
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE POLICY efaktura_deliveries_insert ON public.efaktura_deliveries
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE POLICY efaktura_deliveries_update ON public.efaktura_deliveries
  FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE POLICY efaktura_deliveries_delete ON public.efaktura_deliveries
  FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()));

CREATE TRIGGER efaktura_deliveries_set_updated_at
  BEFORE UPDATE ON public.efaktura_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4) efaktura_received_documents — incoming eFaktúras
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.efaktura_received_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel public.efaktura_channel NOT NULL DEFAULT 'peppol',
  format public.efaktura_doc_format,
  sender_participant_id text,
  sender_scheme text,
  sender_name text,
  sender_vat_id text,
  document_number text,
  issue_date date,
  due_date date,
  currency text DEFAULT 'EUR',
  total numeric(14,2),
  vat_total numeric(14,2),
  xml_payload text,
  parsed_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.efaktura_received_status NOT NULL DEFAULT 'received',
  parse_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  matched_supplier_invoice_id uuid,  -- nullable; future link when supplier-invoices module exists
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS efaktura_received_company_idx ON public.efaktura_received_documents(company_id);
CREATE INDEX IF NOT EXISTS efaktura_received_status_idx ON public.efaktura_received_documents(status);
CREATE INDEX IF NOT EXISTS efaktura_received_sender_idx ON public.efaktura_received_documents(sender_participant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.efaktura_received_documents TO authenticated;
GRANT ALL ON public.efaktura_received_documents TO service_role;

ALTER TABLE public.efaktura_received_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY efaktura_received_select ON public.efaktura_received_documents
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE POLICY efaktura_received_insert ON public.efaktura_received_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE POLICY efaktura_received_update ON public.efaktura_received_documents
  FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE POLICY efaktura_received_delete ON public.efaktura_received_documents
  FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id, auth.uid()));

CREATE TRIGGER efaktura_received_set_updated_at
  BEFORE UPDATE ON public.efaktura_received_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
