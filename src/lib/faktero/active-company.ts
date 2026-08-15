import { supabase } from "@/integrations/supabase/client";
import { citaj, zapis, zmaz } from "@/lib/mobile/trvale-ulozisko";

const KEY = "faktero.active_company";

/**
 * Vybraná firma prežije zatvorenie appky.
 *
 * V telefóne to `localStorage` nezvládne — po znovuotvorení bol prázdny a appka
 * sa pýtala na firmu znova, hoci si ju človek vybral. `citaj`/`zapis` idú v
 * telefóne cez natívne úložisko, na webe ostáva prehliadačové.
 */
export function getActiveCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  return citaj(KEY);
}

export function setActiveCompanyId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) zapis(KEY, id);
  else zmaz(KEY);
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
  // `getUser()` sa pýta servera; bez signálu čaká na vypršanie a appka pri
  // štarte visí. Relácia v telefóne to isté id povie hneď a serveru sa aj tak
  // verí až pri samotnom dotaze, ktorý stráži RLS.
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user?.id;
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
