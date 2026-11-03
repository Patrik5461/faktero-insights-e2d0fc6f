/**
 * Viac hotovostných pokladní — čistá logika bez databázy.
 *
 * Pokladňa je riadok v `pokladne` (názov, mena, skratka pre Pohodu,
 * predvolená, archivovaná). Pokladničné doklady (`cash_entries`) aj doklady
 * platené hotovosťou nesú `pokladna_id`; riadok bez neho patrí predvolenej
 * (spúšťač v DB ho doplní, ale staršie dáta a appka ho mať nemusia).
 *
 * Meny sa nesčítavajú: „Všetky pokladne“ ukazuje súčty po menách.
 */
import {
  centy,
  pociatocnyStavMesiaca,
  priebehPokladne,
  stavPokladne,
  type PokladnicnyDoklad,
  type Riadok,
  type StavPokladne,
  type VydavkovyDoklad,
} from "./pokladna";

export type Pokladna = {
  id: string;
  nazov: string;
  mena: string;
  kod_pohoda?: string | null;
  predvolena: boolean;
  aktivna: boolean;
  poradie?: number | null;
};

/** Predvolená prvá, potom poradie a názov; archivované na koniec. */
export function zoradPokladne<T extends Pokladna>(pokladne: readonly T[]): T[] {
  return [...(pokladne ?? [])].sort((a, b) => {
    if (a.predvolena !== b.predvolena) return a.predvolena ? -1 : 1;
    if (a.aktivna !== b.aktivna) return a.aktivna ? -1 : 1;
    const p = (a.poradie ?? 0) - (b.poradie ?? 0);
    if (p) return p;
    return String(a.nazov).localeCompare(String(b.nazov), "sk");
  });
}

export function predvolenaPokladna<T extends Pokladna>(pokladne: readonly T[]): T | null {
  const zoradene = zoradPokladne(pokladne);
  return zoradene.find((p) => p.predvolena) ?? zoradene.find((p) => p.aktivna) ?? null;
}

/** Aktívne pokladne, z ktorých sa dá vyberať pri novom pohybe alebo doklade. */
export function aktivnePokladne<T extends Pokladna>(pokladne: readonly T[]): T[] {
  return zoradPokladne(pokladne).filter((p) => p.aktivna);
}

/**
 * Výber pokladne sa ukazuje len pri viac ako jednej aktívnej — firme
 * s jednou pokladňou sa formulár nemení.
 */
export function ukazatVyberPokladne(pokladne: readonly Pokladna[]): boolean {
  return aktivnePokladne(pokladne).length > 1;
}

/**
 * Pokladňa, ktorá sa vo formulári vyplní sama: doterajšia voľba, ak je to
 * stále aktívna pokladňa, inak predvolená. Prázdny reťazec = firma pokladňu
 * ešte nemá (založí ju databáza pri prvom doklade).
 */
export function pokladnaDoFormulara(pokladne: readonly Pokladna[], doterajsia?: string | null): string {
  const akt = aktivnePokladne(pokladne);
  if (doterajsia && (pokladne ?? []).some((p) => p.id === doterajsia)) return doterajsia;
  return predvolenaPokladna(akt)?.id ?? "";
}

/** Do ktorej pokladne riadok patrí — bez `pokladna_id` do predvolenej. */
export function pokladnaRiadku(r: { pokladna_id?: string | null }, predvolenaId: string): string {
  return String(r?.pokladna_id ?? "") || predvolenaId;
}

export type StavPokladneSMenou = StavPokladne & { mena: string };

export type PokladnaSoStavom = Pokladna & { stav: StavPokladneSMenou };

export type RiadokKnihy = Riadok & {
  pokladna_id: string;
  pokladna: string;
  mena: string;
};

export type SucetMeny = {
  mena: string;
  prijmy: number;
  vydavky: number;
  zostatok: number;
  pociatocny: number;
  zaporny: boolean;
};

export type KnihaPokladni = {
  pokladne: PokladnaSoStavom[];
  /** Vybraná pokladňa, alebo `null` = všetky. */
  vybrana: string | null;
  /** Najnovšie navrchu; zostatok riadku je zostatok jeho pokladne. */
  riadky: RiadokKnihy[];
  /** Súčty po menách vybraných pokladní (pri jednej pokladni jedna mena). */
  sucty: SucetMeny[];
};

/**
 * Pokladničná kniha po pokladniach. Priebeh (a s ním zostatok) sa počíta
 * pre každú pokladňu zvlášť z celej histórie, až potom sa oreže na mesiac
 * a na vybranú pokladňu. Pri „Všetky“ sa súčty sčítajú len v rámci meny.
 *
 * `domaca` je mena virtuálnej pokladne firmy, ktorá ešte nemá žiadnu
 * (pokladne = []) — vtedy sa kniha správa presne ako pred viacerými pokladňami.
 */
