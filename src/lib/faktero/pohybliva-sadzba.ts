/**
 * Pohyblivá úroková sadzba — čistá časť (bez databázy a siete).
 *
 * Pohyblivá sadzba = **referenčný index** (1M EURIBOR, 3M PRIBOR, €STR…)
 * určený k dňu fixingu, prípadne zdola obmedzený (floor), **plus pevná marža**.
 * Index sa mení raz za obdobie fixácie (mesačne, štvrťročne…) a v rámci neho
 * platí jedna sadzba.
 *
 * Pasca je zdroj indexu. Denný EURIBOR publikuje EMMI a strojovo ho bez
 * licencie na komerčné použitie brať nesmieme. Zadarmo je len **mesačný
 * priemer** z ECB. Pri fixingu „dva pracovné dni pred začiatkom obdobia" je
 * preto výsledok **odhad** — skutočný úrok určuje banka. Odhad sa dá za každé
 * obdobie prepísať ručne (keď banka sadzbu oznámi, alebo keď z výpisu vyjde
 * skutočný úrok). €STR (ECB) a PRIBOR (ČNB) sú denné a zadarmo, tam je
 * výpočet presný až na oneskorenie zverejnenia.
 *
 * Úrok sa počíta deň po dni z čerpania na konci dňa — tak to robia banky pri
 * kontokorente. Keď sa v jednom úrokovom období zmení sadzba (štvrťročné
 * strhávanie, mesačný fixing), obdobie sa rozdelí na úseky.
 */
import { dniMedzi, zaokruhli } from "./financovanie";

/* ------------------------------------------------------------------ *
 * Číselníky
 * ------------------------------------------------------------------ */

export type TypSadzby = "pevna" | "pohybliva";

export type ReferencnyIndex =
  | "EURIBOR_1M"
  | "EURIBOR_3M"
  | "EURIBOR_6M"
  | "EURIBOR_12M"
  | "ESTR"
  | "PRIBOR_1M"
  | "PRIBOR_3M"
  | "PRIBOR_6M"
  | "PRIBOR_1R";

/**
 * `denny` = zdroj dáva každý pracovný deň, `mesacny` = len mesačný priemer
 * (fixing k presnému dňu je potom odhad).
 */
export const REFERENCNE_INDEXY: {
  kluc: ReferencnyIndex;
  nazov: string;
  mena: "EUR" | "CZK";
  zdroj: "ECB" | "ČNB";
  frekvenciaZdroja: "denny" | "mesacny";
}[] = [
  {
    kluc: "EURIBOR_1M",
    nazov: "1M EURIBOR",
    mena: "EUR",
    zdroj: "ECB",
    frekvenciaZdroja: "mesacny",
  },
  {
    kluc: "EURIBOR_3M",
    nazov: "3M EURIBOR",
    mena: "EUR",
    zdroj: "ECB",
    frekvenciaZdroja: "mesacny",
  },
  {
    kluc: "EURIBOR_6M",
    nazov: "6M EURIBOR",
    mena: "EUR",
    zdroj: "ECB",
    frekvenciaZdroja: "mesacny",
  },
  {
    kluc: "EURIBOR_12M",
    nazov: "12M EURIBOR",
    mena: "EUR",
    zdroj: "ECB",
    frekvenciaZdroja: "mesacny",
  },
  { kluc: "ESTR", nazov: "€STR", mena: "EUR", zdroj: "ECB", frekvenciaZdroja: "denny" },
  { kluc: "PRIBOR_1M", nazov: "1M PRIBOR", mena: "CZK", zdroj: "ČNB", frekvenciaZdroja: "denny" },
  { kluc: "PRIBOR_3M", nazov: "3M PRIBOR", mena: "CZK", zdroj: "ČNB", frekvenciaZdroja: "denny" },
  { kluc: "PRIBOR_6M", nazov: "6M PRIBOR", mena: "CZK", zdroj: "ČNB", frekvenciaZdroja: "denny" },
  { kluc: "PRIBOR_1R", nazov: "1R PRIBOR", mena: "CZK", zdroj: "ČNB", frekvenciaZdroja: "denny" },
];

