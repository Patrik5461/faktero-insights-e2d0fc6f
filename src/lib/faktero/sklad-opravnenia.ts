/**
 * Oprávnenia v sklade pre tlačidlá v UI — zrkadlo RLS
 * (`firmy_s_pravom('sklad', true)`). Čistá funkcia pre `useStockPermissions`.
 */
import { jeAdminRola, mozeUpravovat } from "./opravnenia";

export function opravneniaSkladu(
  rola: string | null | undefined,
  opravnenia: unknown,
  nacitane: boolean,
) {
  const isAdmin = nacitane && jeAdminRola(rola ?? null);
  return {
    loading: !nacitane,
    isAdmin,
    /** Pohyby, inventúra, rezervácie aj úprava a archivácia karty. */
    canMutate: nacitane && mozeUpravovat(rola ?? null, (opravnenia ?? {}) as any, "sklad"),
    /** Správa skladov (zakladať, rušiť) ostáva na administrácii. */
    canManage: isAdmin,
    canExport: nacitane && !!rola,
  };
}
