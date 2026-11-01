/**
 * Modul Zamestnanci pre českú firmu (`companies.country = 'CZ'`).
 *
 * Rovnaký modul ako pre slovenskú firmu, len pravidlá podľa českých
 * predpisov. Čisté funkcie bez databázy — volá ich server aj obrazovky.
 * Každé číslo má pri sebe zdroj; overené k 1. 11. 2026.
 *
 * Zdroje (znenie platné k 1. 11. 2026):
 *  - Zákoník práce 262/2006 Sb. — https://www.zakonyprolidi.cz/cs/2006-262
 *      § 35 odst. 2: zkušební doba najviac 4 mesiace po sebe idúce od vzniku
 *        pracovného pomeru, u vedúceho zamestnanca 8 mesiacov;
 *      § 51 odst. 1–2: výpovedná doba najmenej 2 mesiace a začína dňom
 *        doručenia výpovede (po „flexinovele“ 2025);
 *      § 75: DPP najviac 300 hodín v kalendárnom roku;
 *      § 76 odst. 2: DPČ v priemere najviac polovica stanoveného týždenného
 *        pracovného času;
 *      § 212 odst. 1: dovolená najmenej 4 týždne v kalendárnom roku;
 *      § 223: krátenie len za neospravedlnene zameškanú zmenu.
 *  - Zákon 323/2025 Sb. o jednotném měsíčním hlášení zaměstnavatele (JMHZ) —
 *    https://www.zakonyprolidi.cz/cs/2025-323
 *      § 19 odst. 1 písm. a) (účinný od 1. 7. 2026): prihlásiť zamestnanca
 *        najneskôr pred okamihom nástupu, najskôr 8 dní pred ním;
 *      § 19 odst. 2: pri čiastočnej registrácii zvyšné údaje do 8 dní;
 *      § 19 odst. 6 písm. a): odhlásiť do 8 dní od skončenia zamestnania;
 *      § 7 odst. 1: mesačné hlásenie do 20. dňa nasledujúceho mesiaca.
 *    ČSSZ: od 1. 4. 2026 sa neposiela ONZ (nahradila ho Registrace
 *    zaměstnance REGZEC) a zamestnávateľ už nevyhotovuje ELDP — ČSSZ ho
 *    zostaví z mesačných hlásení. https://www.cssz.gov.cz/-/upozorneni-na-zmeny-pri-plneni-ohlasovacich-a-oznamovacich-povinnosti-zamestnavatelu-tykajicich-se-jejich-zamestnancu-a-zamestnavatele-od-1-4-2026-v-s
 *    https://www.cssz.gov.cz/-/nova-povinnost-evidovat-zamestnance-jeste-pred-nastupem-do-prace
 *  - Zákon 48/1997 Sb. o veřejném zdravotním pojištění, § 10 odst. 1 —
 *    https://www.zakonyprolidi.cz/cs/1997-48 : nástup a skončenie oznámiť
 *    zdravotnej poisťovni do 8 dní; pri zamestnancoch len na DPP/DPČ do 20.
 *    dňa nasledujúceho mesiaca.
 *  - Zákon 187/2006 Sb. o nemocenském pojištění — https://www.zakonyprolidi.cz/cs/2006-187
 *      § 6 odst. 2: rozhodný príjem (zamestnanie malého rozsahu, teda aj DPČ)
 *        4 500 Kč;
 *      § 7a odst. 1: DPP zakladá účasť od 25 % priemernej mzdy, zaokrúhlene
 *        nadol na 500 Kč. ČSSZ pre rok 2026: 12 000 Kč (priemerná mzda
 *        48 967 Kč), 2025: 11 500 Kč —
 *        https://www.cssz.gov.cz/-/prehled-nejdulezitejsich-udaju-pro-socialni-zabezpeceni-v-roce-2026
 *  - Minimálna mzda 2026: 22 400 Kč mesačne / 134,40 Kč za hodinu (sdělení
 *    MPSV 356/2025 Sb.), 2025: 20 800 Kč / 124,40 Kč —
 *    https://mpsv.gov.cz/minimalni-mzda
 *  - Rodné číslo: zákon 133/2000 Sb. § 13 — https://www.zakonyprolidi.cz/cs/2000-133
 *  - Číslo účtu: vyhláška ČNB 169/2011 Sb., príloha (váhy 6,3,7,9,10,5,8,4,2,1,
 *    mod 11) — https://www.zakonyprolidi.cz/cs/2011-169
 *  - Zdravotné poisťovne (kódy 111–213): zoznam VZP
 *    https://www.vzp.cz/poskytovatele/ciselniky/zdravotni-pojistovny
 */