export function nazovIndexu(kluc: string | null | undefined): string {
  return REFERENCNE_INDEXY.find((i) => i.kluc === kluc)?.nazov ?? String(kluc ?? "");
}

export function jeIndex(v: unknown): v is ReferencnyIndex {
  return REFERENCNE_INDEXY.some((i) => i.kluc === v);
}

/**
 * Ku ktorému dňu sa index berie.
 * - `pred_zaciatkom_obdobia` — N pracovných dní pred začiatkom obdobia
 *   fixácie (EURIBOR zmluvy: „dva pracovné dni pred začiatkom obdobia").
 * - `mesacny_priemer` — priemer indexu za kalendárny mesiac pred začiatkom
 *   obdobia (niektoré banky to tak píšu do zmluvy).
 */
export type PravidloFixingu = "pred_zaciatkom_obdobia" | "mesacny_priemer";

export const PRAVIDLA_FIXINGU: { kluc: PravidloFixingu; nazov: string }[] = [
  { kluc: "pred_zaciatkom_obdobia", nazov: "pracovné dni pred začiatkom obdobia" },
  { kluc: "mesacny_priemer", nazov: "priemer za predchádzajúci mesiac" },
];

export type FrekvenciaZmeny = "mesacne" | "stvrtrocne" | "polrocne" | "rocne";

export const FREKVENCIE_ZMENY: { kluc: FrekvenciaZmeny; nazov: string; mesiacov: number }[] = [
  { kluc: "mesacne", nazov: "mesačne", mesiacov: 1 },
  { kluc: "stvrtrocne", nazov: "štvrťročne", mesiacov: 3 },
  { kluc: "polrocne", nazov: "polročne", mesiacov: 6 },
  { kluc: "rocne", nazov: "ročne", mesiacov: 12 },
];

export type KonvenciaDni = "ACT/365" | "ACT/360" | "30E/360";

/** Nastavenie sadzby tak, ako leží na zmluve (`financing_contracts`). */
export type NastavenieSadzby = {
  rate_type?: string | null;
  /** Pri pevnej celková sadzba. Pri pohyblivej posledná známa celková. */
  interest_rate?: number | string | null;
  reference_index?: string | null;
  rate_margin?: number | string | null;
  index_floor?: number | string | null;
  fixing_rule?: string | null;
  fixing_offset_days?: number | string | null;
  rate_reset?: string | null;
  day_count?: string | null;
};

/** Hodnota indexu z tabuľky `referencne_sadzby`. */
export type ReferencnaSadzba = {
  index: string;
  druh: "denna" | "mesacny_priemer";
  /** Pri mesačnom priemere prvý deň mesiaca. */
  datum: string;
  hodnota: number;
};

/** Ručne zadaná sadzba za obdobie (`financing_rate_periods`). */
export type RucnaSadzba = {
  period_start: string;
  rate: number;
  source?: string | null;
  note?: string | null;
};

function cislo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Sadzby sa držia na štyri desatinné miesta — 1,9607619 + 4,3 = 6,2608. */
export function zaokruhliSadzbu(n: number): number {
  return Math.round((n + Number.EPSILON) * 10_000) / 10_000;
}

export function jePohybliva(n: NastavenieSadzby | null | undefined): boolean {
  return n?.rate_type === "pohybliva";
}

/* ------------------------------------------------------------------ *
 * Dátumy a pracovné dni
 * ------------------------------------------------------------------ */

