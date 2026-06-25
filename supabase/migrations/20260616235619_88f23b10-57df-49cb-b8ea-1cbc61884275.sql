
-- Tighten tesla_connections SELECT to admins (encrypted OAuth tokens)
DROP POLICY IF EXISTS "tesla_connections_select" ON public.tesla_connections;
CREATE POLICY "tesla_connections_select" ON public.tesla_connections
  FOR SELECT USING (public.is_company_admin(company_id, auth.uid()));

-- Restrict subscriptions writes: remove ALL-admin policy; only service_role can mutate
DROP POLICY IF EXISTS "Admins manage subscription" ON public.subscriptions;
-- (existing "Members read subscription" SELECT policy stays)

-- import_jobs: restrict UPDATE/INSERT/DELETE to admins; SELECT stays for members
DROP POLICY IF EXISTS "Members update company import jobs" ON public.import_jobs;
DROP POLICY IF EXISTS "Members write company import jobs" ON public.import_jobs;
CREATE POLICY "Admins update company import jobs" ON public.import_jobs
  FOR UPDATE USING (public.is_company_admin(company_id, auth.uid()))
  WITH CHECK (public.is_company_admin(company_id, auth.uid()));
CREATE POLICY "Admins insert company import jobs" ON public.import_jobs
  FOR INSERT WITH CHECK (public.is_company_admin(company_id, auth.uid()));
