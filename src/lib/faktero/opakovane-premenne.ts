/**
 * Premenné obdobia v texte opakovanej faktúry.
 *
 * Paušál sa fakturuje každý mesiac s iným obdobím v texte („Správa serverov
 * za október 2026“). Šablóna mala text pevný, takže novembrová faktúra
 * hovorila znova o októbri. Do názvu, popisu položky, textu nad položkami aj
 * poznámky sa preto dajú písať značky, ktoré sa doplnia podľa dátumu
 * vystavenia v jazyku dokladu:
 *
 *   [MESIAC]          október
 *   [ROK]             2026
 *   [MESIAC_ROK]      október 2026
 *   [MINULY_MESIAC]   september 2026  (s rokom — v januári je to december minulého roka)
 *   [BUDUCI_MESIAC]   november 2026
 *
 * Veľkosť písmen v značke nerozhoduje; neznáme značky ostanú, ako sú.
 */

const LOKAL: Record<string, string> = {
  sk: "sk-SK",
  cs: "cs-CZ",
  en: "en-GB",
  de: "de-DE",
  hu: "hu-HU",
};

export const ZNACKY_OBDOBIA = [
  "[MESIAC]",
  "[ROK]",
  "[MESIAC_ROK]",
  "[MINULY_MESIAC]",
  "[BUDUCI_MESIAC]",
] as const;

function nazovMesiaca(rok: number, mesiac: number, jazyk: string): string {
  const d = new Date(Date.UTC(rok, mesiac - 1, 15));
  return new Intl.DateTimeFormat(LOKAL[jazyk] ?? LOKAL.sk, {
    month: "long",
    timeZone: "UTC",
  }).format(d);
}

function posun(rok: number, mesiac: number, o: number): [number, number] {
  const m = rok * 12 + (mesiac - 1) + o;
  return [Math.floor(m / 12), (m % 12) + 1];
}

/** Doplní značky obdobia podľa dátumu `RRRR-MM-DD` v jazyku dokladu. */
export function doplnObdobie<T extends string | null | undefined>(
  text: T,
  datum: string,
  jazyk: string | null | undefined = "sk",
): T {
  if (!text || !text.includes("[")) return text;
  const [r, m] = datum.split("-").map(Number);
  if (!r || !m) return text;
  const j = jazyk && LOKAL[jazyk] ? jazyk : "sk";
  const mesiacRok = (o: number) => {
    const [rr, mm] = posun(r, m, o);
    return `${nazovMesiaca(rr, mm, j)} ${rr}`;
  };
  const hodnoty: Record<string, string> = {
    MESIAC: nazovMesiaca(r, m, j),
    ROK: String(r),
    MESIAC_ROK: mesiacRok(0),
    MINULY_MESIAC: mesiacRok(-1),
    BUDUCI_MESIAC: mesiacRok(1),
  };
  return text.replace(/\[([A-Za-z_]+)\]/g, (cela, kluc: string) => {
    const v = hodnoty[kluc.toUpperCase()];
    return v ?? cela;
  }) as T;
}
