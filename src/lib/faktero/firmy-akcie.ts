/*
  Akcie pri firme v Správe firiem (/firmy). „Upraviť“ a „Pozvať“ vedú do
  nastavení firmy (/firma), ktoré sa vždy týkajú AKTÍVNEJ firmy — pri inej
  firme v riadku ju treba najprv prepnúť, inak by človek upravoval inú firmu,
  než na ktorú klikol (S-17). Upraviť a pozývať smie len majiteľ alebo admin.
*/
import { jeAdminRola } from "./opravnenia";

export type AkciaFirmy = { kam: string; prepnut: boolean };

export function akciaUpravyFirmy(
  r: { id: string; role?: string | null },
  aktivna: string | null,
  kam = "/firma",
): AkciaFirmy | null {
  if (!jeAdminRola(r.role)) return null;
  return { kam, prepnut: r.id !== aktivna };
}
