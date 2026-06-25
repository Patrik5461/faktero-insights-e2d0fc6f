
-- 1) bank_connections: restrict SELECT to admins (protect OAuth tokens)
DROP POLICY IF EXISTS "bank_connections member select" ON public.bank_connections;
CREATE POLICY "bank_connections admin select"
ON public.bank_connections
FOR SELECT
USING (is_company_admin(company_id, auth.uid()));

-- 2) ai_actions: enforce company membership on UPDATE
DROP POLICY IF EXISTS ai_act_update ON public.ai_actions;
CREATE POLICY ai_act_update
ON public.ai_actions
FOR UPDATE
USING (user_id = auth.uid() AND is_company_member(company_id, auth.uid()))
WITH CHECK (user_id = auth.uid() AND is_company_member(company_id, auth.uid()));

-- 3) ai_conversations: enforce company membership on UPDATE
DROP POLICY IF EXISTS ai_conv_update ON public.ai_conversations;
CREATE POLICY ai_conv_update
ON public.ai_conversations
FOR UPDATE
USING (user_id = auth.uid() AND is_company_member(company_id, auth.uid()))
WITH CHECK (user_id = auth.uid() AND is_company_member(company_id, auth.uid()));

-- 4) company_users: remove race-prone bootstrap policy.
-- Ownership is granted exclusively via SECURITY DEFINER RPC create_company_with_owner.
DROP POLICY IF EXISTS "Bootstrap first owner only" ON public.company_users;
