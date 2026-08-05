-- Doplnenie dvoch FK stĺpcov, ktoré migrácia 20260804150000_fk_indexes.sql vynechala.
-- Odhalil ich Supabase performance advisor (unindexed_foreign_keys) po jej aplikovaní:
--   invoices.advance_invoice_id  — FK invoices_advance_invoice_id_fkey
--   subscriptions.plan_id        — FK subscriptions_plan_id_fkey
-- Overené: ani jeden z nich nemal index s daným stĺpcom ako vedúcim.

CREATE INDEX IF NOT EXISTS idx_invoices_advance_invoice ON public.invoices (advance_invoice_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON public.subscriptions (plan_id);
