
-- 1) company_users insert hardening
DROP POLICY IF EXISTS "User can insert self as owner on new company" ON public.company_users;

CREATE POLICY "Bootstrap first owner only"
  ON public.company_users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'::public.company_role
    AND NOT EXISTS (
      SELECT 1 FROM public.company_users existing
      WHERE existing.company_id = company_users.company_id
    )
  );

CREATE POLICY "Admins add members"
  ON public.company_users
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_company_admin(company_id, auth.uid()));

-- 2) Lock down SECURITY DEFINER function EXECUTE
REVOKE EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_company_admin(uuid, uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_company_role(uuid, uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_at()              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_company_with_owner(
  text, text, text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.faktero_recurring_cron_status() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.faktero_recurring_cron_status() TO service_role;

-- 3) invoice_email_logs: explicit service_role policy
DROP POLICY IF EXISTS "service_role manages invoice_email_logs" ON public.invoice_email_logs;
CREATE POLICY "service_role manages invoice_email_logs"
  ON public.invoice_email_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4) storage.objects: invoice-pdfs bucket — explicit service_role write policy
DROP POLICY IF EXISTS "service_role manages invoice-pdfs" ON storage.objects;
CREATE POLICY "service_role manages invoice-pdfs"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'invoice-pdfs')
  WITH CHECK (bucket_id = 'invoice-pdfs');
