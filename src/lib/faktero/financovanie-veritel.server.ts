/**
 * Doplnenie údajov veriteľa (leasingovka/banka) z registra firiem — ten istý
 * FinStat/ARES s `company_cache`, ktorý vypĺňa adresár.
 *
 * Výpadok registra nikdy nezhodí uloženie ani čítanie zmluvy: údaje potom
 * ostanú také, aké prišli, a človek ich doplní ručne.
 */
import {
  chybaVeriteloviNieco,
  doplnZRegistra,
  normNazovFirmy,
  type VeritelZmluvy,
} from "./financovanie-veritel";

/** Dlhšie sa na register nečaká — uloženie zmluvy ide cez nginx s limitom 30 s. */
const CAKANIE_MS = 6000;

function sCasovacom<T>(p: Promise<T>): Promise<T | null> {
  return Promise.race([p, new Promise<null>((res) => setTimeout(() => res(null), CAKANIE_MS))]);
}

/** Keď je IČO a niečo chýba, doplní prázdne polia z registra. */
export async function doplnVeritelaZRegistra(v: VeritelZmluvy): Promise<{ veritel: VeritelZmluvy; zRegistra: boolean }> {
  if (!v.provider_ico || !/^\d{8}$/.test(v.provider_ico) || !chybaVeriteloviNieco(v)) {
    return { veritel: v, zRegistra: false };
  }
  try {
    const reg = await import("./company-registry.server");
    if (!reg.isRegistryConfigured()) return { veritel: v, zRegistra: false };
    const r = await sCasovacom(reg.firmaZRegistraBezRezimu(v.provider_ico));
    if (!r || r.status !== "ok") return { veritel: v, zRegistra: false };
    return { veritel: doplnZRegistra(v, r.data), zRegistra: true };
  } catch (e) {
    console.warn("[financovanie-veritel] register:", String((e as Error)?.message ?? e));
    return { veritel: v, zRegistra: false };
  }
}

export type KandidatVeritela = { ico: string; nazov: string; mesto: string | null };

/**
 * Hľadanie veriteľa podľa názvu. Jednoznačná zhoda (rovnaký názov po
 * odstránení právnej formy a diakritiky, alebo jediný výsledok) vráti IČO;
 * inak zoznam na výber — hádať sa nebude.
 */
export async function najdiVeritelaPodlaNazvu(
  nazov: string,
): Promise<{ ico: string | null; kandidati: KandidatVeritela[] }> {
  const q = String(nazov ?? "").trim();
  if (q.length < 3) return { ico: null, kandidati: [] };
  const reg = await import("./company-registry.server");
  const r = await sCasovacom(reg.searchCompaniesByName(q));
  if (!r || r.status !== "ok") return { ico: null, kandidati: [] };
  const kandidati = r.data
    .filter((x) => x.ico)
    .slice(0, 8)
    .map((x) => ({ ico: String(x.ico), nazov: String(x.name ?? ""), mesto: x.city ?? null }));
  const cielovy = normNazovFirmy(q);
  const presne = kandidati.filter((k) => normNazovFirmy(k.nazov) === cielovy);
  if (presne.length === 1) return { ico: presne[0].ico, kandidati };
  if (kandidati.length === 1) return { ico: kandidati[0].ico, kandidati };
  return { ico: null, kandidati };
}
