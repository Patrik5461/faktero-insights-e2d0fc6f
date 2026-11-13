/**
 * Jedno pravidlo DPH pre prijaté doklady (prijatá faktúra aj bloček).
 *
 * Patrik 13. 11. 2026: „Nedovoľ prepisovať zákonné sadzby DPH.“ Prenos
 * z Doklada a vyťaženie z PDF ukladali DPH, ktorej pomer k základu nebol
 * žiadnou zákonnou sadzbou (30,5 %, 17,92 %, 3,17 % …) — a takú daň potom
 * nevie správne vykázať priznanie, KV ani Pohoda.
 *
 * Pravidlo:
 *  - DPH je v rozpise po sadzbách `[{sadzba, zaklad, dph, vat_category?, pdp?}]`,
 *    sadzba je zákonná pre krajinu firmy a deň dodania (SK od 2025 23/19/5/0,
 *    do 2024 20/10/0; CZ od 2024 21/12/0, predtým aj 15/10),
 *  - `dph` riadku = základ × sadzba / 100 (tolerancia na zaokrúhlenie),
 *    prenesenie, oslobodené a „nie je predmetom“ majú daň 0,
 *  - súčty rozpisu = hlavička (základ a DPH dokladu),
 *  - bez rozpisu musí byť pomer DPH k základu zákonnou sadzbou — zmiešané
 *    sadzby (5 % + 23 %) bez rozpisu neprejdú.
 *
 * Záporný riadok je odpočet zdanenej zálohy alebo dobropis; môže niesť
 * ktorúkoľvek sadzbu, ktorá v krajine platila (záloha z roku 2024 sa
 * odpočítava v 20 % aj na faktúre z roku 2025).
 *
 * Rovnaké pravidlo stráži databáza spúšťačom
 * (`supabase/migrations/20261113120000_dph_zakonne_sadzby.sql`, chyba
 * „FAKTERO_DPH: …“). Spúšťač má na riadku voľnejšiu toleranciu (0,10 €),
 * lebo nevie počet položiek; server kontroluje touto funkciou prísnejšie.
 *
 * Čistá logika bez I/O.
 */
import { jeZnamaSadzba, krajinaDane, sadzbyKrajiny, type KrajinaDane } from "@/lib/faktero/vat-rates";
import { sadzbyStatuSHistoriou, statEu } from "@/lib/faktero/sadzby-eu";

export type RiadokDph = {
  sadzba: number;
  zaklad: number;
  dph: number;
  vat_category?: string | null;
  pdp?: boolean;
};

export type ChybaDph = { kod: "sadzba" | "dph" | "hlavicka" | "chyba_rozpis"; text: string };

/** Tolerancia súčtu rozpisu voči hlavičke. */
export const TOLERANCIA_HLAVICKY = 0.02;
/** Tolerancia pomeru DPH k základu pri doklade bez rozpisu (percentuálne body). */
export const TOLERANCIA_POMERU_PB = 0.3;

const cislo = (v: unknown): number => {
  if (v == null || v === "") return 0;
  const n = Number(typeof v === "string" ? v.replace(",", ".") : v);
  return Number.isFinite(n) ? n : 0;
};
const centy = (n: number) => Math.round((n + Number.EPSILON * Math.sign(n)) * 100) / 100;
const sedi = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol + 1e-9;
const fmt = (n: number) =>
  centy(n).toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtSadzba = (n: number) => String(n).replace(".", ",");
