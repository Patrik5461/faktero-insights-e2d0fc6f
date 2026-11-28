/**
 * Daňový kalendár firmy (FAK-667, Patrik 27. 11. 2026).
 *
 * Termíny sa počítajú podľa toho, čo o firme Faktero vie (platiteľ DPH,
 * paragraf registrácie, krajina, zamestnanci, vozidlá, OSS, dodania do EÚ)
 * a podľa nastavenia kalendára (obdobie DPH, preddavky, nehnuteľnosť,
 * výplatný deň). Lehoty overené zo zákonov 26. 11. 2026 — pamäť
 * `faktero-danovy-kalendar-lehoty`:
 *  - SK posun na pracovný deň: daňový poriadok § 27 ods. 4; OSS sa NEposúva
 *    (§ 68b ods. 12 a 18 zákona o DPH).
 *  - CZ posun: daňový řád § 33 ods. 4.
 * Čisté funkcie bez databázy — testy v `danovy-kalendar.test.ts`.
 */

export type Krajina = "SK" | "CZ";
export type ObdobieDph = "mesacne" | "stvrtrocne";
export type Preddavky = "ziadne" | "stvrtrocne" | "mesacne";

export type NastaveniaKalendara = {
  dph_obdobie?: ObdobieDph;
  /** Súhrnný výkaz štvrťročne (SK: tovar do EÚ ≤ 50 000 € za štvrťrok). */
  sv_stvrtrocne?: boolean;
  preddavky_dzp?: Preddavky;
  /** Odklad daňového priznania k dani z príjmov (mesiace): 0, 3, 6. */
  odklad_dp?: 0 | 3 | 6;
  /** Vlastní nehnuteľnosť, pri ktorej sa tento rok podáva priznanie (vznik/zmena). */
  nehnutelnost_priznanie?: boolean;
  dmv_preddavky?: Preddavky;
  /** Deň výplaty miezd (1–31) — splatnosť poistného zamestnávateľa. Prázdne = koniec nasledujúceho mesiaca. */
  vyplatny_den?: number | null;
  /** CZ: daňové priznanie k DPPO podáva daňový poradca (lehota 1. 7.). */
  cz_poradca?: boolean;
  /** CZ: zálohy na DPPO — 2× (pololetne) alebo 4× (štvrťročne). */
  cz_zalohy?: "ziadne" | "pololetne" | "stvrtrocne";
};

export type FaktyFirmy = {
  krajina: Krajina;
  platitelDph: boolean;
  /** `sk_4`, `sk_7`, `sk_7a`, `cz_…` — paragraf registrácie (`companies.vat_scheme`). */
  schemaDph: string | null;
  maZamestnancov: boolean;
  maVozidla: boolean;
  maOss: boolean;
  /** Mesiace `RRRR-MM`, v ktorých firma dodala tovar/služby do EÚ (súhrnný výkaz). */
  mesiaceEu: string[];
  /** Mesiace `RRRR-MM` s plnením v prenesení pri § 7/7a (povinnosť podať priznanie). */
  mesiace7: string[];
};

export type DruhTerminu =
  | "dph"
  | "kv"
  | "sv"
  | "dph7"
  | "oss"
  | "dp"
  | "preddavok_dzp"
  | "dmv"
  | "dmv_preddavok"
  | "nehnutelnost"
  | "poistne"
  | "vykaz_zp"
  | "mesacny_prehlad"
  | "rocne_hlasenie"
  | "cz_dph"
  | "cz_kh"
  | "cz_sh"
  | "cz_dppo"
  | "cz_zaloha";

