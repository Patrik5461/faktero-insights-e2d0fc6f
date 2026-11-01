import { useClenstvoFirmy } from "@/lib/faktero/use-opravnenia";
import { opravneniaSkladu } from "@/lib/faktero/sklad-opravnenia";

export type StockRole = "owner" | "admin" | "accountant" | "employee" | "custom" | "viewer" | null;

/**
 * Oprávnenia v sklade pre tlačidlá v UI — zrkadlo RLS
 * (`firmy_s_pravom('sklad', true)`).
 *
 * - `canMutate`: pohyby, príjem/výdaj, rezervácie, inventúra aj úprava
 *   a archivácia skladovej karty. Majiteľ, admin, účtovník, používateľ
 *   a vlastný prístup s právom „Sklad a cenník: upravovať“. Rola custom tu
 *   predtým chýbala úplne, takže nevidela Príjem/Výdaj ani s právom zápisu.
 * - `canManage`: správa skladov (zakladať, rušiť) ostáva na administrácii.
 *
 * Kým sa rola nenačíta, je `loading` true a všetko `false`.
 */
export function useStockPermissions() {
  const { rola, opravnenia, nacitane } = useClenstvoFirmy();
  return { role: (rola ?? null) as StockRole, ...opravneniaSkladu(rola, opravnenia, nacitane) };
}