/* ── Čísla podľa roka ───────────────────────────────────────────────────── */

type Rocne = { od: number; mesacne: number; hodinovo: number };

/** Minimálna mzda (MPSV). Pre neznámy budúci rok platí posledná známa. */
const MINIMALNA_MZDA: Rocne[] = [
  { od: 2025, mesacne: 20_800, hodinovo: 124.4 },
  { od: 2026, mesacne: 22_400, hodinovo: 134.4 },
];

/** Rozhodný príjem DPP (§ 7a zák. 187/2006 Sb., čísla ČSSZ). */
const LIMIT_DPP: { od: number; suma: number }[] = [
  { od: 2025, suma: 11_500 },
  { od: 2026, suma: 12_000 },
];

/** Zamestnanie malého rozsahu — aj DPČ (§ 6 odst. 2 zák. 187/2006 Sb.). */
export const LIMIT_MALY_ROZSAH_CZ = 4_500;
export const DPP_HODIN_ROCNE = 300;
export const SKUSOBNA_DOBA_MESIACE = 4;
export const SKUSOBNA_DOBA_VEDUCI_MESIACE = 8;
export const VYPOVEDNA_DOBA_MESIACE = 2;
export const DOVOLENKA_TYZDNE = 4;
/** Lehoty v dňoch (zák. 323/2025 Sb. § 19, zák. 48/1997 Sb. § 10). */
export const LEHOTA_ZP_DNI = 8;
export const LEHOTA_ODHLASENIA_DNI = 8;
export const PREDREGISTRACIA_DNI = 8;

function podlaRoka<T extends { od: number }>(tabulka: T[], rok: number): T {
  let vysledok = tabulka[0]!;
  for (const r of tabulka) if (r.od <= rok) vysledok = r;
  return vysledok;
}

export function minimalnaMzdaCz(rok: number): { mesacne: number; hodinovo: number } {
  const r = podlaRoka(MINIMALNA_MZDA, rok);
  return { mesacne: r.mesacne, hodinovo: r.hodinovo };
}

export function limitDppCz(rok: number): number {
  return podlaRoka(LIMIT_DPP, rok).suma;
}

/* ── Zdravotné poisťovne ────────────────────────────────────────────────── */

export const ZDRAVOTNE_POISTOVNE_CZ: { kod: string; nazov: string }[] = [
  { kod: "111", nazov: "VZP" },
  { kod: "201", nazov: "VoZP" },
  { kod: "205", nazov: "ČPZP" },
  { kod: "207", nazov: "OZP" },
  { kod: "209", nazov: "ZPŠ" },
  { kod: "211", nazov: "ZPMV" },
  { kod: "213", nazov: "RBP" },
];

/* ── Rodné číslo (zák. 133/2000 Sb. § 13) ───────────────────────────────── */

export type VysledokKontroly = { ok: true; hodnota: string } | { ok: false; chyba: string };

