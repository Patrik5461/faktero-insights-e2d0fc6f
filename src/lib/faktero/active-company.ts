import { supabase } from "@/integrations/supabase/client";

const KEY = "faktero.active_company";

export function getActiveCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function setActiveCompanyId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(KEY, id);
  else localStorage.removeItem(KEY);
}

export async function fetchMyCompanies() {
  const { data, error } = await supabase
    .from("company_users")
    .select("role, company:companies(id, name, logo_url)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ role: r.role, ...r.company }));
}