export type Termin = {
  /** `RRRR-MM-DD` — posledný deň lehoty (už posunutý na pracovný deň). */
  datum: string;
  /** Pôvodný dátum pred posunom, keď sa posúval. */
  povodny: string | null;
  druh: DruhTerminu;
  nazov: string;
  /** Obdobie, za ktoré sa podáva / platí (napr. „október 2026“, „Q3 2026“, „2025“). */
  obdobie: string;
  paragraf: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (r: number, m: number, d: number) => `${r}-${pad(m)}-${pad(d)}`;
const poslednyDen = (r: number, m: number) => new Date(Date.UTC(r, m, 0)).getUTCDate();
const MESIACE = [
  "január", "február", "marec", "apríl", "máj", "jún",
  "júl", "august", "september", "október", "november", "december",
];

/** Veľkonočná nedeľa (gregoriánsky výpočet, Meeus/Jones/Butcher). */
function velkaNoc(rok: number): { m: number; d: number } {
  const a = rok % 19, b = Math.floor(rok / 100), c = rok % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mm = Math.floor((a + 11 * h + 22 * l) / 451);
  return { m: Math.floor((h + l - 7 * mm + 114) / 31), d: ((h + l - 7 * mm + 114) % 31) + 1 };
}
function posunDni(r: number, m: number, d: number, o: number): string {
  const t = new Date(Date.UTC(r, m - 1, d + o));
  return t.toISOString().slice(0, 10);
}

/**
 * Dni pracovného pokoja (len tie posúvajú lehotu). SK podľa zákona 241/1993
 * v znení od 29. 10. 2026: v roku 2026 sú 8. 5. a 15. 9. pracovné (§ 4b),
 * 1. 9., 28. 10. a 17. 11. sú štátne sviatky, ale nie dni pracovného pokoja.
 */
export function dniPracovnehoPokoja(krajina: Krajina, rok: number): Set<string> {
  const vn = velkaNoc(rok);
  const piatok = posunDni(rok, vn.m, vn.d, -2);
  const pondelok = posunDni(rok, vn.m, vn.d, 1);
  if (krajina === "CZ") {
    return new Set([
      iso(rok, 1, 1), piatok, pondelok, iso(rok, 5, 1), iso(rok, 5, 8), iso(rok, 7, 5), iso(rok, 7, 6),
      iso(rok, 9, 28), iso(rok, 10, 28), iso(rok, 11, 17), iso(rok, 12, 24), iso(rok, 12, 25), iso(rok, 12, 26),
    ]);
  }
  const s = new Set([
    iso(rok, 1, 1), iso(rok, 1, 6), piatok, pondelok, iso(rok, 5, 1), iso(rok, 5, 8), iso(rok, 7, 5),
    iso(rok, 8, 29), iso(rok, 9, 15), iso(rok, 11, 1), iso(rok, 12, 24), iso(rok, 12, 25), iso(rok, 12, 26),
  ]);
  if (rok <= 2025) [iso(rok, 9, 1), iso(rok, 10, 28), iso(rok, 11, 17)].forEach((x) => s.add(x));
  if (rok === 2026) [iso(rok, 5, 8), iso(rok, 9, 15)].forEach((x) => s.delete(x));
  return s;
}

/** Najbližší pracovný deň (sobota, nedeľa, deň pracovného pokoja sa preskočia). */
export function pracovnyDen(krajina: Krajina, datum: string): string {
  let d = datum;
  for (let i = 0; i < 10; i++) {
    const t = new Date(`${d}T12:00:00Z`);
    const den = t.getUTCDay();
    if (den !== 0 && den !== 6 && !dniPracovnehoPokoja(krajina, t.getUTCFullYear()).has(d)) return d;
    d = posunDni(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), 1);
  }
  return d;
}

function termin(
  krajina: Krajina,
  datum: string,
  t: Omit<Termin, "datum" | "povodny">,
  bezPosunu = false,
): Termin {
  const p = bezPosunu ? datum : pracovnyDen(krajina, datum);
  return { ...t, datum: p, povodny: p !== datum ? datum : null };
}

/** Všetky mesiace (rok, mesiac 1–12), ktorých 25. deň nasledujúceho mesiaca padne do rozsahu. */
function mesiaceObdobia(od: string, doo: string): { r: number; m: number }[] {
  const out: { r: number; m: number }[] = [];
  const [r0, m0] = od.split("-").map(Number);
  let r = r0, m = m0 - 2;
  while (m < 1) { m += 12; r--; }
  for (let i = 0; i < 40; i++) {
    out.push({ r, m });
    m++;
    if (m > 12) { m = 1; r++; }
    if (iso(r, m, 1) > doo) break;
  }
  return out;
}
const nasledujuci = (r: number, m: number) => (m === 12 ? { r: r + 1, m: 1 } : { r, m: m + 1 });

/**
 * Termíny firmy v rozsahu dátumov [od, do] (vrátane), zoradené podľa dátumu.
 */
