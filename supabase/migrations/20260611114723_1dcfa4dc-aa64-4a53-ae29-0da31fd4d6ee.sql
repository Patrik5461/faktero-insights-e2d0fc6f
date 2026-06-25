CREATE POLICY "Members upload company imports"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'imports' AND public.is_company_member((storage.foldername(name))[1]::uuid, auth.uid()));

CREATE POLICY "Members read company imports"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'imports' AND public.is_company_member((storage.foldername(name))[1]::uuid, auth.uid()));