export function knihaPokladni(opts: {
  pokladne: readonly Pokladna[];
  doklady: readonly (PokladnicnyDoklad & { pokladna_id?: string | null })[];
  vydavky: readonly (VydavkovyDoklad & { pokladna_id?: string | null })[];
  vybrana?: string | null;
  mesiac?: string | null;
  domaca?: string;
}): KnihaPokladni {
  const domaca = opts.domaca || "EUR";
  const zoznam: Pokladna[] = opts.pokladne?.length
    ? zoradPokladne(opts.pokladne)
    : [{ id: "", nazov: "Pokladňa", mena: domaca, predvolena: true, aktivna: true }];
  const predvolenaId = predvolenaPokladna(zoznam)?.id ?? zoznam[0]!.id;
  const vybrana =
    opts.vybrana && zoznam.some((p) => p.id === opts.vybrana) ? opts.vybrana : null;

  // Riadok bez pokladne alebo s pokladňou, ktorú nevidíme, patrí predvolenej.
  const zname = new Set(zoznam.map((p) => p.id));
  const kam = (r: { pokladna_id?: string | null }) => {
    const id = pokladnaRiadku(r, predvolenaId);
    return zname.has(id) ? id : predvolenaId;
  };
  const dokladyPo = new Map<string, PokladnicnyDoklad[]>();
  const vydavkyPo = new Map<string, VydavkovyDoklad[]>();
  for (const d of opts.doklady ?? []) {
    const k = kam(d);
    dokladyPo.set(k, [...(dokladyPo.get(k) ?? []), d]);
  }
  for (const v of opts.vydavky ?? []) {
    const k = kam(v);
    vydavkyPo.set(k, [...(vydavkyPo.get(k) ?? []), v]);
  }

  const pokladne: PokladnaSoStavom[] = [];
  const riadky: RiadokKnihy[] = [];
  const sucty = new Map<string, SucetMeny>();

  for (const p of zoznam) {
    const d = dokladyPo.get(p.id) ?? [];
    const v = vydavkyPo.get(p.id) ?? [];
    const mena = String(p.mena || domaca).toUpperCase();
    const stav = { ...stavPokladne(d, v), mena };
    pokladne.push({ ...p, stav });
    if (vybrana && p.id !== vybrana) continue;
    // Archivovaná bez pohybov do „Všetky“ nič neprináša.
    const priebeh = priebehPokladne(d, v);
    const vMesiaci = opts.mesiac ? priebeh.filter((r) => r.datum.startsWith(opts.mesiac as string)) : priebeh;
    for (const r of vMesiaci) riadky.push({ ...r, pokladna_id: p.id, pokladna: p.nazov, mena });
    if (!p.aktivna && !priebeh.length && !vybrana) continue;
    const s = sucty.get(mena) ?? { mena, prijmy: 0, vydavky: 0, zostatok: 0, pociatocny: 0, zaporny: false };
    s.prijmy = centy(s.prijmy + stav.prijmy);
    s.vydavky = centy(s.vydavky + stav.vydavky);
    s.zostatok = centy(s.zostatok + stav.zostatok);
    s.pociatocny = centy(s.pociatocny + (opts.mesiac ? pociatocnyStavMesiaca(priebeh, opts.mesiac) : 0));
    s.zaporny = s.zaporny || stav.zaporny;
    sucty.set(mena, s);
  }

  // Najnovšie navrchu. V rámci dňa výdavky nad príjmami (opak priebehu).
  const poradieTypu = (t: string) => (t === "prijem" ? 0 : 1);
  riadky.sort((a, b) => {
    if (a.datum !== b.datum) return a.datum < b.datum ? 1 : -1;
    if (a.typ !== b.typ) return poradieTypu(b.typ) - poradieTypu(a.typ);
    return b.cislo.localeCompare(a.cislo);
  });

  const menaDomaca = (m: string) => (m === domaca ? 0 : 1);
  return {
    pokladne,
    vybrana,
    riadky,
    sucty: [...sucty.values()].sort((a, b) => menaDomaca(a.mena) - menaDomaca(b.mena) || a.mena.localeCompare(b.mena)),
  };
}

/** Skratky a meny pokladní pre export (Pohoda a ostatné programy). */
export type NastaveniaPokladni = {
  /** Skratka pre doklad bez pokladne (predvolená pokladňa, inak firma). */
  pokladna?: string | null;
  /** id pokladne → skratka v Pohode. */
  pokladneKody?: Record<string, string>;
  /** id pokladne → mena (sumy pohybov sú v nej). */
  pokladneMeny?: Record<string, string>;
};

function text(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * Z pokladní firmy a doterajšieho nastavenia (`companies.pohoda_pokladna`)
 * zloží nastavenia pre export. Skratka predvolenej pokladne má prednosť pred
 * firmou — mení sa v správe pokladní; firma ostáva poistkou, keď predvolená
 * skratku nemá.
 */
export function nastaveniaPokladni(
  pokladne: readonly Pokladna[] | null | undefined,
  skratkaFirmy?: string | null,
): NastaveniaPokladni {
  const kody: Record<string, string> = {};
  const meny: Record<string, string> = {};
  for (const p of pokladne ?? []) {
    if (text(p.kod_pohoda)) kody[p.id] = text(p.kod_pohoda);
    if (text(p.mena)) meny[p.id] = text(p.mena).toUpperCase();
  }
  const pred = predvolenaPokladna(pokladne ?? []);
  return {
    pokladna: (pred && kody[pred.id]) || text(skratkaFirmy) || null,
    pokladneKody: kody,
    pokladneMeny: meny,
  };
}

/**
 * Skratka pokladne v Pohode pre jeden doklad: ručne zvolená na doklade
 * (zaúčtovanie, pravidlo) → skratka pokladne dokladu → predvolená/firma.
 */
export function kodPokladneDokladu(
  d: { pohoda_pokladna?: string | null; pokladna_id?: string | null } | null | undefined,
  nast: NastaveniaPokladni | null | undefined,
): string {
  return (
    text(d?.pohoda_pokladna) ||
    (d?.pokladna_id ? text(nast?.pokladneKody?.[String(d.pokladna_id)]) : "") ||
    text(nast?.pokladna)
  );
}

/** Mena pokladne dokladu, alebo `null` keď ju nepoznáme (= domáca). */
export function menaPokladneDokladu(
  d: { pokladna_id?: string | null } | null | undefined,
  nast: NastaveniaPokladni | null | undefined,
): string | null {
  return d?.pokladna_id ? (nast?.pokladneMeny?.[String(d.pokladna_id)] ?? null) : null;
}