/**
 * Kontrola českého rodného čísla. Prijíma „YYMMDD/XXXX“ aj bez lomky.
 *
 * - 9 číslic: len narodení pred 1. 1. 1954, deliteľnosť sa nekontroluje (§ 13 odst. 4).
 * - 10 číslic: deliteľné 11 (§ 13 odst. 3); mesiac +50 u žien, od roku 2004
 *   pri vyčerpaní koncoviek +20 u mužov a +70 u žien (§ 13 odst. 5).
 * - Čísla pridelené do roku 1985 so zvyškom 10 a kontrolnou číslicou 0 zákon
 *   nespomína, ale v praxi existujú (napr. registre ich prijímajú) — necháme ich
 *   prejsť, inak by sme odmietli skutočných ľudí.
 */
export function overRodneCisloCz(vstup: string): VysledokKontroly {
  const s = vstup.replace(/\s+/g, "");
  if (!/^\d{6}\/?\d{3,4}$/.test(s)) {
    return { ok: false, chyba: "Rodné číslo má tvar RRMMDD/XXXX (9 alebo 10 číslic)." };
  }
  const c = s.replace("/", "");
  const rr = Number(c.slice(0, 2));
  let mm = Number(c.slice(2, 4));
  const dd = Number(c.slice(4, 6));
  let rok: number;
  if (c.length === 9) {
    if (rr >= 54)
      return {
        ok: false,
        chyba: "Deväťmiestne rodné číslo majú len ľudia narodení pred rokom 1954.",
      };
    rok = 1900 + rr;
  } else {
    rok = rr >= 54 ? 1900 + rr : 2000 + rr;
  }
  if (mm > 70) {
    if (rok < 2004) return { ok: false, chyba: "Rodné číslo má neplatný mesiac." };
    mm -= 70;
  } else if (mm > 50) mm -= 50;
  else if (mm > 20) {
    if (rok < 2004) return { ok: false, chyba: "Rodné číslo má neplatný mesiac." };
    mm -= 20;
  }
  if (mm < 1 || mm > 12) return { ok: false, chyba: "Rodné číslo má neplatný mesiac." };
  const dniVMesiaci = new Date(Date.UTC(rok, mm, 0)).getUTCDate();
  if (dd < 1 || dd > dniVMesiaci) return { ok: false, chyba: "Rodné číslo má neplatný deň." };
  if (c.length === 10) {
    const zvysok = Number(c.slice(0, 9)) % 11;
    const kontrolna = Number(c[9]);
    const delitelne = Number(c) % 11 === 0;
    const vynimka1985 = zvysok === 10 && kontrolna === 0 && rok < 1986;
    if (!delitelne && !vynimka1985) {
      return { ok: false, chyba: "Rodné číslo nie je deliteľné 11 — skontrolujte ho." };
    }
  }
  return { ok: true, hodnota: `${c.slice(0, 6)}/${c.slice(6)}` };
}

/* ── Číslo účtu (vyhláška ČNB 169/2011 Sb.) ─────────────────────────────── */

const VAHY = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1];

function vazenySucet(cast: string): number {
  const doplnena = cast.padStart(10, "0");
  let s = 0;
  for (let i = 0; i < 10; i++) s += Number(doplnena[i]) * VAHY[i]!;
  return s;
}

/**
 * České číslo účtu „predčíslie-číslo/kód banky“ (napr. 19-2000145399/0800)
 * alebo IBAN. Predčíslie najviac 6 číslic, číslo 2–10 číslic s aspoň dvoma
 * nenulovými, kód banky 4 číslice; obe časti musia prejsť váženým súčtom mod 11.
 */
