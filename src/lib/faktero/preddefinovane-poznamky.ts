/*
  Preddefinované poznámky — číselník textov firmy (tabuľka
  `preddefinovane_poznamky`). Poznámka môže platiť len pre niektoré agendy;
  prázdny zoznam agend = všade.
*/

export const AGENDY_POZNAMOK = ["faktura", "prijata_faktura", "blocek", "nespracovane"] as const;
export type AgendaPoznamky = (typeof AGENDY_POZNAMOK)[number];

/** Názvy agend (slovensky; na obrazovke cez `t()`). */
export const NAZVY_AGEND_POZNAMOK: Record<AgendaPoznamky, string> = {
  faktura: "Vystavené faktúry",
  prijata_faktura: "Prijaté faktúry",
  blocek: "Bločky",
  nespracovane: "Nespracované doklady",
};

export type PreddefinovanaPoznamka = {
  id: string;
  nazov: string;
  text: string;
  agendy: string[];
  poradie: number;
};

/** Platí poznámka pre agendu? Bez agendy (všade) áno. */
export function platiPreAgendu(
  p: { agendy?: string[] | null },
  agenda: AgendaPoznamky | null | undefined,
): boolean {
  if (!agenda) return true;
  const a = p.agendy ?? [];
  return a.length === 0 || a.includes(agenda);
}

/** Poznámky pre agendu v poradí číselníka (poradie, potom názov). */
export function poznamkyPreAgendu<T extends PreddefinovanaPoznamka>(
  zoznam: T[],
  agenda: AgendaPoznamky | null | undefined,
): T[] {
  return zoznam
    .filter((p) => platiPreAgendu(p, agenda))
    .sort(
      (a, b) => a.poradie - b.poradie || (a.nazov || a.text).localeCompare(b.nazov || b.text, "sk"),
    );
}

/** Popis v rozbaľovači — názov, inak začiatok textu. */
export function popisPoznamky(p: { nazov?: string | null; text: string }, dlzka = 70): string {
  const n = (p.nazov ?? "").trim();
  if (n) return n;
  const t = p.text.replace(/\s+/g, " ").trim();
  return t.length > dlzka ? `${t.slice(0, dlzka).trimEnd()}…` : t;
}

/**
 * Vloženie textu do poznámky — na nový riadok za to, čo tam už je. Rovnaký
 * text sa druhýkrát nepridá (dvojklik v rozbaľovači).
 */
export function vlozDoPoznamky(povodna: string | null | undefined, text: string): string {
  const p = (povodna ?? "").replace(/\s+$/, "");
  const novy = text.trim();
  if (!novy) return p;
  if (!p) return novy;
  if (p.split("\n").some((r) => r.trim() === novy) || p.includes(novy)) return p;
  return `${p}\n${novy}`;
}

/** Agendy z formulára — len známe, bez duplicít; všetky zaškrtnuté = všade (prázdne). */
export function upravAgendy(v: unknown): AgendaPoznamky[] {
  if (!Array.isArray(v)) return [];
  const out = AGENDY_POZNAMOK.filter((a) => v.includes(a));
  return out.length === AGENDY_POZNAMOK.length ? [] : out;
}
