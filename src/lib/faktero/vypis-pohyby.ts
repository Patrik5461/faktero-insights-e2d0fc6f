/**
 * Prevod riadkov z bankového výpisu do tvaru, ktorý znesie export do Pohody.
 *
 * Je to zámerne čistý súbor bez siete a bez AI: čísla a dátumy z výpisov sú
 * najčastejší zdroj tichých chýb (1.234,56 verzus 1,234.56, mínus až za sumou,
 * dvojciferný rok) a takto sa dajú prejsť testom, nie odhadom nad PDF.
 */
import type { VypisPohyb } from "./export.server";

export type { VypisPohyb };

/** Čo príde z rozpoznávania — všetko je neisté, preto `unknown`. */
export type SurovyPohyb = Record<string, unknown>;

// Bez hraníc slova naschvál: `\b` pred `€` nefunguje, lebo to nie je písmeno.
// Beží to len nad hodnotou, o ktorej už vieme, že má byť číslo.
const MENY = /(EUR|CZK|USD|GBP|Kč|€|\$|£)/gi;

/**
 * Suma aj so znamienkom.
 *
 * Oddeľovač desatín je **ten posledný** z čiarky a bodky — inak by sa
 * `1.234,56` prečítalo ako 1,23 a `1,234.56` ako 1234,56. Osamotený oddeľovač
 * je desatinný len vtedy, keď za ním zostávajú nanajvýš dve číslice; `1.234`
 * je tisícka, nie jedna celá dvestotridsaťštyri.
 */
export function normalizujSumu(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  let s = String(v ?? "")
    .replace(/[\u00A0\u202F\u2007]/g, " ")
    .replace(MENY, "")
    .trim();
  if (!s) return null;

  // Niektoré banky píšu mínus až za sumu, iné dávajú výdavok do zátvorky.
  let zaporne = false;
  if (/-\s*$/.test(s)) {
    zaporne = true;
    s = s.replace(/-\s*$/, "");
  }
  if (/^\(.*\)$/.test(s)) {
    zaporne = true;
    s = s.slice(1, -1);
  }
  if (/^-/.test(s)) {
    zaporne = true;
    s = s.replace(/^-\s*/, "");
  }
  s = s.replace(/^\+\s*/, "").replace(/\s/g, "");
  if (!/^[\d.,]+$/.test(s)) return null;

  const poslednaCiarka = s.lastIndexOf(",");
  const poslednaBodka = s.lastIndexOf(".");
  const oddelovac = Math.max(poslednaCiarka, poslednaBodka);

  let cislo: string;
  if (oddelovac < 0) {
    cislo = s;
  } else {
    const desatiny = s.length - oddelovac - 1;
    const jedinyVyskyt = poslednaCiarka < 0 || poslednaBodka < 0;
    if (jedinyVyskyt && desatiny > 2) {
      // `1.234` alebo `12,345` — oddeľovač tisícov, nie desatín.
      cislo = s.replace(/[.,]/g, "");
    } else {
      cislo = s.slice(0, oddelovac).replace(/[.,]/g, "") + "." + s.slice(oddelovac + 1);
    }
  }

  const n = Number(cislo);
  if (!Number.isFinite(n)) return null;
  return zaporne ? -n : n;
}

/**
 * `15.1.2026`, `15. 01. 2026`, `15/01/2026`, `2026-01-15` aj `15.01.26`.
 *
 * A tiež `15.08.` — **bez roka**. Veľa bánk píše rok len raz v hlavičke a pri
 * jednotlivých pohyboch nechá deň s mesiacom; kým sa taký dátum zahadzoval,
 * z celého výpisu nezostal ani jeden riadok. Rok sa preto dá dodať zvonka
 * (`hlavicka` je dátum výpisu v tvare `RRRR-MM-DD`).
 */