const platnyDen = (den?: string | null): string | null => {
  const d = String(den ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
};

/** Všetky sadzby, ktoré v krajine niekedy platili (vrátane 0). */
function vsetkyZname(krajina: KrajinaDane): number[] {
  const kandidati = [0, 5, 7, 10, 12, 15, 16, 19, 20, 21, 23];
  return kandidati.filter((s) => jeZnamaSadzba(s, krajina));
}

/**
 * Zákonné sadzby pre krajinu a deň (YYYY-MM-DD), vzostupne, vrátane 0.
 * Bez dňa všetko, čo v krajine niekedy platilo — nevieme, kedy sa dodávalo,
 * a historickú sadzbu preto nemôžeme vylúčiť.
 */
export function zakonneSadzby(krajina: "SK" | "CZ" | "DE", den?: string | null): number[] {
  const d = platnyDen(den);
  const s = d ? sadzbyKrajiny(krajina, d) : vsetkyZname(krajina);
  return [...new Set([...s, 0])].sort((a, b) => a - b);
}

/** DPH riadku zo základu a sadzby (zaokrúhlené na centy). */
export function dphZoZakladu(zaklad: number, sadzba: number): number {
  return centy((cislo(zaklad) * cislo(sadzba)) / 100);
}

/** Tolerancia DPH na riadok: 0,02 €, pri zaokrúhľovaní po položkách 0,01 € × položky, najviac 0,10 €. */
export function toleranciaRiadku(poloziek?: number | null): number {
  const n = Math.floor(cislo(poloziek));
  if (n <= 2) return 0.02;
  return Math.min(0.1, centy(0.01 * n));
}

/** Riadok bez dane: prenesenie, oslobodené, nie je predmetom. */
function jeBezDane(r: RiadokDph): boolean {
  const k = String(r.vat_category ?? "");
  return r.pdp === true || k === "reverse_charge" || k === "exempt" || k === "out_of_scope";
}

/**
 * Sadzby povolené pre dodávateľa z inej krajiny, než je krajina firmy:
 * zahraničná DPH (hotel v Rakúsku, palivo v Maďarsku) nesie sadzbu štátu
 * dodávateľa. Pre štát EÚ jeho súčasné aj historické (2023–2026) a
 * regionálne sadzby — dátum dodania na bločku býva nepresný a sadzby štátov
 * sa menia (FI 24 → 25,5 % 9/2024, EE 22 → 24 % 7/2025, RO 19 → 21 % 8/2025).
 * Pre krajinu mimo tabuľky null (sadzba sa nekontroluje, len výpočet a súčty).
 *
 * Spúšťač v databáze pri zahraničnom dodávateľovi sadzbu nekontroluje vôbec
 * (nemá tabuľku štátov EÚ); server je tu prísnejší, ale nikdy neodmietne
 * sadzbu, ktorú štát v tom období mal.
 */
function sadzbyDodavatela(
  krajinaFirmy: KrajinaDane,
  krajinaDodavatela: string | null | undefined,
  den: string | null,
): number[] | null | undefined {
  const k = String(krajinaDodavatela ?? "").trim().toUpperCase();
  if (!k || k === krajinaFirmy) return undefined;
  if (k === "SK" || k === "CZ" || k === "DE") return zakonneSadzby(k, den);
  if (statEu(k)) return [...new Set([0, ...sadzbyStatuSHistoriou(k)])].sort((a, b) => a - b);
  return null;
}

/** Krajina z prefixu IČ DPH (SK2020…, ATU…, EL… = GR); bez platného prefixu null. */
export function krajinaZIcDph(icDph: string | null | undefined): string | null {
  const ic = String(icDph ?? "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9A-Z]{2,}/.test(ic)) return null;
  const p = ic.slice(0, 2);
  return p === "EL" ? "GR" : p;
}

/**
 * Krajina dodávateľa pre kontrolu DPH: uložená `supplier_country`
 * (ISO kód), inak prefix IČ DPH. Bločky majú `supplier_country` takmer
 * vždy prázdnu — bez odvodenia z IČ DPH by maďarské palivo (27 %) neprešlo.
 * Rovnako robí spúšťač (`faktero_krajina_dodavatela`).
 */
export function krajinaDodavatelaDph(
  country: string | null | undefined,
  icDph: string | null | undefined,
): string | null {
  const k = String(country ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(k)) return k === "EL" ? "GR" : k;
  return krajinaZIcDph(icDph);
}

/* ---------------------------------------------------------------------------
   Zaokrúhlenie celkovej sumy (haliérové/centové). Hlavička: základ a DPH =
   súčty rozpisu; „celkom“ smie byť od základu + DPH odlišná o zaokrúhlenie.
   purchase_invoices nemá stĺpec na zaokrúhlenie — odvodzuje sa ako rozdiel.
--------------------------------------------------------------------------- */

/** Najväčšie povolené zaokrúhlenie celkovej sumy v mene dokladu (CZK 1 Kč, HUF 5 Ft, inak 0,50). */
export function maxZaokruhlenie(mena?: string | null): number {
  const m = String(mena ?? "").trim().toUpperCase();
  if (m === "CZK") return 1;
  if (m === "HUF") return 5;
  return 0.5;
}

/** Zaokrúhlenie = celkom − (základ + DPH), na centy. */
export function zaokruhlenieDokladu(celkom: unknown, zaklad: unknown, dph: unknown): number {
  return centy(cislo(celkom) - cislo(zaklad) - cislo(dph));
}

/** Je rozdiel celkovej sumy voči základ + DPH v medziach zaokrúhlenia? */
export function jePovoleneZaokruhlenie(rozdiel: number, mena?: string | null): boolean {
  return Math.abs(cislo(rozdiel)) <= maxZaokruhlenie(mena) + 1e-9;
}

/**
 * Skontroluje rozpis a hlavičku; [] = v poriadku.
 *
 * `zaklad` a `dph` sú hlavička dokladu (pri bločku `net_amount`, `vat_amount`),
 * znamienko ako v databáze (dobropis záporný). `den` = deň dodania, inak
 * vystavenia. `poloziek` zvýši toleranciu riadku pri zaokrúhľovaní po položkách.
 * `krajinaDodavatela` (ISO kód, inak z prefixu `icDphDodavatela`) — zahraničný
 * dodávateľ smie mať sadzby svojho štátu.
 */
export function skontrolujDph(v: {
  rozpis: RiadokDph[] | null;
  zaklad: number;
  dph: number;
  krajina: "SK" | "CZ" | "DE";
  den?: string | null;
  poloziek?: number;
  krajinaDodavatela?: string | null;
  /** IČ DPH dodávateľa — keď krajina chýba, odvodí sa z jeho prefixu. */
  icDphDodavatela?: string | null;
}): ChybaDph[] {
  const chyby: ChybaDph[] = [];
  const krajina = krajinaDane(v.krajina);
  const den = platnyDen(v.den);
  const zaklad = cislo(v.zaklad);
  const dph = cislo(v.dph);
  const cudzie = sadzbyDodavatela(krajina, krajinaDodavatelaDph(v.krajinaDodavatela, v.icDphDodavatela), den);
  /* null = sadzby nekontrolujeme (krajina mimo tabuľky), inak zoznam povolených. */
  const povolene: number[] | null = cudzie === undefined ? zakonneSadzby(krajina, den) : cudzie;
  const historicke: number[] | null = cudzie === undefined ? zakonneSadzby(krajina, null) : cudzie;
  const jeV = (zoznam: number[], s: number) => zoznam.some((x) => Math.abs(x - s) < 0.001);
  const zoznamText = (zoznam: number[]) => zoznam.map(fmtSadzba).join(", ");

  const rozpis = Array.isArray(v.rozpis) ? v.rozpis : [];
  if (!rozpis.length) {
    if (Math.abs(dph) < 0.005) return chyby;
    if (Math.abs(zaklad) < 0.005) {
      chyby.push({
        kod: "chyba_rozpis",
        text: `Doklad má DPH ${fmt(dph)} bez základu dane — doplňte rozpis DPH po sadzbách.`,
      });
      return chyby;
    }
    if (povolene === null) return chyby;
    const pomer = (dph / zaklad) * 100;
    const zhoda = povolene.some(
      (s) =>
        s > 0 &&
        (Math.abs(pomer - s) <= TOLERANCIA_POMERU_PB + 1e-9 ||
          sedi(dphZoZakladu(zaklad, s), dph, TOLERANCIA_HLAVICKY)),
    );
    if (!zhoda) {
      chyby.push({
        kod: "chyba_rozpis",
        text: `DPH ${fmt(dph)} zo základu ${fmt(zaklad)} je ${fmtSadzba(centy(pomer))} %, a to nie je zákonná sadzba (${zoznamText(povolene)} %). Doplňte rozpis DPH po sadzbách.`,
      });
    }
    return chyby;
  }

  const tol = toleranciaRiadku(v.poloziek);
  let sumaZakladov = 0;
  let sumaDph = 0;
  rozpis.forEach((r, i) => {
    const sadzba = cislo(r?.sadzba);
    const z = cislo(r?.zaklad);
    const d = cislo(r?.dph);
    sumaZakladov += z;
    sumaDph += d;
    const cislo_riadku = rozpis.length > 1 ? `Riadok ${i + 1}: ` : "";

    /* Záporný riadok (odpočet zdanenej zálohy, dobropis) smie niesť aj historickú sadzbu. */
    const zoznam = z < 0 || d < 0 ? historicke : povolene;
    if (zoznam !== null && !jeV(zoznam, sadzba)) {
      chyby.push({
        kod: "sadzba",
        text: `${cislo_riadku}sadzba ${fmtSadzba(sadzba)} % nie je zákonná sadzba DPH (platia ${zoznamText(povolene ?? zoznam)} %).`,
      });
    }

    if (jeBezDane(r)) {
      if (Math.abs(d) >= 0.005) {
        chyby.push({
          kod: "dph",
          text: `${cislo_riadku}plnenie v prenesení, oslobodené alebo mimo predmetu DPH nemôže mať DPH (${fmt(d)}).`,
        });
      }
      return;
    }
    const ocakavana = dphZoZakladu(z, sadzba);
    if (!sedi(ocakavana, d, tol)) {
      chyby.push({
        kod: "dph",
        text: `${cislo_riadku}pri ${fmtSadzba(sadzba)} % zo základu ${fmt(z)} vychádza DPH ${fmt(ocakavana)}, uložená je ${fmt(d)}.`,
      });
    }
  });

  if (!sedi(sumaZakladov, zaklad, TOLERANCIA_HLAVICKY)) {
    chyby.push({
      kod: "hlavicka",
      text: `Súčet základov v rozpise ${fmt(sumaZakladov)} nesedí so sumou bez DPH ${fmt(zaklad)}.`,
    });
  }
  if (!sedi(sumaDph, dph, TOLERANCIA_HLAVICKY)) {
    chyby.push({
      kod: "hlavicka",
      text: `Súčet DPH v rozpise ${fmt(sumaDph)} nesedí s DPH dokladu ${fmt(dph)}.`,
    });
  }
  return chyby;
}

/** Jedna veta pre používateľa (API, hláška). */
export function popisChybDph(chyby: ChybaDph[]): string {
  if (!chyby.length) return "";
  return `DPH nie je po zákonných sadzbách: ${chyby.map((c) => c.text).join(" ")}`;
}

/**
 * Rozpis z uloženého `vat_breakdown` (alebo vstupu API) do tvaru pravidla.
 * Prijíma aj anglické kľúče {rate, base, vat}. Nie pole → null.
 */
export function rozpisPreKontrolu(vatBreakdown: unknown): RiadokDph[] | null {
  if (!Array.isArray(vatBreakdown)) return null;
  return vatBreakdown.map((r: any) => ({
    sadzba: cislo(r?.sadzba ?? r?.rate ?? r?.vat_rate),
    zaklad: cislo(r?.zaklad ?? r?.base ?? r?.amount_without_vat),
    dph: cislo(r?.dph ?? r?.vat ?? r?.vat_amount),
    vat_category: r?.vat_category ?? null,
    pdp: r?.pdp === true,
  }));
}

/* ---------------------------------------------------------------------------
   Chyba spúšťača v databáze: RAISE EXCEPTION 'FAKTERO_DPH: …' (P0001).
--------------------------------------------------------------------------- */

const PREFIX = "FAKTERO_DPH:";

/** Je to chyba spúšťača zákonných sadzieb? Prijme Error, PostgrestError aj text. */
export function jeChybaSpustacaDph(e: unknown): boolean {
  const s = typeof e === "string" ? e : String((e as any)?.message ?? "");
  return s.includes(PREFIX);
}

/** Čitateľná hláška z chyby spúšťača (bez prefixu), inak null. */
export function hlaskaSpustacaDph(e: unknown): string | null {
  const s = typeof e === "string" ? e : String((e as any)?.message ?? "");
  const i = s.indexOf(PREFIX);
  if (i < 0) return null;
  return s.slice(i + PREFIX.length).trim() || "DPH nie je po zákonných sadzbách.";
}

/* ---------------------------------------------------------------------------
   Kontrola riadku tabuľky — to isté, čo robí spúšťač v databáze, aby server
   vrátil zrozumiteľnú chybu skôr, než zápis zastaví databáza.
--------------------------------------------------------------------------- */

export type TabulkaDph = "purchase_invoices" | "expense_documents";

const STLPCE_DPH: Record<TabulkaDph, string[]> = {
  purchase_invoices: [
    "amount_without_vat",
    "vat_amount",
    "amount_total",
    "vat_breakdown",
    "delivery_date",
    "issue_date",
    "currency",
    "supplier_country",
    "supplier_ic_dph",
  ],
  expense_documents: [
    "net_amount",
    "vat_amount",
    "total_amount",
    "vat_breakdown",
    "issue_date",
    "supplier_country",
    "supplier_ic_dph",
  ],
};

/*
 * Doklad prenesený z Doklada (`doklado_id`), ktorého rozpis DPH sa nedal
 * zostaviť, sa zapíše s príznakom „na kontrolu“ (`na_kontrolu_at` + dôvod)
 * — inak by sa vôbec neprenesol a z účtovníctva by zmizol. Kým je na
 * kontrole, DPH sa nekontroluje (do výkazov ide s výtkou, Nespracované ho
 * ukazujú). Zrušenie príznaku je ako prechod z konceptu: kontroluje sa celé
 * pravidlo, takže „potvrdiť“ zlý doklad bez opravy rozpisu nejde.
 * Rovnako spúšťač.
 */
const naKontrolePrenosu = (r: Record<string, unknown>) =>
  String(r.doklado_id ?? "").trim() !== "" && r.na_kontrolu_at != null && r.na_kontrolu_at !== "";

/* Zálohová faktúra nie je daňový doklad, koncept sa ešte len píše, samofaktúru
   skladá Faktero z položiek so zákonnými sadzbami (pri prenesení nesie
   samozdanenú daň v hlavičke). */
const vynimkaPrijatej = (r: Record<string, unknown>) =>
  String(r.type ?? "") === "proforma" || String(r.status ?? "") === "draft" || r.samofakturacia === true;

/**
 * Skontroluje zapisovaný riadok prijatej faktúry alebo bločku. `zmena` sú
 * stĺpce, ktoré sa zapisujú, `stary` doterajší riadok (pri úprave). Rovnako
 * ako spúšťač: zálohová faktúra, koncept, samofaktúra a doklad z Doklada na
 * kontrole sa nekontrolujú, úprava, ktorá
 * sumy, rozpis ani dátumy nemení, tiež nie (zlý starý doklad sa dá zaúčtovať).
 */
export function skontrolujDphDokladu(
  tabulka: TabulkaDph,
  zmena: Record<string, unknown>,
  krajina: string | null | undefined,
  stary?: Record<string, unknown> | null,
): ChybaDph[] {
  const r: Record<string, unknown> = { ...(stary ?? {}), ...zmena };
  if (naKontrolePrenosu(r)) return [];
  const zmenaDph = (st: Record<string, unknown>) =>
    STLPCE_DPH[tabulka].some((k) => k in zmena && !rovnake(zmena[k], st[k]));
  if (tabulka === "purchase_invoices") {
    if (vynimkaPrijatej(r)) return [];
    const bolaVynimka = stary ? vynimkaPrijatej(stary) || naKontrolePrenosu(stary) : false;
    if (stary && !bolaVynimka && !zmenaDph(stary)) return [];
  } else if (stary && !naKontrolePrenosu(stary) && !zmenaDph(stary)) {
    return [];
  }
  const prijata = tabulka === "purchase_invoices";
  return skontrolujDph({
    rozpis: rozpisPreKontrolu(r.vat_breakdown),
    zaklad: cislo(prijata ? r.amount_without_vat : r.net_amount),
    dph: cislo(r.vat_amount),
    krajina: krajinaDane(krajina),
    den: String((prijata ? r.delivery_date || r.issue_date : r.issue_date) ?? "") || null,
    poloziek: Array.isArray(r.items) ? r.items.length : undefined,
    krajinaDodavatela: krajinaDodavatelaDph(
      r.supplier_country as string | null | undefined,
      r.supplier_ic_dph as string | null | undefined,
    ),
  });
}

function rovnake(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  if (typeof a === "object" || typeof b === "object") return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  return String(a) === String(b);
}
