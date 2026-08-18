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

/** `15.1.2026`, `15. 01. 2026`, `15/01/2026`, `2026-01-15` aj `15.01.26`. */
export function normalizujDatum(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;

  let d: number, m: number, r: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  const nas = /^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4})/.exec(s);
  if (iso) {
    [r, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (nas) {
    [d, m, r] = [Number(nas[1]), Number(nas[2]), Number(nas[3])];
    // Dvojciferný rok je vždy tento vek — bankový výpis z roku 1926 neexistuje.
    if (r < 100) r += 2000;
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

/** Jeden riadok výpisu. Vráti `null`, keď z neho nie je doklad — chýba dátum alebo suma. */
export function normalizujPohyb(r: SurovyPohyb): VypisPohyb | null {
  const datum = normalizujDatum(r.datum ?? r.date ?? r.datum_uctovania);
  const suma = normalizujSumu(r.suma ?? r.amount ?? r.ciastka);
  if (!datum || suma == null || suma === 0) return null;

  return {
    datum,
    suma: Math.abs(suma),
    smer: normalizujSmer(r.smer ?? r.typ ?? r.direction, suma),
    popis: text(r.popis ?? r.description ?? r.text, 200),
    protistrana: text(r.protistrana ?? r.partner ?? r.counterparty, 96),
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

  const pohyby = riadky
    .map((x) => normalizujPohyb((x ?? {}) as SurovyPohyb))
    .filter((x): x is VypisPohyb => x !== null)
    .sort((a, b) => a.datum.localeCompare(b.datum));

  const mena = text(o.mena ?? o.currency, 3);
  return {
    cisloVypisu: text(o.cisloVypisu ?? o.statementNumber ?? o.cislo, 10),
    ucet: text(o.ucet ?? o.account ?? o.iban, 40),
    mena: mena ? mena.toUpperCase() : null,
    datumVypisu:
      normalizujDatum(o.datumVypisu ?? o.dateStatement ?? o.datum_vypisu) ??
      (pohyby.length ? pohyby[pohyby.length - 1].datum : null),
    pohyby,
  };
}