export function terminyFirmy(fakty: FaktyFirmy, n: NastaveniaKalendara, od: string, doo: string): Termin[] {
  const k = fakty.krajina;
  const out: Termin[] = [];
  const schema = String(fakty.schemaDph ?? "");
  const je7 = k === "SK" && (schema === "sk_7" || schema === "sk_7a");
  const stvrt = n.dph_obdobie === "stvrtrocne";

  for (const { r, m } of mesiaceObdobia(od, doo)) {
    const po = nasledujuci(r, m);
    const d25 = iso(po.r, po.m, 25);
    const koniecStvrtroka = m % 3 === 0;
    const q = Math.ceil(m / 3);
    const obdobieM = `${MESIACE[m - 1]} ${r}`;
    const obdobieQ = `Q${q} ${r}`;

    if (k === "SK") {
      if (fakty.platitelDph && !je7 && (!stvrt || koniecStvrtroka)) {
        const ob = stvrt ? obdobieQ : obdobieM;
        out.push(termin(k, d25, { druh: "dph", nazov: "Daňové priznanie k DPH a platba", obdobie: ob, paragraf: "§ 77, § 78 zákona o DPH" }));
        out.push(termin(k, d25, { druh: "kv", nazov: "Kontrolný výkaz DPH", obdobie: ob, paragraf: "§ 78a zákona o DPH" }));
      }
      if (je7 && fakty.mesiace7.includes(`${r}-${pad(m)}`)) {
        out.push(termin(k, d25, { druh: "dph7", nazov: "Daňové priznanie k DPH (registrácia § 7/§ 7a) a platba", obdobie: obdobieM, paragraf: "§ 78 ods. 3 zákona o DPH" }));
      }
      // Súhrnný výkaz — mesačne, štvrťročne pri nastavení alebo pri § 7/7a (§ 80 ods. 3).
      const svStvrt = n.sv_stvrtrocne || je7;
      if (fakty.platitelDph || je7) {
        const mesiaceSv = svStvrt ? [m - 2, m - 1, m].map((x) => `${r}-${pad(x)}`) : [`${r}-${pad(m)}`];
        if ((!svStvrt || koniecStvrtroka) && mesiaceSv.some((x) => fakty.mesiaceEu.includes(x))) {
          out.push(termin(k, d25, { druh: "sv", nazov: "Súhrnný výkaz", obdobie: svStvrt ? obdobieQ : obdobieM, paragraf: "§ 80 zákona o DPH" }));
        }
      }
      if (fakty.maOss && koniecStvrtroka) {
        out.push(
          termin(k, iso(po.r, po.m, poslednyDen(po.r, po.m)), { druh: "oss", nazov: "OSS — priznanie a platba (aj nulové)", obdobie: obdobieQ, paragraf: "§ 68b ods. 12 a 18 zákona o DPH (lehota sa neposúva)" }, true),
        );
      }
      // Preddavky na daň z príjmov — splatné do konca mesiaca / štvrťroka.
      if (n.preddavky_dzp === "mesacne" || (n.preddavky_dzp === "stvrtrocne" && koniecStvrtroka)) {
        out.push(termin(k, iso(r, m, poslednyDen(r, m)), { druh: "preddavok_dzp", nazov: "Preddavok na daň z príjmov", obdobie: n.preddavky_dzp === "mesacne" ? obdobieM : obdobieQ, paragraf: "§ 34 zákona o dani z príjmov" }));
      }
      if (n.dmv_preddavky === "mesacne" || (n.dmv_preddavky === "stvrtrocne" && koniecStvrtroka)) {
        out.push(termin(k, iso(r, m, poslednyDen(r, m)), { druh: "dmv_preddavok", nazov: "Preddavok na daň z motorových vozidiel", obdobie: n.dmv_preddavky === "mesacne" ? obdobieM : obdobieQ, paragraf: "§ 10 zákona 361/2014" }));
      }
      if (fakty.maZamestnancov) {
        // Poistné SP a ZP: v deň výplaty, inak posledný deň nasledujúceho mesiaca (§ 143 ods. 2 z. 461/2003, § 17 ods. 1 z. 580/2004).
        const vd = n.vyplatny_den && n.vyplatny_den >= 1 && n.vyplatny_den <= 31 ? Math.min(n.vyplatny_den, poslednyDen(po.r, po.m)) : null;
        const splatnost = vd ? iso(po.r, po.m, vd) : iso(po.r, po.m, poslednyDen(po.r, po.m));
        out.push(termin(k, splatnost, { druh: "poistne", nazov: "Poistné za zamestnancov (Sociálna a zdravotná poisťovňa) + mesačný výkaz SP", obdobie: obdobieM, paragraf: "§ 143 ods. 2 z. 461/2003, § 17 ods. 1 z. 580/2004" }));
        const s = new Date(`${termin(k, splatnost, { druh: "poistne", nazov: "", obdobie: "", paragraf: "" }).datum}T12:00:00Z`);
        out.push(termin(k, posunDni(s.getUTCFullYear(), s.getUTCMonth() + 1, s.getUTCDate(), 3), { druh: "vykaz_zp", nazov: "Mesačný výkaz pre zdravotnú poisťovňu", obdobie: obdobieM, paragraf: "vyhl. 159/2018 § 2 ods. 2" }));
        out.push(termin(k, iso(po.r, po.m, poslednyDen(po.r, po.m)), { druh: "mesacny_prehlad", nazov: "Mesačný prehľad o preddavkoch na daň (zamestnanci)", obdobie: obdobieM, paragraf: "§ 39 ods. 9, § 49 ods. 2 zákona o dani z príjmov" }));
      }
    } else {
      if (fakty.platitelDph && (!stvrt || koniecStvrtroka)) {
        const ob = stvrt ? obdobieQ : obdobieM;
        out.push(termin(k, d25, { druh: "cz_dph", nazov: "Přiznání k DPH a platba", obdobie: ob, paragraf: "§ 99, § 101 zákona 235/2004" }));
      }
      if (fakty.platitelDph) {
        out.push(termin(k, d25, { druh: "cz_kh", nazov: "Kontrolní hlášení", obdobie: obdobieM, paragraf: "§ 101e zákona 235/2004" }));
        if (fakty.mesiaceEu.includes(`${r}-${pad(m)}`)) {
          out.push(termin(k, d25, { druh: "cz_sh", nazov: "Souhrnné hlášení", obdobie: obdobieM, paragraf: "§ 102 zákona 235/2004" }));
        }
      }
    }
  }

  // Ročné termíny.
  const [rOd] = od.split("-").map(Number);
  const [rDo] = doo.split("-").map(Number);
  for (let rok = rOd; rok <= rDo; rok++) {
    if (k === "SK") {
      const odklad = n.odklad_dp ?? 0;
      const dp = odklad ? iso(rok, 3 + odklad, poslednyDen(rok, 3 + odklad)) : iso(rok, 3, 31);
      out.push(termin(k, dp, { druh: "dp", nazov: "Daňové priznanie k dani z príjmov a platba dane", obdobie: String(rok - 1), paragraf: "§ 49 zákona o dani z príjmov" }));
      if (fakty.maVozidla) out.push(termin(k, iso(rok, 1, 31), { druh: "dmv", nazov: "Daň z motorových vozidiel — priznanie a platba", obdobie: String(rok - 1), paragraf: "§ 9 ods. 2 zákona 361/2014" }));
      if (n.nehnutelnost_priznanie) out.push(termin(k, iso(rok, 1, 31), { druh: "nehnutelnost", nazov: "Priznanie k dani z nehnuteľností (pri vzniku alebo zmene)", obdobie: String(rok), paragraf: "§ 99a zákona 582/2004" }));
      if (fakty.maZamestnancov) out.push(termin(k, iso(rok, 4, 30), { druh: "rocne_hlasenie", nazov: "Ročné hlásenie o vyúčtovaní dane (zamestnanci)", obdobie: String(rok - 1), paragraf: "§ 49 ods. 2 zákona o dani z príjmov" }));
    } else {
      const dppo = n.cz_poradca ? iso(rok, 7, 1) : iso(rok, 5, 1);
      out.push(termin(k, dppo, { druh: "cz_dppo", nazov: n.cz_poradca ? "Přiznání k dani z příjmů PO (s poradcem)" : "Přiznání k dani z příjmů PO (elektronicky)", obdobie: String(rok - 1), paragraf: "§ 136 daňového řádu" }));
      const zal = n.cz_zalohy === "pololetne" ? [6, 12] : n.cz_zalohy === "stvrtrocne" ? [3, 6, 9, 12] : [];
      for (const m of zal) out.push(termin(k, iso(rok, m, 15), { druh: "cz_zaloha", nazov: "Záloha na daň z příjmů PO", obdobie: `${pad(m)}/${rok}`, paragraf: "§ 38a zákona 586/1992" }));
    }
  }

  return out
    .filter((t) => t.datum >= od && t.datum <= doo)
    .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.druh.localeCompare(b.druh)));
}