export function pridajDni(d: string, n: number): string {
  const t = Date.parse(`${d}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Prvý deň mesiaca o `n` mesiacov ďalej. */
export function pridajMesiace(d: string, n: number): string {
  const [r, m] = d.split("-").map(Number);
  const cielovy = m - 1 + n;
  const rok = r + Math.floor(cielovy / 12);
  const mesiac = ((cielovy % 12) + 12) % 12;
  return `${rok}-${String(mesiac + 1).padStart(2, "0")}-01`;
}

function dniVMesiaci(d: string): number {
  const [r, m] = d.split("-").map(Number);
  return new Date(Date.UTC(r, m, 0)).getUTCDate();
}

/** Veľká noc (gregoriánsky výpočet) — kvôli Veľkému piatku a pondelku. */
function velkaNoc(rok: number): string {
  const a = rok % 19;
  const b = Math.floor(rok / 100);
  const c = rok % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mesiac = Math.floor((h + l - 7 * m + 114) / 31);
  const den = ((h + l - 7 * m + 114) % 31) + 1;
  return `${rok}-${String(mesiac).padStart(2, "0")}-${String(den).padStart(2, "0")}`;
}

/**
 * Sviatky kalendára TARGET2, podľa ktorého sa fixuje EURIBOR aj €STR:
 * 1. 1., Veľký piatok, Veľkonočný pondelok, 1. 5., 25. a 26. 12.
 */
export function jeSviatokTarget(d: string): boolean {
  const md = d.slice(5);
  if (md === "01-01" || md === "05-01" || md === "12-25" || md === "12-26") return true;
  const vn = velkaNoc(Number(d.slice(0, 4)));
  return d === pridajDni(vn, -2) || d === pridajDni(vn, 1);
}

export function jePracovnyDen(d: string): boolean {
  const den = new Date(`${d}T00:00:00Z`).getUTCDay();
  return den !== 0 && den !== 6 && !jeSviatokTarget(d);
}

/** N-tý pracovný deň pred dátumom (N = 0 vráti dátum samotný). */
export function pracovnyDenPred(d: string, n: number): string {
  let x = d;
  let k = 0;
  while (k < Math.max(0, Math.floor(n))) {
    x = pridajDni(x, -1);
    if (jePracovnyDen(x)) k++;
  }
  return x;
}

/* ------------------------------------------------------------------ *
 * Obdobia fixácie
 * ------------------------------------------------------------------ */

function mesiacovFrekvencie(f: string | null | undefined): number {
  return FREKVENCIE_ZMENY.find((x) => x.kluc === f)?.mesiacov ?? 1;
}

/** Začiatok obdobia (mesiac, štvrťrok, polrok, rok), do ktorého deň patrí. */
export function zaciatokObdobia(d: string, frekvencia: string | null | undefined): string {
  const krok = mesiacovFrekvencie(frekvencia);
  const r = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  const prvy = m - ((m - 1) % krok);
  return `${r}-${String(prvy).padStart(2, "0")}-01`;
}

/** Prvý deň nasledujúceho obdobia. */
export function dalsiZaciatok(zaciatok: string, frekvencia: string | null | undefined): string {
  return pridajMesiace(zaciatok, mesiacovFrekvencie(frekvencia));
}

/** Deň fixingu pre obdobie začínajúce dňom `zaciatok`. */
export function datumFixingu(
  zaciatok: string,
  pravidlo: string | null | undefined,
  posun: number | string | null | undefined,
): string {
  if (pravidlo === "mesacny_priemer") return pridajDni(zaciatok.slice(0, 8) + "01", -1);
  return pracovnyDenPred(zaciatok, cislo(posun) ?? 2);
}

/* ------------------------------------------------------------------ *
 * Hodnota indexu k fixingu
 * ------------------------------------------------------------------ */

export type HodnotaIndexu = {
  hodnota: number;
  /** Deň, ku ktorému hodnota je (pri mesačnom priemere prvý deň mesiaca). */
  k: string;
  druh: "denna" | "mesacny_priemer";
  /** Mesačný priemer namiesto hodnoty k dňu fixingu — len aproximácia. */
  odhad: boolean;
  /** Hodnota k fixingu ešte nie je zverejnená, použitá je posledná známa. */
  predbezna: boolean;
};

type PripravenyIndex = { denne: ReferencnaSadzba[]; mesacne: Map<string, number> };

function priprav(index: string, sadzby: ReferencnaSadzba[]): PripravenyIndex {
  const denne = sadzby
    .filter((s) => s.index === index && s.druh === "denna")
    .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  const mesacne = new Map<string, number>();
  for (const s of sadzby) {
    if (s.index === index && s.druh === "mesacny_priemer")
      mesacne.set(s.datum.slice(0, 7), s.hodnota);
  }
  return { denne, mesacne };
}

function poslednyMesiacDo(mesacne: Map<string, number>, kluc: string): string | null {
  let naj: string | null = null;
  for (const k of mesacne.keys()) if (k <= kluc && (!naj || k > naj)) naj = k;
  return naj;
}

function poslednaDennaDo(denne: ReferencnaSadzba[], d: string): ReferencnaSadzba | null {
  let najdena: ReferencnaSadzba | null = null;
  for (const s of denne) {
    if (s.datum <= d) najdena = s;
    else break;
  }
  return najdena;
}

export function hodnotaIndexu(
  index: string,
  zaciatok: string,
  pravidlo: string | null | undefined,
  posun: number | string | null | undefined,
  sadzby: ReferencnaSadzba[] | PripravenyIndex,
): HodnotaIndexu | null {
  const p = Array.isArray(sadzby) ? priprav(index, sadzby) : sadzby;

  if (pravidlo === "mesacny_priemer") {
    const kluc = pridajMesiace(zaciatok.slice(0, 8) + "01", -1).slice(0, 7);
    const m = p.mesacne.get(kluc);
    if (m !== undefined) {
      return {
        hodnota: m,
        k: `${kluc}-01`,
        druh: "mesacny_priemer",
        odhad: false,
        predbezna: false,
      };
    }
    // Priemer z denných hodnôt, keď mesiac už skončil a denné sú.
    const vMesiaci = p.denne.filter((s) => s.datum.startsWith(kluc));
    if (vMesiaci.length > 0 && zaciatok > `${kluc}-28`) {
      const priemer = vMesiaci.reduce((s, x) => s + x.hodnota, 0) / vMesiaci.length;
      const posledna = vMesiaci[vMesiaci.length - 1]!;
      return {
        hodnota: zaokruhliSadzbu(priemer),
        k: `${kluc}-01`,
        druh: "mesacny_priemer",
        odhad: false,
        // Mesiac nemusí byť ešte celý zverejnený (ČNB publikuje s oneskorením).
        predbezna: dniMedzi(posledna.datum, pridajDni(zaciatok, -1)) > 4,
      };
    }
    const starsi = poslednyMesiacDo(p.mesacne, kluc);
    if (starsi) {
      return {
        hodnota: p.mesacne.get(starsi)!,
        k: `${starsi}-01`,
        druh: "mesacny_priemer",
        odhad: false,
        predbezna: true,
      };
    }
    const d = poslednaDennaDo(p.denne, `${kluc}-31`);
    return d
      ? { hodnota: d.hodnota, k: d.datum, druh: "denna", odhad: true, predbezna: true }
      : null;
  }

  const fix = datumFixingu(zaciatok, pravidlo, posun);
  if (p.denne.length > 0) {
    const d = poslednaDennaDo(p.denne, fix);
    if (d) {
      return {
        hodnota: d.hodnota,
        k: d.datum,
        druh: "denna",
        odhad: false,
        // Víkend a sviatky sú v poriadku; viac než pár dní znamená, že hodnota
        // k fixingu ešte nie je zverejnená.
        predbezna: dniMedzi(d.datum, fix) > 4,
      };
    }
  }
  const kluc = fix.slice(0, 7);
  const m = p.mesacne.get(kluc);
  if (m !== undefined) {
    return { hodnota: m, k: `${kluc}-01`, druh: "mesacny_priemer", odhad: true, predbezna: false };
  }
  const starsi = poslednyMesiacDo(p.mesacne, kluc);
  if (starsi) {
    return {
      hodnota: p.mesacne.get(starsi)!,
      k: `${starsi}-01`,
      druh: "mesacny_priemer",
      odhad: true,
      predbezna: true,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Sadzba za obdobie
 * ------------------------------------------------------------------ */

export type SadzbaObdobia = {
  /** Obdobie fixácie — od (vrátane) do (vrátane). */
  od: string;
  do: string;
  zdroj: "pevna" | "vypocet" | "rucne";
  /** Celková ročná sadzba v %. Null = index nie je známy vôbec. */
  sadzba: number | null;
  fixing: string | null;
  index: string | null;
  indexHodnota: number | null;
  indexK: string | null;
  indexDruh: "denna" | "mesacny_priemer" | null;
  /** Index bol pod dolnou hranicou a použila sa hranica. */
  floorPouzity: boolean;
  marza: number | null;
  odhad: boolean;
  predbezna: boolean;
  poznamka: string | null;
};

export function sadzbaObdobia(
  nast: NastavenieSadzby,
  zaciatok: string,
  sadzby: ReferencnaSadzba[] | PripravenyIndex,
  rucne: RucnaSadzba[] = [],
): SadzbaObdobia {
  const pohybliva = jePohybliva(nast);
  const frekv = pohybliva ? nast.rate_reset : "mesacne";
  const koniec = pridajDni(dalsiZaciatok(zaciatok, frekv), -1);
  const zaklad: SadzbaObdobia = {
    od: zaciatok,
    do: koniec,
    zdroj: "pevna",
    sadzba: null,
    fixing: null,
    index: null,
    indexHodnota: null,
    indexK: null,
    indexDruh: null,
    floorPouzity: false,
    marza: null,
    odhad: false,
    predbezna: false,
    poznamka: null,
  };

  const rucna = rucne.find((r) => r.period_start === zaciatok);
  if (!pohybliva) {
    if (rucna)
      return {
        ...zaklad,
        zdroj: "rucne",
        sadzba: Number(rucna.rate),
        poznamka: rucna.note ?? null,
      };
    return { ...zaklad, sadzba: cislo(nast.interest_rate) ?? 0 };
  }

  const index = String(nast.reference_index ?? "");
  const marza = cislo(nast.rate_margin) ?? 0;
  const fixing = datumFixingu(zaciatok, nast.fixing_rule, nast.fixing_offset_days);
  const h = index
    ? hodnotaIndexu(index, zaciatok, nast.fixing_rule, nast.fixing_offset_days, sadzby)
    : null;
  const floor = cislo(nast.index_floor);
  const vypocet: SadzbaObdobia = {
    ...zaklad,
    zdroj: "vypocet",
    fixing,
    index,
    marza,
    indexHodnota: h?.hodnota ?? null,
    indexK: h?.k ?? null,
    indexDruh: h?.druh ?? null,
    floorPouzity: !!h && floor !== null && h.hodnota < floor,
    sadzba: h ? zaokruhliSadzbu(Math.max(h.hodnota, floor ?? -Infinity) + marza) : null,
    odhad: h?.odhad ?? false,
    predbezna: h?.predbezna ?? false,
  };
  if (rucna) {
    // Ručná sadzba prebíja výpočet; výpočet ostáva vedľa na porovnanie.
    return {
      ...vypocet,
      zdroj: "rucne",
      sadzba: Number(rucna.rate),
      odhad: false,
      predbezna: false,
      poznamka: rucna.note ?? null,
    };
  }
  return vypocet;
}

/** Obdobia fixácie, ktoré pokrývajú interval [od, do]. */
export function historiaSadzby(
  nast: NastavenieSadzby,
  od: string,
  do_: string,
  sadzby: ReferencnaSadzba[],
  rucne: RucnaSadzba[] = [],
): SadzbaObdobia[] {
  const frekv = jePohybliva(nast) ? nast.rate_reset : "mesacne";
  const p = priprav(String(nast.reference_index ?? ""), sadzby);
  const vysledok: SadzbaObdobia[] = [];
  for (let z = zaciatokObdobia(od, frekv); z <= do_; z = dalsiZaciatok(z, frekv)) {
    vysledok.push(sadzbaObdobia(nast, z, p, rucne));
    if (vysledok.length > 600) break;
  }
  return vysledok;
}

/** Sadzba platná v daný deň. */
export function sadzbaKDnu(
  nast: NastavenieSadzby,
  den: string,
  sadzby: ReferencnaSadzba[],
  rucne: RucnaSadzba[] = [],
): SadzbaObdobia {
  const frekv = jePohybliva(nast) ? nast.rate_reset : "mesacne";
  return sadzbaObdobia(
    nast,
    zaciatokObdobia(den, frekv),
    priprav(String(nast.reference_index ?? ""), sadzby),
    rucne,
  );
}

/* ------------------------------------------------------------------ *
 * Úrok
 * ------------------------------------------------------------------ */

/** Podiel roka, ktorý pripadá na jeden deň. */
export function podielDna(den: string, konvencia: string | null | undefined): number {
  if (konvencia === "ACT/360") return 1 / 360;
  if (konvencia === "30E/360") return 30 / dniVMesiaci(den) / 360;
  return 1 / 365;
}

/** Úrok z istiny za počet dní — na rýchle výpočty a testy. */
export function urokZaDni(
  istina: number,
  sadzba: number,
  dni: number,
  konvencia: string | null | undefined,
): number {
  const zaklad = konvencia === "ACT/360" || konvencia === "30E/360" ? 360 : 365;
  return zaokruhli((istina * sadzba * dni) / (100 * zaklad));
}

export type UsekUroku = {
  od: string;
  do: string;
  dni: number;
  sadzba: number | null;
  zdroj: SadzbaObdobia["zdroj"];
  urok: number;
};

export type RiadokOdhadu = {
  /** Úrokové obdobie (strhávanie) — od a do vrátane, orezané na počítaný úsek. */
  od: string;
  do: string;
  /** Posledný deň celého obdobia — vtedy banka úrok strhne. */
  koniecObdobia: string;
  dni: number;
  priemerneCerpanie: number;
  maxCerpanie: number;
  urok: number;
  useky: UsekUroku[];
  /** Obdobie ešte neskončilo, alebo index k fixingu nie je zverejnený. */
  predbezny: boolean;
  /** Index je mesačný priemer namiesto hodnoty k dňu fixingu. */
  odhad: boolean;
  /** Pre niektoré dni chýba sadzba — úrok za ne nie je započítaný. */
  bezSadzby: boolean;
  rucnaSadzba: boolean;
};

/**
 * Zostatok účtu na konci dňa z dnešného zostatku a pohybov: všetko, čo prišlo
 * po tom dni, sa odpočíta. Funguje, len keď sú pohyby od toho dňa úplné.
 */
export function zostatkyPoDnoch(
  zostatokTeraz: number,
  pohyby: { booking_date: string; amount: number | string }[],
): (den: string) => number {
  const sucty = new Map<string, number>();
  for (const p of pohyby) {
    const d = String(p.booking_date).slice(0, 10);
    sucty.set(d, (sucty.get(d) ?? 0) + (Number(p.amount) || 0));
  }
  const dni = [...sucty.keys()].sort();
  // po[i] = súčet pohybov v dňoch dni[i..]
  const po = new Array<number>(dni.length + 1).fill(0);
  for (let i = dni.length - 1; i >= 0; i--) po[i] = po[i + 1]! + sucty.get(dni[i]!)!;
  return (den: string) => {
    let lo = 0;
    let hi = dni.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (dni[mid]! <= den) lo = mid + 1;
      else hi = mid;
    }
    return zaokruhli(zostatokTeraz - po[lo]!);
  };
}

/**
 * Vypočítaný úrok z kontokorentu po úrokových obdobiach.
 *
 * `cerpanie(den)` vracia vyčerpanú sumu na konci dňa (kladné číslo). Úrok za
 * deň = čerpanie × sadzba platná v ten deň × podiel dňa podľa konvencie;
 * zaokrúhľuje sa až súčet za obdobie, ako to robí banka.
 */
export function odhadUrokov(p: {
  nast: NastavenieSadzby;
  obdobieUrocenia: string | null | undefined;
  od: string;
  do: string;
  cerpanie: (den: string) => number;
  sadzby: ReferencnaSadzba[];
  rucne?: RucnaSadzba[];
  dnes?: string;
}): RiadokOdhadu[] {
  const frekvUrocenia = p.obdobieUrocenia === "stvrtrocne" ? "stvrtrocne" : "mesacne";
  const frekvSadzby = jePohybliva(p.nast) ? p.nast.rate_reset : "mesacne";
  const pripraveny = priprav(String(p.nast.reference_index ?? ""), p.sadzby);
  const cache = new Map<string, SadzbaObdobia>();
  const sadzbaDna = (den: string) => {
    const z = zaciatokObdobia(den, frekvSadzby);
    let s = cache.get(z);
    if (!s) {
      s = sadzbaObdobia(p.nast, z, pripraveny, p.rucne ?? []);
      cache.set(z, s);
    }
    return s;
  };
  const dnes = p.dnes ?? new Date().toISOString().slice(0, 10);

  const riadky: RiadokOdhadu[] = [];
  for (
    let zac = zaciatokObdobia(p.od, frekvUrocenia);
    zac <= p.do;
    zac = dalsiZaciatok(zac, frekvUrocenia)
  ) {
    const koniec = pridajDni(dalsiZaciatok(zac, frekvUrocenia), -1);
    const od = zac < p.od ? p.od : zac;
    const do_ = koniec > p.do ? p.do : koniec;
    let surovy = 0;
    let sumaCerpania = 0;
    let maxCerpanie = 0;
    let dni = 0;
    let predbezny = do_ < koniec || koniec >= dnes;
    let odhad = false;
    let bezSadzby = false;
    let rucna = false;
    const useky: (UsekUroku & { surovy: number })[] = [];
    for (let d = od; d <= do_; d = pridajDni(d, 1)) {
      const s = sadzbaDna(d);
      const c = Math.max(0, p.cerpanie(d));
      dni++;
      sumaCerpania += c;
      maxCerpanie = Math.max(maxCerpanie, c);
      if (s.predbezna) predbezny = true;
      if (s.odhad) odhad = true;
      if (s.zdroj === "rucne") rucna = true;
      const denny = s.sadzba === null ? 0 : (c * s.sadzba * podielDna(d, p.nast.day_count)) / 100;
      if (s.sadzba === null) bezSadzby = true;
      surovy += denny;
      const posledny = useky[useky.length - 1];
      if (posledny && posledny.sadzba === s.sadzba && posledny.zdroj === s.zdroj) {
        posledny.do = d;
        posledny.dni++;
        posledny.surovy += denny;
      } else {
        useky.push({
          od: d,
          do: d,
          dni: 1,
          sadzba: s.sadzba,
          zdroj: s.zdroj,
          urok: 0,
          surovy: denny,
        });
      }
    }
    riadky.push({
      od,
      do: do_,
      koniecObdobia: koniec,
      dni,
      priemerneCerpanie: dni ? zaokruhli(sumaCerpania / dni) : 0,
      maxCerpanie: zaokruhli(maxCerpanie),
      urok: zaokruhli(surovy),
      useky: useky.map(({ surovy: s, ...u }) => ({ ...u, urok: zaokruhli(s) })),
      predbezny,
      odhad,
      bezSadzby,
      rucnaSadzba: rucna,
    });
  }
  return riadky;
}

/* ------------------------------------------------------------------ *
 * Porovnanie so skutočnosťou
 * ------------------------------------------------------------------ */

export type RiadokPorovnania = RiadokOdhadu & {
  /** Úrok, ktorý banka za obdobie naozaj strhla (z výpisu). Null = nič. */
  skutocny: number | null;
  /** Skutočný mínus vypočítaný. */
  rozdiel: number | null;
};

/**
 * Úroky strhnuté bankou sa priradia k obdobiu, ktorého koniec je k dátumu
 * strhnutia najbližšie — banka úrok za mesiac strhne posledný deň mesiaca
 * alebo v prvých dňoch nasledujúceho. Ďalej než 5 dní pred a 15 dní po konci
 * obdobia sa nepriraďuje nič.
 */
export function porovnajSoSkutocnymi(
  riadky: RiadokOdhadu[],
  uroky: { charged_on: string; amount: number | string }[],
): RiadokPorovnania[] {
  const sucty = new Map<number, number>();
  for (const u of uroky) {
    let naj = -1;
    let najVzd = Infinity;
    riadky.forEach((r, i) => {
      const vzd = dniMedzi(r.koniecObdobia, String(u.charged_on).slice(0, 10));
      if (vzd < -5 || vzd > 15) return;
      if (Math.abs(vzd) < najVzd) {
        najVzd = Math.abs(vzd);
        naj = i;
      }
    });
    if (naj >= 0) sucty.set(naj, (sucty.get(naj) ?? 0) + (Number(u.amount) || 0));
  }
  return riadky.map((r, i) => {
    const s = sucty.has(i) ? zaokruhli(sucty.get(i)!) : null;
    return { ...r, skutocny: s, rozdiel: s === null ? null : zaokruhli(s - r.urok) };
  });
}

/**
 * Sadzba, ktorá z rozdielu vyplýva: keby banka počítala tou istou metódou,
 * aká sadzba by dala skutočný úrok? Hodí sa ako návrh ručnej sadzby.
 */
export function sadzbaZoSkutocnosti(r: RiadokPorovnania): number | null {
  if (r.skutocny === null || r.urok <= 0) return null;
  const sadzby = r.useky.filter((u) => u.sadzba !== null);
  if (sadzby.length !== 1) return null;
  return zaokruhliSadzbu((sadzby[0]!.sadzba! * r.skutocny) / r.urok);
}

/* ------------------------------------------------------------------ *
 * Uloženie
 * ------------------------------------------------------------------ */

export type StlpceSadzby = {
  rate_type: TypSadzby;
  reference_index: ReferencnyIndex | null;
  rate_margin: number | null;
  index_floor: number | null;
  fixing_rule: PravidloFixingu | null;
  fixing_offset_days: number | null;
  rate_reset: FrekvenciaZmeny | null;
};

/**
 * Stĺpce sadzby na zápis do zmluvy. Pri pevnej sa zloženie zmaže — inak by
 * hook kurzov neskôr prepisoval sadzbu, ktorú človek zadal ako pevnú.
 */
export function stlpceSadzby(d: {
  rate_type?: string | null;
  reference_index?: string | null;
  rate_margin?: number | null;
  index_floor?: number | null;
  fixing_rule?: string | null;
  fixing_offset_days?: number | null;
  rate_reset?: string | null;
}): StlpceSadzby {
  if (d.rate_type !== "pohybliva" || !jeIndex(d.reference_index)) {
    return {
      rate_type: "pevna",
      reference_index: null,
      rate_margin: null,
      index_floor: null,
      fixing_rule: null,
      fixing_offset_days: null,
      rate_reset: null,
    };
  }
  const pravidlo: PravidloFixingu =
    d.fixing_rule === "mesacny_priemer" ? "mesacny_priemer" : "pred_zaciatkom_obdobia";
  const frekv = FREKVENCIE_ZMENY.find((f) => f.kluc === d.rate_reset)?.kluc ?? "mesacne";
  return {
    rate_type: "pohybliva",
    reference_index: d.reference_index,
    rate_margin: cislo(d.rate_margin) ?? 0,
    index_floor: cislo(d.index_floor),
    fixing_rule: pravidlo,
    fixing_offset_days:
      pravidlo === "pred_zaciatkom_obdobia" ? (cislo(d.fixing_offset_days) ?? 2) : null,
    rate_reset: frekv,
  };
}

/** Typická frekvencia zmeny podľa splatnosti indexu (1M → mesačne, 3M → štvrťročne…). */
export function predvolenaFrekvencia(index: string | null | undefined): FrekvenciaZmeny {
  if (/_3M$/.test(String(index))) return "stvrtrocne";
  if (/_6M$/.test(String(index))) return "polrocne";
  if (/_(12M|1R)$/.test(String(index))) return "rocne";
  return "mesacne";
}
