/**
 * Sťahovanie zápisu v registri — len `fetch`, bez Supabase, aby to vedel
 * použiť server aj skript `scripts/doplnit-zapis-v-registri.ts`.
 *
 * - SK: Register právnických osôb (RPO, ŠÚ SR) — verejné, bez kľúča. Pozná
 *   obchodný aj živnostenský register (`sourceRegister`).
 * - CZ: ARES, veřejný rejstřík (`ekonomicke-subjekty-vr`) — spisová značka.
 */
import { zapisZAresVr, zapisZRpo, type ZapisZRegistra } from "./zapis-v-registri";

const RPO = "https://api.statistics.sk/rpo/v1/search";
const ARES_VR = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty-vr";
const CAKANIE_MS = 10000;

export type VysledokZapisu =
  | { stav: "ok"; zapis: ZapisZRegistra; zdroj: "rpo" | "ares" | "finstat"; nazov?: string | null }
  | { stav: "nenajdene"; dovod: string }
  | { stav: "chyba"; dovod: string };

const ico8 = (ico: string) => String(ico ?? "").replace(/\D/g, "").padStart(8, "0");

export async function zapisZRpoPodlaIco(ico: string): Promise<VysledokZapisu> {
  const k = ico8(ico);
  if (!/^\d{8}$/.test(k)) return { stav: "chyba", dovod: "neplatné IČO" };
  try {
    const r = await fetch(`${RPO}?identifier=${k}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(CAKANIE_MS),
    });
    if (!r.ok) return { stav: "chyba", dovod: `RPO HTTP ${r.status}` };
    const d: any = await r.json();
    const vysledky: any[] = Array.isArray(d?.results) ? d.results : [];
    if (!vysledky.length) return { stav: "nenajdene", dovod: "IČO v RPO nie je" };
    // Viac záznamov = zaniknutý a nový subjekt s tým istým IČO; berie sa ten bez `validTo`.
    const z =
      vysledky.find((x) => !x?.validTo && !x?.terminatedOn) ?? vysledky[vysledky.length - 1];
    const zapis = zapisZRpo(z);
    if (!zapis || !zapis.text) return { stav: "nenajdene", dovod: "RPO nemá údaj o registri" };
    const mena: any[] = Array.isArray(z?.fullNames) ? z.fullNames : [];
    const nazov = (mena.find((m) => !m?.validTo) ?? mena.at(-1))?.value ?? null;
    return { stav: "ok", zapis, zdroj: "rpo", nazov };
  } catch (e) {
    return { stav: "chyba", dovod: `RPO: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function zapisZAresPodlaIco(ico: string): Promise<VysledokZapisu> {
  const k = ico8(ico);
  if (!/^\d{8}$/.test(k)) return { stav: "chyba", dovod: "neplatné IČO" };
  try {
    const r = await fetch(`${ARES_VR}/${k}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(CAKANIE_MS),
    });
    // 404 = subjekt nie je vo veřejném rejstříku (napr. živnostník) — ručne.
    if (r.status === 404) return { stav: "nenajdene", dovod: "ARES: nie je vo veřejném rejstříku" };
    if (!r.ok) return { stav: "chyba", dovod: `ARES HTTP ${r.status}` };
    const d: any = await r.json();
    const zapis = zapisZAresVr(d);
    if (!zapis) return { stav: "nenajdene", dovod: "ARES nemá spisovú značku" };
    const zaznam = (d?.zaznamy ?? []).find((x: any) => x?.primarniZaznam) ?? d?.zaznamy?.[0];
    const mena: any[] = Array.isArray(zaznam?.obchodniJmeno) ? zaznam.obchodniJmeno : [];
    const nazov = (mena.find((m) => !m?.datumVymazu) ?? mena.at(-1))?.hodnota ?? null;
    return { stav: "ok", zapis, zdroj: "ares", nazov };
  } catch (e) {
    return { stav: "chyba", dovod: `ARES: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const jeCeskaKrajina = (country: string | null | undefined) =>
  /^(CZ|CZE|ČESK|CESK|CZECH)/i.test(String(country ?? "").trim());