/** Kalendár vo formáte iCalendar (.ics) — celodenné udalosti v deň lehoty. */
export function icsKalendara(terminy: Termin[], firma: string): string {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const kratko = (d: string) => d.replace(/-/g, "");
  const riadky = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Faktero//Danovy kalendar//SK", "CALSCALE:GREGORIAN"];
  for (const t of terminy) {
    const dalsi = new Date(`${t.datum}T12:00:00Z`);
    dalsi.setUTCDate(dalsi.getUTCDate() + 1);
    riadky.push(
      "BEGIN:VEVENT",
      `UID:${t.druh}-${t.datum}-${kratko(t.obdobie)}@faktero.sk`,
      `DTSTART;VALUE=DATE:${kratko(t.datum)}`,
      `DTEND;VALUE=DATE:${kratko(dalsi.toISOString().slice(0, 10))}`,
      `SUMMARY:${esc(`${t.nazov} — ${t.obdobie} (${firma})`)}`,
      `DESCRIPTION:${esc(`${t.paragraf}${t.povodny ? ` · posunuté z ${t.povodny}` : ""}`)}`,
      "BEGIN:VALARM",
      "TRIGGER:-P3D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(t.nazov)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  riadky.push("END:VCALENDAR");
  return riadky.join("\r\n") + "\r\n";
}