export function overCisloUctuCz(vstup: string): VysledokKontroly {
  const s = vstup.replace(/\s+/g, "").toUpperCase();
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) {
    // IBAN — kontrola mod 97 (ISO 13616).
    const prehodeny = s.slice(4) + s.slice(0, 4);
    const cisla = prehodeny.replace(/[A-Z]/g, (z) => String(z.charCodeAt(0) - 55));
    let zvysok = 0;
    for (const ch of cisla) zvysok = (zvysok * 10 + Number(ch)) % 97;
    return zvysok === 1
      ? { ok: true, hodnota: s }
      : { ok: false, chyba: "IBAN nemá správny kontrolný súčet." };
  }
  const m = s.match(/^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/);
  if (!m) {
    return { ok: false, chyba: "Číslo účtu zadajte v tvare 19-2000145399/0800 alebo ako IBAN." };
  }
  const [, predcislie, cislo, banka] = m;
  if ((cislo!.match(/[1-9]/g) ?? []).length < 2) {
    return { ok: false, chyba: "Číslo účtu musí mať aspoň dve nenulové číslice." };
  }
  if (predcislie && vazenySucet(predcislie) % 11 !== 0) {
    return { ok: false, chyba: "Predčíslie účtu nemá správny kontrolný súčet." };
  }
  if (vazenySucet(cislo!) % 11 !== 0) {
    return { ok: false, chyba: "Číslo účtu nemá správny kontrolný súčet." };
  }
  return { ok: true, hodnota: `${predcislie ? `${predcislie}-` : ""}${cislo}/${banka}` };
}

/* ── Dátumy ─────────────────────────────────────────────────────────────── */

/** Posledný deň skúšobnej doby: `mesiace` po sebe idúce od dňa nástupu. */
export function koniecPoMesiacoch(zaciatok: string, mesiace: number): string {
  const [r, m, d] = zaciatok.slice(0, 10).split("-").map(Number) as [number, number, number];
  const cielovyMesiac = m - 1 + mesiace;
  const posledny = new Date(Date.UTC(r, cielovyMesiac + 1, 0)).getUTCDate();
  // Keď cieľový mesiac taký deň nemá (31. 10. + 4 mesiace), končí sa posledným dňom mesiaca.
  const den =
    d > posledny
      ? Date.UTC(r, cielovyMesiac, posledny)
      : Date.UTC(r, cielovyMesiac, d) - 86_400_000;
  return new Date(den).toISOString().slice(0, 10);
}

/** 20. deň mesiaca nasledujúceho po mesiaci dátumu (DPP/DPČ u zdravotnej poisťovne). */
export function dvadsiatyNasledujuceho(iso: string): string {
  const [r, m] = iso.slice(0, 10).split("-").map(Number) as [number, number];
  return new Date(Date.UTC(r, m, 20)).toISOString().slice(0, 10);
}

/* ── Kontrola zmluvy ────────────────────────────────────────────────────── */

export type UpozornenieZmluvy = {
  zavaznost: "warning" | "info";
  /** Slovenský kľúč pre `t()`. */
  text: string;
  params?: Record<string, string | number>;
};

type ZmluvaNaKontrolu = {
  kind: string;
  start_date?: string | null;
  end_date?: string | null;
  probation_end?: string | null;
  weekly_hours?: number | string | null;
  salary?: number | string | null;
  salary_period?: string | null;
};

const cislo = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const suma = (n: number) =>
  new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(n).replace(/ /g, " ");

/**
 * Upozornenia k zmluve českej firmy — neblokujú uloženie (vedúci zamestnanec,
 * kolektívna zmluva či iný úväzok môžu byť výnimkou), len povedia, čo zákon
 * hovorí. Sumy sú v Kč.
 */
