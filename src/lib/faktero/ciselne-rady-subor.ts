/**
 * Export a import číselných radov cez súbor (XLSX/CSV).
 *
 * Čisté funkcie bez databázy — rovnaký plán počíta náhľad aj uloženie na
 * serveri, takže to, čo človek v náhľade vidí, je presne to, čo sa zapíše.
 *
 * Najdôležitejšie pravidlo: počítadlo radu sa nesmie dostať pod poradie, ktoré
 * už nesie vystavený doklad. Databáza by síce obsadené číslo preskočila
 * (`faktero_next_*` hľadá voľné), ale rad by potom zapĺňal staré diery a
 * doklady by išli na papieri mimo poradia — človek, ktorý v súbore zníži
 * „Začať od poradia", to takmer vždy myslí ako omyl. Riadok preto dostane
 * chybu a uloží sa len zvyšok.
 */
import {
  DRUHY_RADOV,
  NAZVY_DRUHOV,
  chybaSablony,
  normalizujSablonu,
  ukazkaCisla,
  type DruhRadu,
} from "./ciselne-rady";

// ─── stĺpce ───────────────────────────────────────────────────────────────────

export type PoleSuboru =
  | "id"
  | "druh"
  | "nazov"
  | "sablona"
  | "start_from"
  | "posledne"
  | "ukazka"
  | "predvoleny"
  | "aktivny";

/** Stĺpce exportu v poradí; `posledne` a `ukazka` sú len na čítanie, import ich ignoruje. */
export const STLPCE_RADOV: { pole: PoleSuboru; nazov: string }[] = [
  { pole: "id", nazov: "ID" },
  { pole: "druh", nazov: "Druh dokladu" },
  { pole: "nazov", nazov: "Názov radu" },
  { pole: "sablona", nazov: "Šablóna čísla" },
  { pole: "start_from", nazov: "Začať od poradia" },
  { pole: "posledne", nazov: "Posledné použité poradie" },
  { pole: "ukazka", nazov: "Ďalšie číslo (ukážka)" },
  { pole: "predvoleny", nazov: "Predvolený" },
  { pole: "aktivny", nazov: "Aktívny" },
];

export const normalizujText = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_*:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Ďalšie pomenovania stĺpcov, ktoré import spozná aj bez prekladu. */
const ALIASY_STLPCOV: Record<string, PoleSuboru> = {
  id: "id",
  "druh dokladu": "druh",
  druh: "druh",
  kind: "druh",
  "typ dokladu": "druh",
  "nazov radu": "nazov",
  nazov: "nazov",
  name: "nazov",
  "nazev radu": "nazov",
  nazev: "nazov",
  "sablona cisla": "sablona",
  sablona: "sablona",
  "format cisla": "sablona",
  format: "sablona",
  predpona: "sablona",
  "predpona/format": "sablona",
  template: "sablona",
  "zacat od poradia": "start_from",
  "start from": "start_from",
  "od poradia": "start_from",
  "dalsie cislo": "start_from",
  "dalsie poradie": "start_from",
  "posledne pouzite poradie": "posledne",
  "posledne pouzite": "posledne",
  "dalsie cislo (ukazka)": "ukazka",
  predvoleny: "predvoleny",
  "is default": "predvoleny",
  default: "predvoleny",
  vychozi: "predvoleny",
  aktivny: "aktivny",
  active: "aktivny",
  aktivni: "aktivny",
};

/** Druh dokladu z bunky — kód (`invoice`), slovenský názov alebo preložený názov z `aliasy`. */
export function druhZTextu(
  text: string,
  aliasy: Record<string, DruhRadu> = {},
): DruhRadu | null {
  const n = normalizujText(text);
  if (!n) return null;
  for (const d of DRUHY_RADOV) {
    if (n === normalizujText(d) || n === normalizujText(NAZVY_DRUHOV[d])) return d;
  }
  for (const [k, d] of Object.entries(aliasy)) if (normalizujText(k) === n) return d;
  return null;
}

// ─── export ───────────────────────────────────────────────────────────────────

