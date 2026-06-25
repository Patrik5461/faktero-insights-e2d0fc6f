
-- Restrict EXECUTE on SECURITY DEFINER helpers
REVOKE ALL ON FUNCTION public.is_company_member(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_company_admin(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_company_role(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_role(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;

-- Storage policies for company-logos bucket (private; signed URLs)
CREATE POLICY "Members read own company logos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'company-logos' AND public.is_company_member((storage.foldername(name))[1]::uuid, auth.uid()));
CREATE POLICY "Admins write own company logos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-logos' AND public.is_company_admin((storage.foldername(name))[1]::uuid, auth.uid()));
CREATE POLICY "Admins update own company logos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'company-logos' AND public.is_company_admin((storage.foldername(name))[1]::uuid, auth.uid()));
CREATE POLICY "Admins delete own company logos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-logos' AND public.is_company_admin((storage.foldername(name))[1]::uuid, auth.uid()));

-- Storage policies for invoice-pdfs (private; written by service role, read via signed URLs)
CREATE POLICY "Members read own company invoice pdfs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'invoice-pdfs' AND public.is_company_member((storage.foldername(name))[1]::uuid, auth.uid()));