export function kontrolaZmluvyCz(k: ZmluvaNaKontrolu): UpozornenieZmluvy[] {
  const vysledok: UpozornenieZmluvy[] = [];
  const zaciatok = k.start_date?.slice(0, 10) || null;
  const rok = Number((zaciatok ?? new Date().toISOString()).slice(0, 4));
  const hodiny = cislo(k.weekly_hours);
  const mzda = cislo(k.salary);
  const dohoda = k.kind === "dovp" || k.kind === "dopc";

  if (k.probation_end && zaciatok) {
    if (dohoda) {
      vysledok.push({
        zavaznost: "warning",
        text: "Skúšobná doba sa dá dohodnúť len v pracovnom pomere, nie pri DPP ani DPČ.",
      });
    } else if (k.probation_end > koniecPoMesiacoch(zaciatok, SKUSOBNA_DOBA_VEDUCI_MESIACE)) {
      vysledok.push({
        zavaznost: "warning",
        text: "Skúšobná doba je dlhšia ako 8 mesiacov — to Zákonník práce nedovoľuje ani vedúcemu zamestnancovi (§ 35).",
      });
    } else if (k.probation_end > koniecPoMesiacoch(zaciatok, SKUSOBNA_DOBA_MESIACE)) {
      vysledok.push({
        zavaznost: "warning",
        text: "Skúšobná doba je dlhšia ako 4 mesiace — dlhšia (najviac 8 mesiacov) je možná len u vedúceho zamestnanca (§ 35).",
      });
    }
  }

  if (k.kind === "dopc" && hodiny != null && hodiny > 20) {
    vysledok.push({
      zavaznost: "warning",
      text: "DPČ smie mať v priemere najviac polovicu týždenného pracovného času, pri 40 hodinách teda 20 hodín týždenne (§ 76).",
    });
  }
  if (k.kind === "dovp") {
    vysledok.push({
      zavaznost: "info",
      text: "DPP: najviac {hodin} hodín za kalendárny rok u jedného zamestnávateľa (§ 75). Pri odmene od {limit} Kč za mesiac ({rok}) sa z nej platí poistné a zamestnanec je účastný nemocenského poistenia.",
      params: { hodin: DPP_HODIN_ROCNE, limit: suma(limitDppCz(rok)), rok },
    });
  }
  if (k.kind === "dopc") {
    vysledok.push({
      zavaznost: "info",
      text: "DPČ: pri príjme od {limit} Kč za mesiac je zamestnanec účastný nemocenského aj dôchodkového poistenia.",
      params: { limit: suma(LIMIT_MALY_ROZSAH_CZ) },
    });
  }

  const min = minimalnaMzdaCz(rok);
  if (mzda != null && mzda > 0) {
    if (k.salary_period === "hodinovo" && mzda < min.hodinovo) {
      vysledok.push({
        zavaznost: "warning",
        text: "Hodinová mzda je nižšia ako minimálna mzda {suma} Kč za hodinu ({rok}).",
        params: { suma: suma(min.hodinovo), rok },
      });
    }
    if (k.kind === "pracovna_zmluva" && (k.salary_period ?? "mesacne") === "mesacne") {
      // Pri kratšom úväzku sa minimálna mzda kráti podľa odpracovaných hodín (40 h = plná).
      const pomer = hodiny != null && hodiny > 0 && hodiny < 40 ? hodiny / 40 : 1;
      const hranica = Math.round(min.mesacne * pomer * 100) / 100;
      if (mzda < hranica) {
        vysledok.push({
          zavaznost: "warning",
          text: "Mesačná mzda je nižšia ako minimálna mzda {suma} Kč ({rok}) pri tomto úväzku.",
          params: { suma: suma(hranica), rok },
        });
      }
    }
  }

  if (k.kind === "pracovna_zmluva") {
    vysledok.push({
      zavaznost: "info",
      text: "Dovolenka najmenej 4 týždne za kalendárny rok (§ 212), pri kratšom trvaní pomerne; krátiť sa dá len za neospravedlnene zameškanú zmenu (§ 223). Výpovedná doba najmenej 2 mesiace, plynie odo dňa doručenia výpovede (§ 51).",
    });
    if (hodiny != null && hodiny > 0) {
      vysledok.push({
        zavaznost: "info",
        text: "Nárok na dovolenku za celý rok: {hodin} hodín ({tyzdne} týždne × {uvazok} h týždenne).",
        params: {
          hodin: suma(hodiny * DOVOLENKA_TYZDNE),
          tyzdne: DOVOLENKA_TYZDNE,
          uvazok: suma(hodiny),
        },
      });
    }
  }
  return vysledok;
}