export type RadNaExport = {
  id: string;
  kind: DruhRadu;
  name: string;
  format: string;
  is_default: boolean;
  active: boolean;
  start_from: number;
  /** Najvyššie poradie, ktoré už nesie doklad v aktuálnom období (0 = žiadny). */
  posledne: number;
};

/** Hlavička a riadky exportu; `preloz` preloží názvy stĺpcov, druhov a áno/nie. */
export function exportRadov(
  rady: RadNaExport[],
  preloz: (s: string) => string = (s) => s,
  dnes: Date = new Date(),
): { hlavicka: string[]; riadky: (string | number)[][] } {
  const poradie = new Map(DRUHY_RADOV.map((d, i) => [d, i]));
  const zoradene = [...rady].sort(
    (a, b) =>
      (poradie.get(a.kind) ?? 99) - (poradie.get(b.kind) ?? 99) ||
      Number(b.is_default) - Number(a.is_default) ||
      a.name.localeCompare(b.name, "sk"),
  );
  const ano = preloz("áno");
  const nie = preloz("nie");
  return {
    hlavicka: STLPCE_RADOV.map((s) => preloz(s.nazov)),
    riadky: zoradene.map((r) => {
      const dalsie = Math.max(r.start_from || 1, (r.posledne || 0) + 1);
      return [
        r.id,
        preloz(NAZVY_DRUHOV[r.kind] ?? r.kind),
        r.name,
        r.format,
        r.start_from || 1,
        r.posledne || "",
        ukazkaCisla(r.format, dalsie, dnes),
        r.is_default ? ano : nie,
        r.active ? ano : nie,
      ];
    }),
  };
}

// ─── čítanie súboru ───────────────────────────────────────────────────────────

/** Jeden riadok súboru po rozpoznaní stĺpcov — hodnoty ešte ako text. */
export type RiadokSuboru = {
  /** Číslo riadku v súbore (od 1, ako v Exceli). */
  riadok: number;
  id: string;
  /** Kód druhu, ak sa spoznal; inak pôvodný text bunky (plán z neho urobí chybu). */
  druh: string;
  nazov: string;
  sablona: string;
  start_from: string;
  predvoleny: string;
  aktivny: string;
};

/**
 * Riadky súboru → `RiadokSuboru[]`.
 *
 * Hlavička je prvý z prvých desiatich riadkov, v ktorom je stĺpec s druhom
 * dokladu aj so šablónou. `aliasyStlpcov` a `aliasyDruhov` sú preložené názvy
 * (export v češtine či nemčine sa dá nahrať späť).
 */
export function riadkyZTabulky(
  tabulka: string[][],
  aliasyStlpcov: Record<string, PoleSuboru> = {},
  aliasyDruhov: Record<string, DruhRadu> = {},
): { riadky: RiadokSuboru[]; chyba: string | null } {
  const aliasy: Record<string, PoleSuboru> = { ...ALIASY_STLPCOV };
  for (const s of STLPCE_RADOV) aliasy[normalizujText(s.nazov)] = s.pole;
  for (const [k, v] of Object.entries(aliasyStlpcov)) aliasy[normalizujText(k)] = v;

  let idx = -1;
  let mapa: Partial<Record<PoleSuboru, number>> = {};
  for (let i = 0; i < Math.min(tabulka.length, 10); i++) {
    const m: Partial<Record<PoleSuboru, number>> = {};
    (tabulka[i] ?? []).forEach((bunka, j) => {
      const pole = aliasy[normalizujText(bunka)];
      if (pole && m[pole] === undefined) m[pole] = j;
    });
    if (m.druh !== undefined && m.sablona !== undefined) {
      idx = i;
      mapa = m;
      break;
    }
  }
  if (idx < 0) {
    return {
      riadky: [],
      chyba: "V súbore chýba stĺpec „Druh dokladu“ alebo „Šablóna čísla“. Najjednoduchšie je stiahnuť si export a upraviť ho.",
    };
  }

  const bunka = (r: string[], pole: PoleSuboru) =>
    mapa[pole] === undefined ? "" : String(r[mapa[pole]!] ?? "").trim();
  const riadky: RiadokSuboru[] = [];
  for (let i = idx + 1; i < tabulka.length; i++) {
    const r = tabulka[i] ?? [];
    if (!r.some((x) => String(x ?? "").trim())) continue;
    const druhText = bunka(r, "druh");
    riadky.push({
      riadok: i + 1,
      id: bunka(r, "id"),
      druh: druhZTextu(druhText, aliasyDruhov) ?? druhText,
      nazov: bunka(r, "nazov"),
      sablona: bunka(r, "sablona"),
      start_from: bunka(r, "start_from"),
      predvoleny: bunka(r, "predvoleny"),
      aktivny: bunka(r, "aktivny"),
    });
  }
  return { riadky, chyba: null };
}

