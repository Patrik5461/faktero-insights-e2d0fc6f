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

/**
 * Firmy prihláseného človeka aj s **jeho** rolou.
 *
 * Bez `eq("user_id", …)` vráti RLS všetky členstvá firmy — teda po jednom
 * riadku za každého kolegu. Firma sa potom v prepínači zobrazila toľkokrát,
 * koľko mala členov, a rola sa vzala z cudzieho riadku: účtovník sa videl ako
 * majiteľ a v menu mu svietili položky pre administrátora.
 */
export async function fetchMyCompanies() {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from("company_users")
    .select("role, company:companies(id, name, logo_url)")
    .eq("user_id", uid)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .filter((r: any) => r.company)
    .map((r: any) => ({ role: r.role, ...r.company }));
}
