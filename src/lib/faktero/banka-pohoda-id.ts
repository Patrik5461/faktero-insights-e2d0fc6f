/**
 * Identifikátor pohybu z bankového výpisu v dávke pre POHODU (`dataPackItem@id`).
 *
 * POHODA pri importe s kontrolou duplicity porovnáva dvojicu `dataPack@id` +
 * `dataPackItem@id` (data.xsd). Kedysi išli pohyby ako `VYPIS-1`, `VYPIS-2`…
 * — rovnaké v každom mesiaci a na každom účte, takže druhý výpis by POHODA
 * odmietla ako duplicitu (audit 14. 11., V7). Id preto musí byť:
 *
 *  - **jedinečné** naprieč účtami, mesiacmi a rokmi,
 *  - **stabilné** pre ten istý pohyb — opakovaný import toho istého výpisu
 *    POHODA odmietne a pohyb sa nezdvojí.
 *
 * Pohyb z databázy (`bank_transactions.id`) má id hotové. Pohyb prečítaný z PDF
 * alebo XML banky id nemá — vezme sa odtlačok účtu a obsahu pohybu (dátum,
 * smer, suma, symboly, protistrana, protiúčet, text) a poradie medzi úplne
 * rovnakými pohybmi v tom istom výpise.
 */
import type { VypisPohyb } from "./export.server";

/** 53-bitový odtlačok textu (cyrb53) ako hex — stabilný, bez závislostí. */
export function odtlacok(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, "0");
}

const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toUpperCase();

/** Obsah pohybu, z ktorého sa robí odtlačok. */
function obsahPohybu(p: VypisPohyb): string {
  return [
    norm(p.datum),
    p.smer === "vydaj" ? "V" : "P",
    Math.abs(Number(p.suma ?? 0)).toFixed(2),
    norm(p.vs),
    norm(p.ks),
    norm(p.ss),
    norm(p.protistrana),
    norm(p.protiucet).replace(/\s+/g, ""),
    norm(p.popis),
  ].join("|");
}

/**
 * Id všetkých pohybov výpisu v poradí, v akom idú do dávky.
 *
 * @param kontext účet výpisu (IBAN, inak skratka účtu v POHODE) — ten istý
 *   pohyb na dvoch účtoch sú dva doklady.
 */
export function idPohybovVypisu(pohyby: VypisPohyb[], kontext: unknown): string[] {
  const ucet = norm(kontext).replace(/\s+/g, "");
  const videne = new Map<string, number>();
  return pohyby.map((p) => {
    const vlastne = String((p as { id?: unknown }).id ?? "").trim();
    // Pohyb z databázy: uuid (36 znakov) + predpona sa zmestí do string64.
    if (vlastne) return `BNK-${vlastne}`.slice(0, 64);
    const obsah = obsahPohybu(p);
    const poradie = (videne.get(obsah) ?? 0) + 1;
    videne.set(obsah, poradie);
    return `BNK-${odtlacok(`${ucet}|${obsah}`)}${poradie > 1 ? `-${poradie}` : ""}`;
  });
}

/**
 * Konštantný a špecifický symbol z textu platby. Slovenské a české banky ich
 * píšu ako `/VS123/SS456/KS0308` alebo `KS: 0308`; iné miesto na ne pohyb z
 * databázy nemá.
 */
export function symbolyZTextu(text: unknown): { ks: string | null; ss: string | null } {
  const s = String(text ?? "");
  const najdi = (kod: "KS" | "SS", max: number) => {
    const m = new RegExp(`(?:^|[\\s/,;])${kod}\\s*[:=]?\\s*(\\d{1,${max}})(?!\\d)`, "i").exec(s);
    return m ? m[1]! : null;
  };
  return { ks: najdi("KS", 4), ss: najdi("SS", 10) };
}
