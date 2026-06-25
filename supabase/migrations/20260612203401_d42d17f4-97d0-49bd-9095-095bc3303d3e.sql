
-- Fix: ai_conversations delete policy must also enforce company membership
DROP POLICY IF EXISTS "ai_conv_delete" ON public.ai_conversations;
CREATE POLICY "ai_conv_delete" ON public.ai_conversations
  FOR DELETE
  USING (
    user_id = auth.uid()
    AND public.is_company_member(company_id, auth.uid())
  );

-- Fix: explicit service_role write policies for efaktura-xml storage bucket
-- (writes are server-side only via supabaseAdmin; make intent explicit)
DROP POLICY IF EXISTS "efaktura_xml_service_insert" ON storage.objects;
DROP POLICY IF EXISTS "efaktura_xml_service_update" ON storage.objects;
DROP POLICY IF EXISTS "efaktura_xml_service_delete" ON storage.objects;

CREATE POLICY "efaktura_xml_service_insert" ON storage.objects
  FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'efaktura-xml');

CREATE POLICY "efaktura_xml_service_update" ON storage.objects
  FOR UPDATE TO service_role
  USING (bucket_id = 'efaktura-xml')
  WITH CHECK (bucket_id = 'efaktura-xml');

CREATE POLICY "efaktura_xml_service_delete" ON storage.objects
  FOR DELETE TO service_role
  USING (bucket_id = 'efaktura-xml');
