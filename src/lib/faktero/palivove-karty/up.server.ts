/*
  Up Déjeuner (Shell karta od Up) — verejné API nemá, nákupy prídu nahratím
  výpisu alebo faktúry (`nahratie.server.ts`). Adaptér je prázdny, aby
  synchronizácia ani nočný beh pri tomto pripojení nič nerobili a nespadli.
*/
import type { KartaAdapter } from "./typy";

export const adapter: KartaAdapter = {
  id: "up",
  async test() {
    /* niet čo overovať — pripojenie nemá prihlasovacie údaje */
  },
  async transakcie() {
    return [];
  },
};