export function normalizujDatum(v: unknown, hlavicka?: string | null): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;

  let d: number, m: number, r: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  const nas = /^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4})/.exec(s);
  const bezRoku = /^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]?\s*$/.exec(s);
  const zHlavicky = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(hlavicka ?? ""));
  if (iso) {
    [r, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (nas) {
    [d, m, r] = [Number(nas[1]), Number(nas[2]), Number(nas[3])];
    // Dvojciferný rok je vždy tento vek — bankový výpis z roku 1926 neexistuje.
    if (r < 100) r += 2000;
  } else if (bezRoku && zHlavicky) {
    [d, m, r] = [Number(bezRoku[1]), Number(bezRoku[2]), Number(zHlavicky[1])];
    /*
      Januárový výpis nesie aj pohyby z konca decembra. Rok z hlavičky by im
      pridal dvanásť mesiacov navyše — pohyb by skončil v budúcnosti a
      v účtovníctve v zlom období. Opačný smer nastať nemôže: výpis nikdy
      neobsahuje pohyby, ktoré sa ešte nestali.
    */
    if (m - Number(zHlavicky[2]) > 6) r -= 1;
  } else {
    return null;
  }

  if (m < 1 || m > 12 || d < 1 || d > 31 || r < 2000 || r > 2100) return null;
  const den = new Date(Date.UTC(r, m - 1, d));
  // 31. februára prejde cez rozsahy vyššie, ale dátum to nie je.
  if (den.getUTCMonth() !== m - 1 || den.getUTCDate() !== d) return null;
  return `${r}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const PRIJEM = /^(prijem|príjem|credit|kredit|c|cr|d|\+|in|inkaso|pripis|pripísanie)$/i;
const VYDAJ = /^(vydaj|výdaj|debit|debet|w|dr|-|out|odpis|odpísanie|platba)$/i;

/**
 * Smer pohybu.
 *
 * Prednosť má to, čo výpis píše slovom; znamienko sumy je až druhé v poradí.
 * Pozor na `D`: v slovenských výpisoch znamená **Dal**, teda príjem, kým v
 * anglických `D` = debit, teda výdaj. Preto sa jednopísmenové kódy berú len
 * ako pomôcka a keď si so znamienkom protirečia, rozhoduje znamienko.
 */
export function normalizujSmer(surove: unknown, suma: number | null): "prijem" | "vydaj" {
  const s = String(surove ?? "").trim();
  const zoZnamienka = suma != null && suma < 0 ? "vydaj" : "prijem";
  if (!s) return zoZnamienka;
  if (s.length === 1 && suma != null && suma !== 0) return zoZnamienka;
  if (PRIJEM.test(s)) return "prijem";
  if (VYDAJ.test(s)) return "vydaj";
  return zoZnamienka;
}

function text(v: unknown, max = 200): string | null {
  const s = String(v ?? "").trim();
  if (!s || s.toLowerCase() === "null") return null;
  return s.slice(0, max);
}

function symbol(v: unknown, max: number): string | null {
  const s = String(v ?? "").replace(/\D/g, "");
  return s ? s.slice(0, max) : null;
}

/*
  Platba kartou samostatné pole s protistranou nemá — obchodník je len v popise
  za štítkom. ČSOB mu hovorí „Miesto", iné banky „Obchodník" alebo „Terminál".
  Kým sa to nečítalo, každá karta skončila v Pohode ako pohyb bez firmy
  a účtovník ju dopisoval ručne.
*/
const ZA_STITKOM =
  /(?:^|[\n;,]|\s)(?:miesto|obchodn[ií]k|termin[áa]l|predajca|merchant|location)\s*[:–-]\s*([^\n;]+)/i;

/** Ďalší stĺpec či štítok názov ukončuje — inak by sa doň zliala suma aj kurz. */
const KONIEC_NAZVU =
  /\s{2,}|\s(?:d[áa]tum|suma|[čc]iastka|kurz|karta|ref|vs|ks|ss|iban)\s*[:–-]/i;

/**
 * Protistrana vytiahnutá z popisu, keď ju výpis ako pole neuvádza.
 *
 * Napr. z „Platba kartou, Miesto: BOLT.EU BUDAPEST" ostane `BOLT.EU BUDAPEST`.
 */
export function protistranaZPopisu(popis: unknown): string | null {
  const m = ZA_STITKOM.exec(String(popis ?? ""));
  if (!m) return null;
  const koniec = KONIEC_NAZVU.exec(m[1]);
  // Bodku na konci nechávam — „s.r.o." je celý názov, nie preklep.
  const s = (koniec ? m[1].slice(0, koniec.index) : m[1]).trim().replace(/[,;]+$/, "");
  return s ? s.slice(0, 96) : null;
}

/** Jeden riadok výpisu. Vráti `null`, keď z neho nie je doklad — chýba dátum alebo suma. */
export function normalizujPohyb(r: SurovyPohyb, hlavicka?: string | null): VypisPohyb | null {
  const datum = normalizujDatum(r.datum ?? r.date ?? r.datum_uctovania, hlavicka);
  const suma = normalizujSumu(r.suma ?? r.amount ?? r.ciastka);
  if (!datum || suma == null || suma === 0) return null;

  const popis = text(r.popis ?? r.description ?? r.text, 200);

  return {
    datum,
    suma: Math.abs(suma),
    smer: normalizujSmer(r.smer ?? r.typ ?? r.direction, suma),
    popis,
    protistrana:
      text(r.protistrana ?? r.partner ?? r.counterparty ?? r.miesto ?? r.obchodnik, 96) ??
      protistranaZPopisu(popis),
    protiucet: text(r.protiucet ?? r.ucet ?? r.account, 40),
    vs: symbol(r.vs ?? r.variabilny_symbol ?? r.variableSymbol, 20),
    ks: symbol(r.ks ?? r.konstantny_symbol ?? r.constantSymbol, 4),
    ss: symbol(r.ss ?? r.specificky_symbol ?? r.specificSymbol, 16),
  };
}

export type Vypis = {
  cisloVypisu: string | null;
  ucet: string | null;
  mena: string | null;
  datumVypisu: string | null;
  pohyby: VypisPohyb[];
};

/**
 * Celý výpis z odpovede rozpoznávania.
 *
 * Riadky, z ktorých doklad nie je, sa ticho vynechajú — v odpovedi bývajú aj
 * súčtové riadky („Obraty spolu") a tie do účtovníctva nepatria. Dátum výpisu
 * dopĺňa posledný pohyb: podľa neho Pohoda zaraďuje doklad do obdobia a keby
 * chýbal, účtovník ho dopisuje ku každému riadku ručne.
 */
export function normalizujVypis(surove: unknown): Vypis {
  const o = (surove ?? {}) as Record<string, unknown>;
  const riadky = Array.isArray(o.pohyby)
    ? o.pohyby
    : Array.isArray(o.transactions)
      ? o.transactions
      : Array.isArray(surove)
        ? (surove as unknown[])
        : [];

  /*
    Dátum výpisu sa číta ako prvý — nie kvôli hlavičke, ale kvôli riadkom:
    keď pri pohyboch chýba rok, berie sa práve odtiaľto.
  */
  const datumHlavicky = normalizujDatum(o.datumVypisu ?? o.dateStatement ?? o.datum_vypisu);

  const pohyby = riadky
    .map((x) => normalizujPohyb((x ?? {}) as SurovyPohyb, datumHlavicky))
    .filter((x): x is VypisPohyb => x !== null)
    .sort((a, b) => a.datum.localeCompare(b.datum));

  const mena = text(o.mena ?? o.currency, 3);
  return {
    cisloVypisu: text(o.cisloVypisu ?? o.statementNumber ?? o.cislo, 10),
    ucet: text(o.ucet ?? o.account ?? o.iban, 40),
    mena: mena ? mena.toUpperCase() : null,
    datumVypisu: datumHlavicky ?? (pohyby.length ? pohyby[pohyby.length - 1].datum : null),
    pohyby,
  };
}

/**
 * Rozdelenie textu výpisu na kusy, ktoré model stihne prečítať naraz.
 *
 * Jedno volanie nad štyridsiatimi pohybmi píše odpoveď aj niekoľko minút a
 * požiadavka sa medzitým pretrhne — v prehliadači z toho ostane „Failed to
 * fetch". Kusy sa preto čítajú súbežne a čakať treba len na ten najpomalší.
 *
 * Delí sa **po riadkoch**, nikdy uprostred; hlavička (prvé riadky s číslom
 * výpisu a účtom) ide do každého kusa, inak by druhý kus nevedel, čí výpis to je.
 */
export function rozdelVypis(text: string, maxZnakov = 6000, hlavickaRiadkov = 6): string[] {
  const riadky = text.split(/\r?\n/);
  if (text.length <= maxZnakov) return [text];

  const hlavicka = riadky.slice(0, hlavickaRiadkov).join("\n");
  const kusy: string[] = [];
  let teraz: string[] = [];
  let dlzka = 0;

  for (const r of riadky.slice(hlavickaRiadkov)) {
    if (dlzka + r.length > maxZnakov && teraz.length) {
      kusy.push(`${hlavicka}\n${teraz.join("\n")}`);
      teraz = [];
      dlzka = 0;
    }
    teraz.push(r);
    dlzka += r.length + 1;
  }
  if (teraz.length) kusy.push(`${hlavicka}\n${teraz.join("\n")}`);
  return kusy;
}

/**
 * Zliatie výsledkov z jednotlivých kusov.
 *
 * Hlavička je v každom kuse tá istá, takže sa berie prvá vyplnená. Pohyby sa
 * spájajú a **zhodné sa zahadzujú** — hlavička sa kusom opakuje a model z nej
 * občas vyrobí pohyb druhýkrát.
 */
export function zlejVypisy(casti: Vypis[]): Vypis {
  const prve = (vyber: (v: Vypis) => string | null) =>
    casti.map(vyber).find((x) => x != null && x !== "") ?? null;

  const videne = new Set<string>();
  const pohyby: VypisPohyb[] = [];
  for (const c of casti) {
    for (const p of c.pohyby) {
      const kluc = [p.datum, p.suma, p.smer, p.vs ?? "", p.popis ?? ""].join("|");
      if (videne.has(kluc)) continue;
      videne.add(kluc);
      pohyby.push(p);
    }
  }
  pohyby.sort((a, b) => a.datum.localeCompare(b.datum));

  return {
    cisloVypisu: prve((v) => v.cisloVypisu),
    ucet: prve((v) => v.ucet),
    mena: prve((v) => v.mena),
    datumVypisu:
      prve((v) => v.datumVypisu) ?? (pohyby.length ? pohyby[pohyby.length - 1].datum : null),
    pohyby,
  };
}
