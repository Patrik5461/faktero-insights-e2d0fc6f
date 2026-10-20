/**
 * Referenčné úrokové sadzby — čítanie zdrojov (čistá časť, bez siete).
 *
 * Zdroje, ktoré sú verejné, zadarmo a strojovo čitateľné:
 * - **EURIBOR** — ECB Data Portal, dataset FM, len **mesačný priemer**
 *   (`FM.M.U2.EUR.RT.MM.EURIBOR1MD_.HSTA` …). Denné hodnoty publikuje EMMI
 *   a ich ďalšie šírenie na komerčné účely potrebuje licenciu EMMI, preto sa
 *   neberú. Mesačný priemer je pri fixingu k dňu len odhad.
 * - **€STR** — ECB Data Portal, dataset EST, denne (`EST.B.EU000A2X2A25.WT`).
 * - **PRIBOR** — ČNB, ročný TXT so všetkými fixingmi, denne (s oneskorením
 *   niekoľkých pracovných dní, ktoré si vyžaduje správca indexu).
 */
import type { ReferencnaSadzba, ReferencnyIndex } from "./pohybliva-sadzba";

export const ECB_API = "https://data-api.ecb.europa.eu/service/data";

/** Kľúče sérií ECB pre jednotlivé indexy. */
export const ECB_SERIE: Partial<
  Record<ReferencnyIndex, { dataset: string; kluc: string; druh: ReferencnaSadzba["druh"] }>
> = {
  EURIBOR_1M: { dataset: "FM", kluc: "M.U2.EUR.RT.MM.EURIBOR1MD_.HSTA", druh: "mesacny_priemer" },
  EURIBOR_3M: { dataset: "FM", kluc: "M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA", druh: "mesacny_priemer" },
  EURIBOR_6M: { dataset: "FM", kluc: "M.U2.EUR.RT.MM.EURIBOR6MD_.HSTA", druh: "mesacny_priemer" },
  EURIBOR_12M: { dataset: "FM", kluc: "M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA", druh: "mesacny_priemer" },
  ESTR: { dataset: "EST", kluc: "B.EU000A2X2A25.WT", druh: "denna" },
};

export function ecbUrl(index: ReferencnyIndex, od: string): string | null {
  const s = ECB_SERIE[index];
  if (!s) return null;
  const start = s.druh === "mesacny_priemer" ? od.slice(0, 7) : od.slice(0, 10);
  return `${ECB_API}/${s.dataset}/${s.kluc}?format=csvdata&startPeriod=${start}`;
}

export const CNB_PRIBOR_ROK =
  "https://www.cnb.cz/cs/financni-trhy/penezni-trh/pribor/fixing-urokovych-sazeb-na-mezibankovnim-trhu-depozit-pribor/rok.txt";

/** Riadok CSV s úvodzovkami — ECB dáva do niektorých stĺpcov čiarky. */
function riadokCsv(r: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < r.length; i++) {
    const c = r[i]!;
    if (q) {
      if (c === '"' && r[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** CSV z ECB Data Portal (`format=csvdata`) → hodnoty indexu. */
export function citajEcbCsv(
  text: string,
  index: ReferencnyIndex,
  druh: ReferencnaSadzba["druh"],
): ReferencnaSadzba[] {
  const riadky = text.split(/\r?\n/).filter((r) => r.trim());
  if (riadky.length < 2) return [];
  const hlavicka = riadkyCsvHlavicka(riadky[0]!);
  const iObd = hlavicka.indexOf("TIME_PERIOD");
  const iHod = hlavicka.indexOf("OBS_VALUE");
  if (iObd < 0 || iHod < 0) return [];
  const vysledok: ReferencnaSadzba[] = [];
  for (const r of riadky.slice(1)) {
    const st = riadokCsv(r);
    const obd = (st[iObd] ?? "").trim();
    const hod = Number((st[iHod] ?? "").trim());
    if (!obd || !Number.isFinite(hod) || (st[iHod] ?? "").trim() === "") continue;
    const datum = /^\d{4}-\d{2}$/.test(obd) ? `${obd}-01` : obd.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) continue;
    vysledok.push({ index, druh, datum, hodnota: hod });
  }
  return vysledok;
}

function riadkyCsvHlavicka(r: string): string[] {
  return riadokCsv(r).map((s) => s.trim());
}

/** Splatnosti PRIBOR v ročnom súbore ČNB → naše indexy. */
const PRIBOR_SPLATNOSTI: Record<string, ReferencnyIndex> = {
  "1 měsíc": "PRIBOR_1M",
  "3 měsíce": "PRIBOR_3M",
  "6 měsíců": "PRIBOR_6M",
  "1 rok": "PRIBOR_1R",
};

/**
 * Ročný súbor PRIBOR z ČNB:
 *
 *   |1 den||7 dní||14 dní||1 měsíc||…||1 rok|
 *   Datum|PRIBID|PRIBOR|PRIBID|PRIBOR|…
 *   02.01.2026||3,50||3,51||…
 *
 * Splatnosť v prvom riadku stojí na pozícii PRIBID, hodnota PRIBOR je hneď
 * za ňou.
 */
export function citajCnbPriborRok(text: string): ReferencnaSadzba[] {
  const riadky = text.split(/\r?\n/).filter((r) => r.trim());
  if (riadky.length < 3) return [];
  const splatnosti = riadky[0]!.split("|");
  const stlpce: { stlpec: number; index: ReferencnyIndex }[] = [];
  splatnosti.forEach((s, i) => {
    const idx = PRIBOR_SPLATNOSTI[s.trim()];
    if (idx) stlpce.push({ stlpec: i + 1, index: idx });
  });
  const vysledok: ReferencnaSadzba[] = [];
  for (const r of riadky.slice(2)) {
    const p = r.split("|");
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((p[0] ?? "").trim());
    if (!m) continue;
    const datum = `${m[3]}-${m[2]}-${m[1]}`;
    for (const { stlpec, index } of stlpce) {
      const s = (p[stlpec] ?? "").trim().replace(",", ".");
      if (!s) continue;
      const n = Number(s);
      if (Number.isFinite(n)) vysledok.push({ index, druh: "denna", datum, hodnota: n });
    }
  }
  return vysledok;
}
