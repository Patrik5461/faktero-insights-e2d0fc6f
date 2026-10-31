/*
  Načítanie adaptéra podľa poskytovateľa — len na serveri. Nový poskytovateľ
  sa pridá sem a do `register.ts`.
*/
import type { KartaAdapter } from "./typy";

const NACITAJ: Record<string, () => Promise<{ adapter: KartaAdapter }>> = {
  shell: () => import("./shell.server"),
  up: () => import("./up.server"),
};

export async function nacitajAdapter(id: string): Promise<KartaAdapter> {
  const f = NACITAJ[id];
  if (!f) throw new Error(`Palivová karta „${id}“ zatiaľ nie je podporovaná.`);
  return (await f()).adapter;
}
