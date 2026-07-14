
CREATE POLICY "product_photos_select_member" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND public.is_company_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "product_photos_insert_member" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-photos'
    AND public.is_company_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "product_photos_update_member" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND public.is_company_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "product_photos_delete_member" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND public.is_company_member((storage.foldername(name))[1]::uuid, auth.uid())
  );