const ANO = new Set(["ano", "a", "ja", "j", "yes", "y", "true", "1", "x", "pravda", "wahr"]);
const NIE = new Set(["nie", "n", "ne", "nein", "no", "false", "0", "nepravda", "falsch"]);

/** Áno/nie z bunky; `undefined` pre prázdnu, `null` pre nezmysel. */
export function anoNie(v: string): boolean | undefined | null {
  const n = normalizujText(v);
  if (!n) return undefined;
  if (ANO.has(n)) return true;
  if (NIE.has(n)) return false;
  return null;
}

/** Poradie z bunky: celé číslo 1–999 999; `undefined` pre prázdnu, `null` pre nezmysel. */
export function poradieZBunky(v: string): number | undefined | null {
  const s = String(v ?? "").replace(/[\s  ']/g, "");
  if (!s) return undefined;
  if (!/^\d+([.,]0+)?$/.test(s)) return null;
  const n = Number(s.replace(/[.,]0+$/, ""));
  return Number.isInteger(n) && n >= 1 && n <= 999999 ? n : null;
}

// ─── posledné použité poradie ─────────────────────────────────────────────────

export type Obdobie = { rok: number; mesiac: number };

const escRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Vzor čísel, ktoré šablóna vyrobí v danom období — `like` pre databázu
 * (zúži výber), `regex` vytiahne poradie. Rok a mesiac sú dosadené, takže
 * ročný rad vidí len tento rok a mesačný len tento mesiac — presne ako
 * `faktero_cislo_zo_sablony`.
 */
export function vzorCislaVObdobi(format: string, o: Obdobie): { like: string; regex: RegExp } {
  const rok = String(o.rok);
  const f = normalizujSablonu(format)
    .replace(/\{YYYY\}/g, rok)
    .replace(/\{YY\}/g, rok.slice(2))
    .replace(/\{MM\}/g, String(o.mesiac).padStart(2, "0"));
  const casti = f.split(/(\{N{2,6}\})/);
  const sirka = Math.max(2, ...casti.filter((c) => /^\{N+\}$/.test(c)).map((c) => c.length - 2));
  let like = "";
  let re = "^";
  let prve = true;
  for (const c of casti) {
    if (/^\{N{2,6}\}$/.test(c)) {
      like += "%";
      re += prve ? `(\\d{${sirka},})` : "\\1";
      prve = false;
    } else {
      like += escLike(c);
      re += escRegex(c);
    }
  }
  return { like, regex: new RegExp(`${re}$`) };
}

/** Najvyššie poradie medzi číslami dokladov, ktoré zodpovedajú šablóne v období (0 = žiadne). */
export function najvyssiePoradie(cisla: (string | null)[], format: string, o: Obdobie): number {
  const { regex } = vzorCislaVObdobi(format, o);
  let max = 0;
  for (const c of cisla) {
    const m = regex.exec((c ?? "").trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

export const klucPosledneho = (kind: string, format: string) =>
  `${kind}|${normalizujSablonu(format)}`;

/** Ktoré dvojice druh + šablóna treba pre plán spočítať (len platné riadky). */
export function potrebnePosledne(
  riadky: RiadokSuboru[],
  existujuce: ExistujuciRad[],
): { kind: DruhRadu; format: string }[] {
  const out = new Map<string, { kind: DruhRadu; format: string }>();
  const pridaj = (kind: DruhRadu, format: string) => {
    if (!format || chybaSablony(format)) return;
    out.set(klucPosledneho(kind, format), { kind, format: normalizujSablonu(format) });
  };
  for (const r of riadky) {
    const ex = existujuce.find((e) => r.id && e.id === r.id);
    const kind = ex?.kind ?? ((DRUHY_RADOV as readonly string[]).includes(r.druh) ? (r.druh as DruhRadu) : null);
    if (!kind) continue;
    pridaj(kind, r.sablona || ex?.format || "");
  }
  return [...out.values()];
}

// ─── plán importu ─────────────────────────────────────────────────────────────

export type ExistujuciRad = {
  id: string;
  kind: DruhRadu;
  name: string;
  format: string;
  is_default: boolean;
  active: boolean;
  start_from: number;
};

export type StavRiadku = "novy" | "zmena" | "bez_zmeny" | "chyba";

/** Text na preklad + hodnoty zástupných symbolov. */
export type Hlasenie = { text: string; parametre?: Record<string, string | number> };

export type ZmenaPola = {
  pole: "nazov" | "sablona" | "start_from" | "predvoleny" | "aktivny";
  stare: string | number | boolean;
  nove: string | number | boolean;
};

export type PolozkaPlanu = {
  riadok: number;
  stav: StavRiadku;
  chyba?: Hlasenie;
  /** Existujúci rad, ktorého sa riadok týka. */
  id?: string;
  kind?: DruhRadu;
  name: string;
  format: string;
  start_from: number;
  is_default: boolean;
  active: boolean;
  /** Najvyššie poradie s dokladom v tomto období (0 = žiadne). */
  posledne: number;
  zmeny: ZmenaPola[];
  /** Názov radu, ktorý pri uložení prestane byť predvolený. */
  beriePredvoleny?: string;
};

export type PlanImportuRadov = {
  polozky: PolozkaPlanu[];
  pocty: Record<StavRiadku, number>;
};

const chyba = (text: string, parametre?: Hlasenie["parametre"]): Hlasenie => ({ text, parametre });

/**
 * Čo import urobí s každým riadkom.
 *
 * Párovanie: najprv podľa ID (ak je v súbore a patrí firme), potom podľa
 * druhu + šablóny (pri zhode viacerých radov ešte podľa názvu). Nespárovaný
 * riadok založí nový rad.
 */
export function naplanujImportRadov(
  riadky: RiadokSuboru[],
  existujuce: ExistujuciRad[],
  posledne: Map<string, number> | Record<string, number>,
): PlanImportuRadov {
  const posl = (kind: string, format: string) => {
    const k = klucPosledneho(kind, format);
    return (posledne instanceof Map ? posledne.get(k) : posledne[k]) ?? 0;
  };
  const pouziteId = new Set<string>();
  const noveKluce = new Set<string>();
  const polozky: PolozkaPlanu[] = [];

  for (const r of riadky) {
    const p: PolozkaPlanu = {
      riadok: r.riadok,
      stav: "chyba",
      name: r.nazov,
      format: r.sablona,
      start_from: 1,
      is_default: false,
      active: true,
      posledne: 0,
      zmeny: [],
    };
    polozky.push(p);
    const zle = (h: Hlasenie) => {
      p.stav = "chyba";
      p.chyba = h;
    };

    // Druh dokladu
    const exPodlaId = r.id ? existujuce.find((e) => e.id === r.id.trim()) : undefined;
    if (!r.druh && !exPodlaId) {
      zle(chyba("Chýba druh dokladu."));
      continue;
    }
    const kind = r.druh
      ? (DRUHY_RADOV as readonly string[]).includes(r.druh)
        ? (r.druh as DruhRadu)
        : null
      : exPodlaId!.kind;
    if (!kind) {
      zle(chyba("Neznámy druh dokladu „{druh}“.", { druh: r.druh }));
      continue;
    }
    p.kind = kind;
    if (exPodlaId && exPodlaId.kind !== kind) {
      zle(chyba("Druh dokladu sa pri existujúcom rade meniť nedá — pre iný druh pridajte nový riadok bez ID."));
      continue;
    }

    // Šablóna
    const surova = r.sablona.trim() || exPodlaId?.format || "";
    if (!surova) {
      zle(chyba("Chýba šablóna čísla."));
      continue;
    }
    const zlaSablona = chybaSablony(surova);
    if (zlaSablona) {
      zle(chyba(zlaSablona));
      continue;
    }
    const format = normalizujSablonu(surova);
    p.format = format;

    // Párovanie
    let ex = exPodlaId;
    if (!ex) {
      let kandidati = existujuce.filter(
        (e) => e.kind === kind && normalizujSablonu(e.format) === format,
      );
      if (kandidati.length > 1 && r.nazov.trim()) {
        const n = r.nazov.trim().toLowerCase();
        kandidati = kandidati.filter((e) => e.name.trim().toLowerCase() === n);
      }
      if (kandidati.length > 1) {
        zle(chyba("Rad sa nedá jednoznačne spárovať — tú istú šablónu má viac radov. Doplňte stĺpec ID z exportu."));
        continue;
      }
      ex = kandidati[0];
    }
    if (ex) p.id = ex.id;

    // Názov
    const name = r.nazov.trim() || ex?.name || "";
    if (!name) {
      zle(chyba("Chýba názov radu."));
      continue;
    }
    if (name.length > 60) {
      zle(chyba("Názov radu je pridlhý — najviac 60 znakov."));
      continue;
    }
    p.name = name;

    // Opakovanie v súbore
    if (ex) {
      if (pouziteId.has(ex.id)) {
        zle(chyba("Tento rad je v súbore viackrát — ponechajte len jeden riadok."));
        continue;
      }
      pouziteId.add(ex.id);
    } else {
      const k = `${kind}|${format}|${name.toLowerCase()}`;
      if (noveKluce.has(k)) {
        zle(chyba("Tento rad je v súbore viackrát — ponechajte len jeden riadok."));
        continue;
      }
      noveKluce.add(k);
    }

    // Áno/nie
    const predv = anoNie(r.predvoleny);
    if (predv === null) {
      zle(chyba("Neplatná hodnota „{hodnota}“ v stĺpci Predvolený — napíšte áno alebo nie.", { hodnota: r.predvoleny }));
      continue;
    }
    const akt = anoNie(r.aktivny);
    if (akt === null) {
      zle(chyba("Neplatná hodnota „{hodnota}“ v stĺpci Aktívny — napíšte áno alebo nie.", { hodnota: r.aktivny }));
      continue;
    }
    p.is_default = predv ?? ex?.is_default ?? false;
    p.active = akt ?? ex?.active ?? true;

    // Počítadlo — nikdy pod posledné použité poradie.
    const zadane = poradieZBunky(r.start_from);
    if (zadane === null) {
      zle(chyba("Začať od poradia musí byť celé číslo od 1 do 999999 (zadané „{hodnota}“).", { hodnota: r.start_from }));
      continue;
    }
    p.posledne = posl(kind, format);
    const inaSablona = !!ex && normalizujSablonu(ex.format) !== format;
    let startFrom = zadane ?? ex?.start_from ?? 1;
    const meniCislovanie = !ex || inaSablona || startFrom !== ex.start_from;
    if (meniCislovanie && p.posledne > 0 && startFrom <= p.posledne) {
      if (zadane === undefined) {
        // Prázdna bunka: rad nadviaže za posledným vydaným číslom sám.
        startFrom = p.posledne + 1;
      } else {
        p.start_from = startFrom;
        zle(
          chyba(
            "Číslo nižšie ako posledné použité: {od} ≤ {posledne}. Ďalší doklad by dostal poradie, ktoré už nesie vystavený doklad — zadajte aspoň {min}.",
            { od: startFrom, posledne: p.posledne, min: p.posledne + 1 },
          ),
        );
        continue;
      }
    }
    p.start_from = startFrom;

    if (ex) {
      const z: ZmenaPola[] = [];
      if (ex.name !== name) z.push({ pole: "nazov", stare: ex.name, nove: name });
      if (inaSablona) z.push({ pole: "sablona", stare: ex.format, nove: format });
      if (ex.start_from !== startFrom) z.push({ pole: "start_from", stare: ex.start_from, nove: startFrom });
      if (ex.is_default !== p.is_default) z.push({ pole: "predvoleny", stare: ex.is_default, nove: p.is_default });
      if (ex.active !== p.active) z.push({ pole: "aktivny", stare: ex.active, nove: p.active });
      p.zmeny = z;
      p.stav = z.length ? "zmena" : "bez_zmeny";
    } else {
      p.stav = "novy";
    }
  }

  // Názov musí byť v rámci druhu jedinečný (ako index number_series_meno_idx).
  const meniace = new Set(polozky.filter((p) => p.stav !== "chyba" && p.id).map((p) => p.id!));
  const obsadene = new Map<string, string>();
  for (const e of existujuce) {
    if (!meniace.has(e.id)) obsadene.set(`${e.kind}|${e.name.trim().toLowerCase()}`, e.id);
  }
  for (const p of polozky) {
    if (p.stav === "chyba") continue;
    const k = `${p.kind}|${p.name.trim().toLowerCase()}`;
    const vlastnik = p.id ?? `riadok:${p.riadok}`;
    const ine = obsadene.get(k);
    if (ine && ine !== vlastnik) {
      p.stav = "chyba";
      p.chyba = chyba("Rad s názvom „{nazov}“ už pre tento druh je.", { nazov: p.name });
      continue;
    }
    obsadene.set(k, vlastnik);
  }

  // Predvolený rad na druh môže byť len jeden.
  for (const d of DRUHY_RADOV) {
    const predvolene = polozky.filter((p) => p.stav !== "chyba" && p.kind === d && p.is_default);
    if (predvolene.length > 1) {
      for (const p of predvolene) {
        p.stav = "chyba";
        p.chyba = chyba("Predvolený rad môže byť na druh dokladu len jeden — v súbore ich je pre tento druh {n}.", {
          n: predvolene.length,
        });
      }
      continue;
    }
    const novy = predvolene[0];
    if (!novy) continue;
    const doterajsi = existujuce.find((e) => e.kind === d && e.is_default && e.id !== novy.id);
    if (!doterajsi) continue;
    // Doterajší predvolený, ktorého riadok v súbore predvolenosť nezrušil, ju stratí.
    const jehoRiadok = polozky.find((p) => p.id === doterajsi.id && p.stav !== "chyba");
    if (jehoRiadok?.is_default) continue;
    if (novy.stav === "chyba") continue;
    novy.beriePredvoleny = doterajsi.name;
  }

  const pocty: Record<StavRiadku, number> = { novy: 0, zmena: 0, bez_zmeny: 0, chyba: 0 };
  for (const p of polozky) pocty[p.stav]++;
  return { polozky, pocty };
}

/** Chybové riadky na stiahnutie — dajú sa opraviť a nahrať znova. */
export function chybyRadovDoTabulky(
  riadky: RiadokSuboru[],
  plan: PlanImportuRadov,
  preloz: (h: Hlasenie) => string = (h) => h.text,
): string[][] {
  const podla = new Map(riadky.map((r) => [r.riadok, r]));
  return [
    ["Riadok", "ID", "Druh dokladu", "Názov radu", "Šablóna čísla", "Začať od poradia", "Predvolený", "Aktívny", "Chyba"],
    ...plan.polozky
      .filter((p) => p.stav === "chyba")
      .map((p) => {
        const r = podla.get(p.riadok);
        return [
          String(p.riadok),
          r?.id ?? "",
          r?.druh ?? "",
          r?.nazov ?? "",
          r?.sablona ?? "",
          r?.start_from ?? "",
          r?.predvoleny ?? "",
          r?.aktivny ?? "",
          p.chyba ? preloz(p.chyba) : "",
        ];
      }),
  ];
}
