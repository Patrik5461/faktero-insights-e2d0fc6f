/**
 * Koľko stojí volanie modelu a ako sa z jednotlivých volaní poskladá prehľad.
 *
 * Zostatok kreditu ani Google, ani OpenAI cez rozhranie nedávajú — dá sa teda
 * ukázať len vlastná spotreba a z nej odhad ceny. Sadzby sú z verejných
 * cenníkov (USD za milión tokenov), takže keď sa cenník zmení, mení sa jedno
 * miesto a admin obrazovka to hneď ukáže.
 */

export type CenaModelu = {
  /** USD za milión vstupných tokenov. */
  vstup: number;
  /** USD za milión výstupných tokenov. */
  vystup: number;
};

export const CENNIK: Record<string, CenaModelu> = {
  "gemini-3.5-flash": { vstup: 0.3, vystup: 2.5 },
  "gemini-3.5-flash-lite": { vstup: 0.1, vystup: 0.4 },
  "gemini-3.5-pro": { vstup: 1.25, vystup: 10 },
  "gemini-2.5-flash": { vstup: 0.3, vystup: 2.5 },
  "gpt-4o": { vstup: 2.5, vystup: 10 },
  "gpt-4o-mini": { vstup: 0.15, vystup: 0.6 },
  "gpt-4.1": { vstup: 2, vystup: 8 },
  "gpt-4.1-mini": { vstup: 0.4, vystup: 1.6 },
};

/** Keď model v cenníku nie je (prepne sa cez premennú prostredia), berie sa stred. */
export const NEZNAMY_MODEL: CenaModelu = { vstup: 1, vystup: 4 };

export function cennikPre(model: string): CenaModelu {
  return CENNIK[model] ?? NEZNAMY_MODEL;
}

export function cenaVolania(model: string, vstup: number, vystup: number): number {
  const c = cennikPre(model);
  return (vstup * c.vstup + vystup * c.vystup) / 1_000_000;
}

export type SuhrnRiadok = {
  den: string;
  poskytovatel: string;
  model: string;
  ucel: string;
  ok: boolean;
  volani: number;
  vstup: number;
  vystup: number;
  trvanie: number;
};

export type Spolu = {
  volani: number;
  chyby: number;
  vstup: number;
  vystup: number;
  cena: number;
  trvanie: number;
};

function prazdne(): Spolu {
  return { volani: 0, chyby: 0, vstup: 0, vystup: 0, cena: 0, trvanie: 0 };
}

function pripocitaj(s: Spolu, r: SuhrnRiadok): Spolu {
  s.volani += r.volani;
  if (!r.ok) s.chyby += r.volani;
  s.vstup += r.vstup;
  s.vystup += r.vystup;
  s.trvanie += r.trvanie;
  s.cena += cenaVolania(r.model, r.vstup, r.vystup);
  return s;
}

export function spocitaj(riadky: SuhrnRiadok[]): Spolu {
  return riadky.reduce(pripocitaj, prazdne());
}

/** Riadky od zadaného dňa (vrátane), deň je vo formáte `YYYY-MM-DD`. */
export function odDna(riadky: SuhrnRiadok[], den: string): SuhrnRiadok[] {
  return riadky.filter((r) => r.den >= den);
}

export type Skupina = Spolu & { kluc: string };

/** Zoskupenie podľa ľubovoľného kľúča, najdrahšie hore. */
export function podla(riadky: SuhrnRiadok[], kluc: (r: SuhrnRiadok) => string): Skupina[] {
  const mapa = new Map<string, Spolu>();
  for (const r of riadky) {
    const k = kluc(r);
    mapa.set(k, pripocitaj(mapa.get(k) ?? prazdne(), r));
  }
  return [...mapa.entries()]
    .map(([k, s]) => ({ kluc: k, ...s }))
    .sort((a, b) => b.cena - a.cena || b.volani - a.volani);
}

/**
 * Posledných `dni` dní vrátane dneška, aj tie prázdne — inak by graf dni bez
 * volania preskočil a vyzeralo by to, že sa chodí každý deň rovnako.
 */
export function poDnoch(riadky: SuhrnRiadok[], dni: number, dnes: Date = new Date()): Skupina[] {
  const podlaDna = new Map(podla(riadky, (r) => r.den).map((s) => [s.kluc, s]));
  const von: Skupina[] = [];
  for (let i = dni - 1; i >= 0; i--) {
    const d = new Date(dnes);
    d.setDate(d.getDate() - i);
    const den = denNaText(d);
    von.push(podlaDna.get(den) ?? { kluc: den, ...prazdne() });
  }
  return von;
}

export function denNaText(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Deň spred `dni` dní — hranica pre „posledných 7 dní“. */
export function denPred(dni: number, dnes: Date = new Date()): string {
  const d = new Date(dnes);
  d.setDate(d.getDate() - dni + 1);
  return denNaText(d);
}

export const NAZOV_POSKYTOVATELA: Record<string, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
};

export const NAZOV_UCELU: Record<string, string> = {
  blocek: "Bločky (pokladňa)",
  "doklad-z-posty": "Doklady z e-mailu",
  "dodaci-list": "Dodacie listy",
  financovanie: "Leasingy a úvery",
  "ostatny-doklad": "Ostatné doklady",
  "bankovy-vypis": "Bankové výpisy",
  "import-dokladov": "Import dokladov",
  asistent: "AI asistent",
  "faktura-z-textu": "Faktúra z textu",
  podpora: "Podpora na webe",
  neznáme: "Neurčené",
};

export function nazovUcelu(ucel: string): string {
  return NAZOV_UCELU[ucel] ?? ucel;
}
