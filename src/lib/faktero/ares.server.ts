/**
 * Vyhľadanie českej firmy v registri ARES.
 *
 * Český bloček nesie v QR kóde len DIČ — názov predajcu ani adresa v ňom nie sú
 * a databáza dokladov, z ktorej by sa dali dotiahnuť, po zrušení evidencie
 * tržieb neexistuje (viď `eet-cz.ts`). ARES je verejný register ekonomických
 * subjektov, je zadarmo a bez kľúča, takže aspoň predajcu vieme podľa IČO
 * pomenovať.
 *
 * Zlyhanie nikdy nesmie zhodiť čítanie dokladu — bez názvu je doklad stále
 * použiteľný, len ho človek dopíše sám.
 */

const ARES = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";
const CAKANIE_MS = 8000;
/** Register sa mení po dňoch, nie po minútach. */
const PLATNOST_MS = 24 * 60 * 60 * 1000;

export type AresFirma = {
  nazov?: string;
  adresa?: string;
  /** DIČ z registra — a teda aj IČ DPH, keď je firma platiteľom. */
  dic?: string;
  platitelDph?: boolean;
};

const pamat = new Map<string, { do: number; firma: AresFirma | null }>();

export async function firmaZAres(ico: string): Promise<AresFirma | null> {
  const kluc = ico.replace(/\D/g, "").padStart(8, "0");
  if (kluc.length !== 8) return null;

  const zapamatane = pamat.get(kluc);
  if (zapamatane && zapamatane.do > Date.now()) return zapamatane.firma;

  try {
    const r = await fetch(`${ARES}/${kluc}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(CAKANIE_MS),
    });
    // 404 znamená, že také IČO register nepozná — to je odpoveď, nie porucha,
    // a netreba sa naň pýtať znova pri každom bločku.
    if (r.status === 404) {
      pamat.set(kluc, { do: Date.now() + PLATNOST_MS, firma: null });
      return null;
    }
    if (!r.ok) return null;

    const d: any = await r.json();
    const firma: AresFirma = {
      nazov: typeof d?.obchodniJmeno === "string" ? d.obchodniJmeno : undefined,
      adresa: typeof d?.sidlo?.textovaAdresa === "string" ? d.sidlo.textovaAdresa : undefined,
      dic: typeof d?.dic === "string" ? d.dic : undefined,
      platitelDph: d?.seznamRegistraci?.stavZdrojeDph === "AKTIVNI",
    };
    pamat.set(kluc, { do: Date.now() + PLATNOST_MS, firma });
    return firma;
  } catch (e) {
    console.warn("[ares] firmu sa nepodarilo dohľadať:", e instanceof Error ? e.message : e);
    return null;
  }
}
