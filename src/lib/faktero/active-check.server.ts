/**
 * Server-only helper: throws a friendly Slovak error if the company's
 * subscription is not in a writable state (inactive / suspended / trial expired).
 * Use to gate mutating actions on existing records (email send, status change,
 * API mutations). Read actions stay allowed.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export class PlanInactiveError extends Error {
  code = "plan_inactive" as const;
  constructor() {
    super("Vaše predplatné nie je aktívne. Pre pokračovanie si aktivujte plán.");
  }
}

export async function assertCompanyActive(companyId: string): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc("faktero_can_write", {
    _company_id: companyId,
    _kind: "invoice_mutate",
  });
  if (error) throw error;
  if (data !== true) throw new PlanInactiveError();
}

export async function isCompanyActive(companyId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.rpc("faktero_can_write", {
    _company_id: companyId,
    _kind: "invoice_mutate",
  });
  return data === true;
}
