/*
  Ten istý súbor nahratý znova (bajt po bajte rovnaký — SHA-256) do
  Nespracovaných tej istej firmy sa odmietne: „Tento doklad už vo Fakteri je“.

  Odtlačok nesie nespracovaný doklad (`nespracovane_doklady.subor_hash`) a po
  Vytvoriť ho preberie prijatá faktúra, bloček či iný doklad — preto sa dá
  ukázať aj doklad, ktorý z neho vznikol. Doklad v koši nahratie neblokuje
  (človek ho zmazal, možno omylom) — len sa to povie.

  Iný súbor s rovnakým číslom a dodávateľom rieši ďalej štítok „Duplicita?“.
*/

export type AgendaDuplicitySuboru = "nespracovany" | "prijata" | "blocek" | "ostatny";

export type DuplicitaSuboru = {
  agenda: AgendaDuplicitySuboru;
  id: string;
  cislo: string | null;
  partner: string | null;
  /** Kedy bol pôvodný súbor nahratý (ISO). */
  nahrane: string | null;
};

export type KandidatDuplicity = DuplicitaSuboru & {
  /** Doklad je v koši (prijatá faktúra so `deleted_at`, záznam v `kos_dokladov`). */
  vKosi?: boolean;
};

export type VysledokDuplicity = {
  duplicita: DuplicitaSuboru | null;
  /** Rovnaký súbor je len v koši — nahratie prejde, používateľovi sa to povie. */
  vKosi: boolean;
};

export const NAZVY_AGEND_DUPLICITY: Record<AgendaDuplicitySuboru, string> = {
  nespracovany: "Nespracované doklady",
  prijata: "Prijaté faktúry",
  blocek: "Bločky",
  ostatny: "Ostatné doklady",
};

const PORADIE: AgendaDuplicitySuboru[] = ["nespracovany", "prijata", "blocek", "ostatny"];

/**
 * Z nájdených dokladov s rovnakým odtlačkom vyberie ten, na ktorý sa ukáže.
 * Živý doklad má prednosť pred košom; medzi živými rozhoduje agenda
 * (nespracovaný je najčerstvejší krok) a potom najstarší.
 */
export function vyberDuplicitu(kandidati: KandidatDuplicity[]): VysledokDuplicity {
  const zive = kandidati.filter((k) => !k.vKosi);
  if (!zive.length) return { duplicita: null, vKosi: kandidati.length > 0 };
  const [prvy] = [...zive].sort(
    (a, b) =>
      PORADIE.indexOf(a.agenda) - PORADIE.indexOf(b.agenda) ||
      String(a.nahrane ?? "").localeCompare(String(b.nahrane ?? "")),
  );
  const { vKosi: _k, ...d } = prvy!;
  return { duplicita: d, vKosi: false };
}

/** Odkaz na detail existujúceho dokladu (web). */
export function odkazNaDuplicitu(d: Pick<DuplicitaSuboru, "agenda" | "id">): {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
} {
  switch (d.agenda) {
    case "nespracovany":
      return { to: "/nespracovane/$id", params: { id: d.id } };
    case "prijata":
      return { to: "/prijate-faktury/$id", params: { id: d.id } };
    case "blocek":
      return { to: "/doklady/novy", search: { id: d.id } };
    case "ostatny":
      return { to: "/ostatne-doklady/novy", search: { id: d.id } };
  }
}

/** „FA 2026001, Dodávateľ s.r.o.“ — prázdne časti vynechá. */
export function popisDuplicity(d: Pick<DuplicitaSuboru, "cislo" | "partner">): string {
  return [d.cislo, d.partner]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/** Veta pre denník mailov, API a hlášky bez odkazu (slovensky, ako ostatné poznámky). */
export function textDuplicity(d: DuplicitaSuboru): string {
  const popis = popisDuplicity(d);
  return `Tento doklad už vo Fakteri je — ${NAZVY_AGEND_DUPLICITY[d.agenda]}${popis ? `: ${popis}` : ""}`;
}

/** Chyba zo `zalozNespracovany`, keď rovnaký súbor už vo firme je. */
export class DuplicitnySuborChyba extends Error {
  readonly duplicita: DuplicitaSuboru;
  constructor(d: DuplicitaSuboru) {
    super(`${textDuplicity(d)}.`);
    this.name = "DuplicitnySuborChyba";
    this.duplicita = d;
  }
}

export function jeDuplicitnySubor(e: unknown): e is DuplicitnySuborChyba {
  return e instanceof DuplicitnySuborChyba;
}
