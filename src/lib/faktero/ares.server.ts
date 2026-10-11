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
  /** Rozpísaná adresa sídla — na doplnenie formulára firmy. */
  ulica?: string;
  mesto?: string;
  psc?: string;
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
      ...rozpisAdresy(d?.sidlo),
    };
    pamat.set(kluc, { do: Date.now() + PLATNOST_MS, firma });
    return firma;
  } catch (e) {
    console.warn("[ares] firmu sa nepodarilo dohľadať:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** „Jeremiášova 1422/7b“, „Praha 5“, „155 00“ zo štruktúrovaného sídla ARES. */
function rozpisAdresy(sidlo: any): Pick<AresFirma, "ulica" | "mesto" | "psc"> {
  if (!sidlo || typeof sidlo !== "object") return {};
  const cislo = [
    sidlo.cisloDomovni,
    sidlo.cisloOrientacni != null
      ? `${sidlo.cisloOrientacni}${sidlo.cisloOrientacniPismeno ?? ""}`
      : null,
  ]
    .filter((x) => x != null && x !== "")
    .join("/");
  const ulice = sidlo.nazevUlice || sidlo.nazevCastiObce || sidlo.nazevObce;
  const psc = sidlo.psc != null ? String(sidlo.psc).padStart(5, "0") : "";
  return {
    ulica: ulice ? [ulice, cislo].filter(Boolean).join(" ") : undefined,
    mesto: sidlo.nazevMestskehoObvodu || sidlo.nazevObce || undefined,
    psc: psc ? `${psc.slice(0, 3)} ${psc.slice(3)}` : undefined,
  };
}
