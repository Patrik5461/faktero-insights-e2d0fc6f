/**
 * Jadro opravného behu rozpisu DPH (`scripts/oprava-rozpisu-dph.ts`).
 *
 * Čistá logika bez I/O: z uloženého riadka dokladu zistí rozpis, overí ho
 * (`skontrolujRozpisDph`), nájde podozrenia (`najdiPodozrenia`), rozhodne,
 * či sa doklad smie meniť (ochrany), a z nového vyťaženia zostaví zmeny.
 * Skript len načíta dáta, zavolá tieto funkcie a zapíše výsledok.
 *
 * Doklady sa delia na tri skupiny:
 *  - „na opravu“ — vyťažený, nezamknutý, človek ho nemenil, súbor je → nové vyťaženie;
 *  - „na kontrolu“ — chybný/podozrivý, ale meniť ho automat nesmie (ručná úprava,
 *    nejde o vyťaženie, chýba súbor…) → len príznak `na_kontrolu_at` + `na_kontrolu_dovod`;
 *  - „preskočené“ — zmazaný, odovzdaný do účtovníctva, zamknutý, v uzavretom
 *    období alebo v období, za ktoré už mohlo byť podané priznanie → len log.
 */
import { denOdpoctu } from "./datum-prijatia";
import { nacitajUdaje, sucty } from "./nespracovane";
import { rozpisPrijatej } from "./prijate-do-pohody";
import { najdiPodozrenia, sadzbyPoloziek, type Podozrenie } from "./rozpis-dph-podozrive";
import {
  jeKategoriaDph,
  skontrolujRozpisDph,
  type RiadokDph,
  type VysledokKontroly,
} from "./rozpis-dph-kontrola";
import { rozpisZVytazenia } from "./rozpis-dph-vytazeny";
import { rozpisBlocku } from "./rozuctovanie";
import { jePolozkaZaokruhlenia } from "./zaokruhlenie-blocku";
import { krajinaDane, najblizsiaSadzba, type KrajinaDane } from "./vat-rates";

export type TabulkaOpravy = "purchase_invoices" | "expense_documents" | "nespracovane_doklady";

export type FirmaOpravy = {
  id: string;
  name?: string | null;
  country?: string | null;
  locked_until?: string | null;
};

/** Záznam histórie dokladu (`historia_dokladov`) — len to, čo treba heuristike. */
export type ZaznamHistorie = {
  pole: string;
  kto: string | null;
  kto_typ: string | null;
  kedy: string;
};

export type RiadokRozpisu = {
  sadzba: number;
  zaklad: number;
  dph: number;
  pdp?: boolean;
  /** Kategória DPH riadku (`vat_category`), ak ju doklad nesie. */
  vat_category?: string | null;
};

/** Riadky `vat_breakdown` / `udaje.rozpis` so zachovanou kategóriou. */
function riadkyRozpisu(v: unknown): RiadokRozpisu[] | null {
  if (!Array.isArray(v) || !v.length) return null;
  return (v as Record<string, unknown>[])
    .map((x) => ({
      sadzba: num(x?.sadzba),
      zaklad: num(x?.zaklad),
      dph: num(x?.dph),
      ...(x?.pdp === true ? { pdp: true } : {}),
      ...(typeof x?.vat_category === "string" && x.vat_category
        ? { vat_category: String(x.vat_category) }
        : {}),
    }))
    .filter((x) => x.zaklad || x.dph);
}

/** Od kedy existuje `historia_dokladov` — staršie zmeny nepoznáme. */
export const HISTORIA_OD = "2026-10-08T03:00:00Z";

/** Zdroje prijatých faktúr, ktoré prešli vyťažením AI. */
const ZDROJE_AI_PRIJATEJ = new Set(["mail", "nahrate", "doklad"]);
/** Zdroje bločkov z fotky/súboru (QR berie údaje z eKasy, `web` je ručný formulár). */
const ZDROJE_AI_BLOCKU = new Set(["photo", "upload"]);

/** Polia, ktorých ručná zmena znamená „rozpis/sumy upravil človek“. */
export const SUMOVE_POLIA: Record<Exclude<TabulkaOpravy, "nespracovane_doklady">, string[]> = {
  purchase_invoices: [
    "amount_without_vat",
    "vat_amount",
    "amount_total",
    "items",
    "vat_breakdown",
    "reverse_charge",
  ],
  expense_documents: [
    "total_amount",
    "net_amount",
    "vat_amount",
    "vat_rate",
    "vat_breakdown",
    "items",
  ],
};

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const den = (v: unknown): string | null => {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/* ───────────────────────────── uložený stav ───────────────────────────── */

export type UlozenyStav = {
  rozpis: RiadokRozpisu[];
  bezDph: number;
  dph: number;
  spolu: number;
  polozky: Record<string, unknown>[] | null;
  datumDodania: string | null;
  reverseCharge: boolean;
  /** Krajina sadzieb; `null` = zahraničný dodávateľ s cudzími sadzbami (nedá sa overiť). */
  krajina: KrajinaDane | null;
};

/**
 * Krajina, ktorej sadzby platia pre doklad: krajina dodávateľa, ak ju poznáme
 * (SK/CZ/DE), inak firmy. Dodávateľ z inej krajiny (AT 20 %, PL 23 %…) vráti
 * `null` — tam sa sadzba overiť nedá.
 */
export function krajinaSadzieb(
  supplierCountry: unknown,
  firma: FirmaOpravy | null | undefined,
): KrajinaDane | null {
  const s = String(supplierCountry ?? "")
    .trim()
    .toUpperCase();
  const domov = krajinaDane(firma?.country);
  if (!s) return domov;
  if (s === "SK" || s === "SVK") return "SK";
  if (s === "CZ" || s === "CZE") return "CZ";
  if (s === "DE" || s === "DEU") return "DE";
  return null;
}

/** Uložený rozpis a sumy dokladu tak, ako ich vidia výkazy a exporty. */
export function ulozenyStav(
  tabulka: TabulkaOpravy,
  row: Record<string, any>,
  firma?: FirmaOpravy | null,
): UlozenyStav {
  if (tabulka === "purchase_invoices") {
    return {
      rozpis: rozpisPrijatej(row).map((x) => ({ ...x })),
      bezDph: num(row.amount_without_vat),
      dph: num(row.vat_amount),
      spolu: num(row.amount_total),
      polozky: Array.isArray(row.items) ? row.items : null,
      datumDodania: den(row.delivery_date) ?? den(row.issue_date),
      reverseCharge: row.reverse_charge === true || row.dph_rezim === "samozdanenie",
      krajina: krajinaSadzieb(row.supplier_country, firma),
    };
  }
  if (tabulka === "expense_documents") {
    return {
      rozpis:
        riadkyRozpisu(row.vat_breakdown) ??
        rozpisBlocku(row).map((x) => ({ sadzba: x.sadzba, zaklad: x.zaklad, dph: x.dph })),
      bezDph: num(row.net_amount),
      dph: num(row.vat_amount),
      spolu: num(row.total_amount),
      polozky: Array.isArray(row.items) ? row.items : null,
      datumDodania: den(row.issue_date),
      reverseCharge: false,
      krajina: krajinaSadzieb(row.supplier_country, firma),
    };
  }
  const u = nacitajUdaje(row.udaje);
  const s = sucty(u);
  return {
    rozpis: riadkyRozpisu(u.rozpis) ?? [],
    bezDph: s.zaklad,
    dph: s.dph,
    spolu: s.celkom,
    polozky: u.polozky as any,
    datumDodania: den(u.datumDodania) ?? den(u.datumVystavenia),
    reverseCharge: u.prenesenie === true,
    krajina: krajinaSadzieb(u.dodavatel?.krajina, firma),
  };
}

/**
 * Rozpis v tvare kontroly. Kategória: uložená, pri prenesení `reverse_charge`;
 * bez nej ju kontrola odvodí zo sadzby (0 % bez dôvodu = `needs_review`).
 */
export function naRiadkyKontroly(rozpis: RiadokRozpisu[]): RiadokDph[] {
  return rozpis.map((r) => {
    const kat = jeKategoriaDph(r.vat_category) ? r.vat_category : r.pdp ? "reverse_charge" : null;
    return {
      rate: num(r.sadzba),
      base: num(r.zaklad),
      vat: num(r.dph),
      ...(kat ? { vat_category: kat } : {}),
    };
  });
}

/* ───────────────────────────── kontrola ───────────────────────────── */

export type Vyhodnotenie = {
  stav: "ok" | "chybny" | "podozrivy";
  kontrola: VysledokKontroly;
  podozrenia: Podozrenie[];
};

/** Kontrola + podozrenia nad uloženým stavom. `text` = textová vrstva súboru, ak je. */
export function vyhodnot(stav: UlozenyStav, text?: string | null): Vyhodnotenie {
  const riadky = naRiadkyKontroly(stav.rozpis);
  const kontrola: VysledokKontroly =
    stav.krajina === null
      ? // Cudzie sadzby nepoznáme — overia sa aspoň súčty.
        {
          ...skontrolujRozpisDph(
            riadky.map((r) => ({ ...r, rate: 0, vat: 0, vat_category: "exempt" as const })),
            { bezDph: stav.bezDph, dph: 0 },
            { krajina: "SK" },
          ),
        }
      : skontrolujRozpisDph(
          riadky,
          { bezDph: stav.bezDph, dph: stav.dph },
          {
            krajina: stav.krajina,
            datumDodania: stav.datumDodania,
          },
        );
  // Doklad bez akejkoľvek sumy nie je čo kontrolovať.
  if (!stav.bezDph && !stav.dph && !stav.spolu)
    return { stav: "ok", kontrola: { ok: true, chyby: [] }, podozrenia: [] };
  const podozrenia =
    stav.krajina === null
      ? []
      : najdiPodozrenia({
          rozpis: riadky,
          polozky: stav.polozky as any,
          krajina: stav.krajina,
          datumDodania: stav.datumDodania,
          text: text ?? null,
          reverseCharge: stav.reverseCharge,
        });
  return {
    stav: !kontrola.ok ? "chybny" : podozrenia.length ? "podozrivy" : "ok",
    kontrola,
    podozrenia,
  };
}

/* ───────────────────────────── ochrany ───────────────────────────── */

export type Ochrana =
  /** Preskočené — len log. */
  | "zmazany"
  | "odovzdany"
  | "zamknuty"
  | "uzavrete_obdobie"
  | "obdobie_po_termine"
  | "zalohova"
  /** Na kontrolu — príznak, bez zmeny súm. */
  | "rucne_upravene"
  | "mozno_rucne_upravene"
  | "nie_z_vytazenia"
  | "bez_suboru"
  | "zahranicne_sadzby"
  | "cudzia_mena";

export const PRESKOCIT: ReadonlySet<Ochrana> = new Set([
  "zmazany",
  "odovzdany",
  "zamknuty",
  "uzavrete_obdobie",
  "obdobie_po_termine",
  "zalohova",
]);

/**
 * Deň, ktorým doklad vstupuje do DPH (prijatá: odpočet podľa `denOdpoctu`,
 * bloček: deň vystavenia). Nespracovaný doklad v DPH ešte nie je.
 */
export function denDph(tabulka: TabulkaOpravy, row: Record<string, any>): string | null {
  if (tabulka === "purchase_invoices") return denOdpoctu(row);
  if (tabulka === "expense_documents") return den(row.issue_date);
  return null;
}

/**
 * Termín podania priznania za mesiac dňa `d`: 25. deň nasledujúceho mesiaca.
 * Štvrťročný platiteľ podáva neskôr — mesačný termín je opatrnejší (chráni viac).
 */
export function terminPodania(d: string): string {
  const r = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  const nr = m === 12 ? r + 1 : r;
  const nm = m === 12 ? 1 : m + 1;
  return `${nr}-${String(nm).padStart(2, "0")}-25`;
}

export type VstupOchran = {
  tabulka: TabulkaOpravy;
  row: Record<string, any>;
  firma: FirmaOpravy | null | undefined;
  stav: UlozenyStav;
  /** Výsledok heuristiky ručnej úpravy. */
  rucne: RucnaUprava;
  /** Dnešný deň (RRRR-MM-DD). */
  dnes: string;
  /** Povoliť zmenu aj v období po termíne podania (nie však v uzavretom). */
  ajPoTermine?: boolean;
};

/** Všetky dôvody, prečo sa doklad nesmie (alebo nemá) meniť automaticky. */
export function ochrany(v: VstupOchran): Ochrana[] {
  const { tabulka, row, firma } = v;
  const out: Ochrana[] = [];
  if (row.deleted_at) out.push("zmazany");
  if (row.exported_at) out.push("odovzdany");
  if (row.locked_at) out.push("zamknuty");
  if (tabulka === "purchase_invoices" && row.type === "proforma") out.push("zalohova");
  const d = denDph(tabulka, row);
  const zamok = den(firma?.locked_until);
  if (tabulka !== "nespracovane_doklady") {
    // Guard v DB pozerá na deň vystavenia aj prijatia — chránime všetky dni dokladu.
    const dni = [d, den(row.issue_date), den(row.received_date)].filter(Boolean) as string[];
    if (zamok && dni.some((x) => x <= zamok)) out.push("uzavrete_obdobie");
    else if (!v.ajPoTermine && d && v.dnes > terminPodania(d)) out.push("obdobie_po_termine");
  }
  if (v.rucne.stav === "ano") out.push("rucne_upravene");
  else if (v.rucne.stav === "neiste") out.push("mozno_rucne_upravene");
  if (!zVytazenia(tabulka, row)) out.push("nie_z_vytazenia");
  if (!row.file_path) out.push("bez_suboru");
  if (v.stav.krajina === null) out.push("zahranicne_sadzby");
  if (
    tabulka === "purchase_invoices" &&
    (row.amount_without_vat_eur != null || row.vat_amount_eur != null)
  )
    out.push("cudzia_mena");
  return out;
}

/** Prešiel doklad vyťažením AI (a nie eFaktúrou, eKasou, importom či ručným zápisom)? */
export function zVytazenia(tabulka: TabulkaOpravy, row: Record<string, any>): boolean {
  if (tabulka === "purchase_invoices") return ZDROJE_AI_PRIJATEJ.has(String(row.source ?? ""));
  if (tabulka === "expense_documents")
    return (
      String(row.source ?? "") !== "qr" &&
      (ZDROJE_AI_BLOCKU.has(String(row.source ?? "")) || row.ai_raw != null)
    );
  return row.ai != null;
}

/* ───────────────────────────── ručná úprava ───────────────────────────── */

export type RucnaUprava = { stav: "nie" | "ano" | "neiste"; dovod: string };

const LUDSKE_TYPY = new Set(["clovek", "appka", "api"]);

/** Sumy, ktoré by bloček mal podľa uloženého výsledku AI (`ai_raw`). */
function sumyZAi(ai: Record<string, any>): { spolu: number | null; dph: number | null } {
  const n = (v: unknown) =>
    v === null || v === undefined || v === ""
      ? null
      : Number.isFinite(Number(v))
        ? Number(v)
        : null;
  return { spolu: n(ai.amount_total ?? ai.total), dph: n(ai.vat_amount) };
}

/**
 * Heuristika „upravil to človek?“ pre doklady bez príznaku `rucne_upravene_at`:
 *
 *  1. príznak `rucne_upravene_at` (nové doklady — nastavuje ho spúšťač) → áno;
 *  2. `historia_dokladov` má zmenu sumy/DPH/položiek/rozpisu od človeka, appky
 *     alebo API (kto_typ clovek/appka/api; zo starších záznamov bez typu
 *     zmena so známym `kto`) → áno;
 *  3. bloček má `ai_raw` a uložená suma alebo DPH sa od neho líši o viac ako
 *     0,02 → áno (niekto ju po vyťažení prepísal);
 *  4. nespracovaný doklad: rozpis v údajoch sa líši od rozpisu z `ai` → áno;
 *  5. doklad vznikol pred zavedením histórie (8. 10. 2026) a od vytvorenia sa
 *     menil (`updated_at` > `created_at` + 10 min) → neisté — nevieme, či sa
 *     menili sumy, alebo len stav, úhrada či zaúčtovanie;
 *  6. inak nie.
 *
 * Áno aj neisté → doklad sa nemení, len sa označí na kontrolu.
 */
export function rucnaUprava(
  tabulka: TabulkaOpravy,
  row: Record<string, any>,
  historia: ZaznamHistorie[] = [],
): RucnaUprava {
  if (row.rucne_upravene_at)
    return {
      stav: "ano",
      dovod: `príznak ručnej úpravy ${String(row.rucne_upravene_at).slice(0, 10)}`,
    };
  if (tabulka === "nespracovane_doklady") {
    if (!row.ai) return { stav: "nie", dovod: "" };
    const u = nacitajUdaje(row.udaje);
    const kluc = (r: { sadzba: unknown; zaklad: unknown; dph: unknown }[]) =>
      r
        .map((x) => `${num(x.sadzba)}:${r2(Math.abs(num(x.zaklad)))}:${r2(Math.abs(num(x.dph)))}`)
        .sort()
        .join("|");
    const ulozeny = kluc(u.rozpis ?? []);
    // Rozpis mohol vzniknúť starým výpočtom (do 5. 11. 2026) aj novým.
    const zAi = [rozpisZAiDo20261105(row.ai), rozpisZVytazenia(row.ai, {}).rozpis];
    return zAi.some((r) => kluc(r) === ulozeny)
      ? { stav: "nie", dovod: "" }
      : { stav: "ano", dovod: "rozpis v Nespracovaných sa líši od výsledku AI" };
  }
  const polia = new Set(SUMOVE_POLIA[tabulka]);
  const zasah = historia.find(
    (h) =>
      polia.has(h.pole) &&
      (LUDSKE_TYPY.has(String(h.kto_typ)) || (h.kto_typ == null && h.kto != null)),
  );
  if (zasah)
    return {
      stav: "ano",
      dovod: `história: ${zasah.pole} zmenil ${zasah.kto_typ ?? "človek"} ${String(zasah.kedy).slice(0, 10)}`,
    };
  if (tabulka === "expense_documents" && row.ai_raw && typeof row.ai_raw === "object") {
    const ai = sumyZAi(row.ai_raw);
    if (ai.spolu !== null && Math.abs(Math.abs(ai.spolu) - Math.abs(num(row.total_amount))) > 0.02)
      return { stav: "ano", dovod: "suma sa líši od výsledku AI" };
    if (ai.dph !== null && Math.abs(Math.abs(ai.dph) - Math.abs(num(row.vat_amount))) > 0.02)
      return { stav: "ano", dovod: "DPH sa líši od výsledku AI" };
  }
  const vytvoreny = Date.parse(String(row.created_at ?? ""));
  const zmeneny = Date.parse(String(row.updated_at ?? ""));
  if (
    Number.isFinite(vytvoreny) &&
    vytvoreny < Date.parse(HISTORIA_OD) &&
    Number.isFinite(zmeneny) &&
    zmeneny - vytvoreny > 10 * 60_000
  ) {
    return { stav: "neiste", dovod: "menený pred zavedením histórie (8. 10. 2026), nevieme čo" };
  }
  return { stav: "nie", dovod: "" };
}

/* ───────────────────────────── návrh opravy ───────────────────────────── */

export type NoveVytazenie = {
  /** Surový výsledok vyťaženia (ide do `ai` / `ai_raw`). */
  ai: Record<string, unknown> | null;
  /** Rozpis po sadzbách (kladné sumy, ako z `rozpisZAi`). */
  rozpis: RiadokRozpisu[];
  /** Celková suma s DPH z dokladu. */
  spolu: number | null;
  /** Doklad je v prenesení daňovej povinnosti. */
  prenesenie: boolean;
  /** Text dokladu na overenie podozrení (voliteľné). */
  text?: string | null;
};

export type NavrhOpravy =
  | { akcia: "prepisat"; zmeny: Record<string, unknown>; popis: string }
  | { akcia: "na_kontrolu"; dovod: string };

/** Rozpis na porovnanie (sadzba:základ:daň, absolútne). */
export function odtlacokRozpisu(r: RiadokRozpisu[]): string {
  return r
    .filter((x) => Math.abs(num(x.zaklad)) >= 0.005 || Math.abs(num(x.dph)) >= 0.005)
    .map(
      (x) =>
        `${x.pdp ? "pdp" : ""}${num(x.sadzba)}%${x.vat_category && x.vat_category !== "standard" ? `/${x.vat_category}` : ""}:${r2(Math.abs(num(x.zaklad))).toFixed(2)}:${r2(Math.abs(num(x.dph))).toFixed(2)}`,
    )
    .sort()
    .join(" | ");
}

/**
 * Z nového vyťaženia zostaví zmeny dokladu — alebo povie, prečo ho treba dať
 * na kontrolu. Celková suma sa NIKDY nemení (úhrady, banka, pokladňa a
 * párovanie stoja na nej): keď ju nové vyťaženie vidí inak, ide doklad
 * človeku.
 */
export function navrhOpravy(args: {
  tabulka: TabulkaOpravy;
  row: Record<string, any>;
  stav: UlozenyStav;
  nove: NoveVytazenie;
}): NavrhOpravy {
  const { tabulka, row, stav, nove } = args;
  if (!nove.rozpis.length)
    return { akcia: "na_kontrolu", dovod: "nové vyťaženie nevrátilo rozpis DPH" };
  const zn = stav.spolu < 0 ? -1 : 1;
  const bezDph = r2(nove.rozpis.reduce((a, r) => a + num(r.zaklad), 0));
  const dph = r2(nove.rozpis.reduce((a, r) => a + num(r.dph), 0));
  const spoluNove = nove.spolu ?? r2(bezDph + dph);
  if (Math.abs(Math.abs(spoluNove) - Math.abs(stav.spolu)) > 0.02)
    return {
      akcia: "na_kontrolu",
      dovod: `nové vyťaženie má inú celkovú sumu (${r2(Math.abs(spoluNove))} oproti ${r2(Math.abs(stav.spolu))})`,
    };
  if (Math.abs(r2(bezDph + dph) - Math.abs(stav.spolu)) > 0.02)
    return { akcia: "na_kontrolu", dovod: "rozpis z nového vyťaženia nedáva celkovú sumu dokladu" };

  const rozpis: RiadokRozpisu[] = nove.rozpis.map((r) => ({
    sadzba: num(r.sadzba),
    zaklad: r2(num(r.zaklad)),
    dph: r2(num(r.dph)),
    ...(r.pdp || r.vat_category === "reverse_charge" || (nove.prenesenie && !num(r.dph))
      ? { pdp: true }
      : {}),
    vat_category:
      r.vat_category ??
      (r.pdp || (nove.prenesenie && !num(r.dph))
        ? "reverse_charge"
        : num(r.sadzba) > 0
          ? "standard"
          : null),
  }));
  const novyStav: UlozenyStav = {
    ...stav,
    rozpis,
    bezDph,
    dph,
    reverseCharge: stav.reverseCharge || nove.prenesenie,
  };
  const v = vyhodnot(novyStav, nove.text ?? null);
  // „19 % sa nedá overiť“ by zastavilo každý bloček z fotky — nové vyťaženie
  // sadzbu čítalo z tabuľky rozpisu, overiteľné podozrenia však platia.
  const podozrenia = v.podozrenia.filter((p) => p.kod !== "sadzba_19_neoverena");
  if (!v.kontrola.ok || podozrenia.length) {
    const co = [...v.kontrola.chyby.map((c) => c.sprava), ...podozrenia.map((p) => p.sprava)].join(
      " ",
    );
    return { akcia: "na_kontrolu", dovod: `ani nové vyťaženie neprešlo kontrolou: ${co}` };
  }
  if (
    odtlacokRozpisu(rozpis) === odtlacokRozpisu(stav.rozpis) &&
    nove.prenesenie === stav.reverseCharge
  )
    return {
      akcia: "na_kontrolu",
      dovod: "nové vyťaženie dalo ten istý rozpis — treba posúdiť človekom",
    };
  if (stav.reverseCharge && !nove.prenesenie)
    return {
      akcia: "na_kontrolu",
      dovod: "doklad je označený ako prenesenie, nové vyťaženie ho nevidí",
    };
  const zmenaPrenesenia = nove.prenesenie && !stav.reverseCharge;
  if (zmenaPrenesenia && dph !== 0)
    return { akcia: "na_kontrolu", dovod: "nové vyťaženie vidí prenesenie, ale aj DPH" };
  if (zmenaPrenesenia && row.zauctovane_at)
    return {
      akcia: "na_kontrolu",
      dovod: "zmena prenesenia na zaúčtovanom doklade — treba preúčtovať (členenie DPH, KV)",
    };
  if (Array.isArray(row.rozuctovanie) && row.rozuctovanie.length)
    return { akcia: "na_kontrolu", dovod: "doklad je rozúčtovaný — sumy rozúčtovania by nesedeli" };

  // Položky: keď ich sadzby nesedia s novým rozpisom, výkazy a Pohoda by ich brali prednostne.
  const sadzbyNove = [
    ...new Set(rozpis.filter((r) => r.zaklad || r.dph).map((r) => r.sadzba)),
  ].sort((a, b) => a - b);
  const polozky = Array.isArray(row.items) ? (row.items as Record<string, unknown>[]) : [];
  const sadzbyPol = sadzbyPoloziek(polozky as any);
  const polozkySedia = !polozky.length || sadzbyPol.join(",") === sadzbyNove.join(",");
  const maKody = polozky.some((p) => p?.predkontacia || p?.clenenie || p?.kv);

  const zmeny: Record<string, unknown> = {};
  const podpis = (x: number) => r2(zn * x);
  const ulozRozpis = rozpis.map((r) => ({ ...r, zaklad: podpis(r.zaklad), dph: podpis(r.dph) }));

  if (tabulka === "purchase_invoices") {
    zmeny.vat_breakdown = ulozRozpis;
    zmeny.amount_without_vat = podpis(bezDph);
    zmeny.vat_amount = podpis(dph);
    if (zmenaPrenesenia) {
      zmeny.reverse_charge = true;
      if (!row.dph_rezim || row.dph_rezim === "tuzemsko") zmeny.dph_rezim = "samozdanenie";
    }
    if (!polozkySedia) {
      if (maKody)
        return { akcia: "na_kontrolu", dovod: "položky majú iné sadzby a vlastné zaúčtovanie" };
      // Zle vyčítané položky ostanú bokom (ako „vypnuté položky“), dajú sa vrátiť.
      zmeny.items = null;
      zmeny.polozky_vypnute = polozky;
    }
  } else if (tabulka === "expense_documents") {
    if (zmenaPrenesenia)
      return { akcia: "na_kontrolu", dovod: "bloček s prenesením daňovej povinnosti" };
    zmeny.vat_breakdown = ulozRozpis;
    zmeny.net_amount = podpis(bezDph);
    zmeny.vat_amount = podpis(dph);
    zmeny.vat_rate = sadzbyNove.length === 1 ? sadzbyNove[0] : null;
    if (!polozkySedia) {
      if (maKody || sadzbyNove.length !== 1)
        return { akcia: "na_kontrolu", dovod: "položky bločku majú iné sadzby než nový rozpis" };
      zmeny.items = polozky.map((p) =>
        /zaokr[uú]hl|rounding/i.test(String(p?.name ?? "")) ? p : { ...p, vat_rate: sadzbyNove[0] },
      );
    }
    if (nove.ai) zmeny.ai_raw = nove.ai;
  } else {
    zmeny.udaje = {
      ...(row.udaje ?? {}),
      rozpis: rozpis.map(({ sadzba, zaklad, dph, vat_category }) => ({
        sadzba,
        zaklad,
        dph,
        vat_category,
      })),
      ...(nove.prenesenie ? { prenesenie: true } : {}),
      ...(polozkySedia ? {} : { polozkyVypnute: true }),
      // Kontrola pred Vytvoriť (Agent A) — opravený rozpis ju už nepotrebuje.
      kontrolaDph: undefined,
    };
    if (nove.ai) zmeny.ai = nove.ai;
    return {
      akcia: "prepisat",
      zmeny,
      popis: `${odtlacokRozpisu(stav.rozpis)} → ${odtlacokRozpisu(rozpis)}`,
    };
  }

  // Prepočet: nezaúčtovaný doklad sa vráti do fronty automatického zaúčtovania
  // (návrh vznikol zo starých súm). Výkazy DPH a KV sa počítajú z dokladov naživo.
  if (!row.zauctovane_at) {
    zmeny.auto_uctovanie_at = null;
    zmeny.auto_uctovanie_navrh = null;
  }
  // Opravený rozpis prešiel kontrolou — príznak „na kontrolu“ kvôli DPH zmizne
  // (príznak eFaktúry bez dôvodu ostáva).
  if (row.na_kontrolu_dovod) {
    zmeny.na_kontrolu_at = null;
    zmeny.na_kontrolu_dovod = null;
  }
  return {
    akcia: "prepisat",
    zmeny,
    popis: `${odtlacokRozpisu(stav.rozpis)} → ${odtlacokRozpisu(rozpis)}${zmenaPrenesenia ? " + prenesenie" : ""}`,
  };
}

/**
 * Príznak „na kontrolu“ (`na_kontrolu_at` + `na_kontrolu_dovod`) — rovnaký,
 * aký dáva Vytvoriť v Nespracovaných, keď rozpis neprejde kontrolou. Dôvod je
 * jedna veta pre človeka; začína „Rozpis DPH“, aby sa dal odlíšiť od eFaktúry.
 */
export function priznakKontroly(
  dovod: string,
  v: Pick<Vyhodnotenie, "kontrola" | "podozrenia">,
  teraz: string,
): { na_kontrolu_at: string; na_kontrolu_dovod: string } {
  const co = [...v.kontrola.chyby.map((c) => c.sprava), ...v.podozrenia.map((p) => p.sprava)].join(
    " ",
  );
  return {
    na_kontrolu_at: teraz,
    na_kontrolu_dovod: `Rozpis DPH treba skontrolovať (${dovod}). ${co}`.trim().slice(0, 1000),
  };
}

/** Pôvodné hodnoty stĺpcov, ktoré sa idú meniť (do auditu). */
export function povodneHodnoty(
  row: Record<string, any>,
  zmeny: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(zmeny)) out[k] = row[k] === undefined ? null : row[k];
  return out;
}

/* ───────────────────── starý výpočet rozpisu (heuristika) ───────────────────── */

/**
 * `rozpisZAi` z nespracovane.ts tak, ako bol do 5. 11. 2026 (pred opravou).
 * Len na rozpoznanie, či rozpis v `udaje` Nespracovaných vznikol priamo z AI,
 * alebo ho človek prepísal. Na nový výpočet sa NEPOUŽÍVA.
 */
export function rozpisZAiDo20261105(
  ai: Record<string, unknown> | null | undefined,
): RiadokRozpisu[] {
  if (!ai) return [];
  const n = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const x = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(x) ? x : null;
  };
  const zaklad = n(ai.amount_without_vat);
  const dph = n(ai.vat_amount);
  const spolu = n(ai.amount_total);
  const z = zaklad ?? (spolu !== null && dph !== null ? spolu - dph : null);
  const d = dph ?? (spolu !== null && z !== null ? spolu - z : null);
  const polozky = Array.isArray(ai.items) ? (ai.items as any[]) : [];
  if (polozky.length && z !== null) {
    const po: Record<string, RiadokRozpisu> = {};
    for (const p of polozky) {
      if (jePolozkaZaokruhlenia(p)) continue;
      const s = n(p?.vat_rate);
      const celk = n(p?.total);
      if (s === null || celk === null) {
        Object.keys(po).forEach((k) => delete po[k]);
        break;
      }
      const zakl = celk / (1 + s / 100);
      const k = String(s);
      po[k] ??= { sadzba: s, zaklad: 0, dph: 0 };
      po[k].zaklad += zakl;
      po[k].dph += celk - zakl;
    }
    const riadky = Object.values(po)
      .sort((a, b) => b.sadzba - a.sadzba)
      .map((r) => ({ sadzba: r.sadzba, zaklad: r2(r.zaklad), dph: r2(r.dph) }));
    const sucet = riadky.reduce((a, r) => a + r.zaklad, 0);
    if (riadky.length && Math.abs(sucet - z) <= 0.05 * Math.max(1, riadky.length)) {
      const posl = riadky[riadky.length - 1]!;
      posl.zaklad = r2(posl.zaklad + (z - sucet));
      if (d !== null) posl.dph = r2(posl.dph + (d - riadky.reduce((a, r) => a + r.dph, 0)));
      return riadky;
    }
  }
  if (z === null && d === null) return [];
  const zz = Math.abs(z ?? 0);
  const dd = Math.abs(d ?? 0);
  return [{ sadzba: zz ? najblizsiaSadzba((dd / zz) * 100, "SK") : 0, zaklad: zz, dph: dd }];
}

/* ───────────────────── prepočet z uloženého výsledku AI ───────────────────── */

/**
 * Nový rozpis z UŽ ULOŽENÉHO výsledku AI (`expense_documents.ai_raw`,
 * `nespracovane_doklady.ai`) opraveným výpočtom — bez nového volania AI.
 * `null`, keď z neho nový výpočet nedá rozpis, ktorý prejde kontrolou.
 */
export function noveZUlozenehoAi(
  ai: unknown,
  kontext: { krajina: string | null; datumDodania: string | null },
): NoveVytazenie | null {
  if (!ai || typeof ai !== "object") return null;
  const a = ai as Record<string, unknown>;
  const v = rozpisZVytazenia(a, {
    krajina: kontext.krajina ?? "SK",
    datumDodania: kontext.datumDodania,
  });
  if (!v.kontrola.ok || !v.rozpis.length) return null;
  const spolu = Number(a.amount_total ?? a.total);
  return {
    ai: null,
    rozpis: v.rozpis.map((r) => ({
      sadzba: r.sadzba,
      zaklad: r.zaklad,
      dph: r.dph,
      vat_category: r.vat_category,
    })),
    spolu: Number.isFinite(spolu) && spolu ? Math.abs(spolu) : null,
    prenesenie: v.prenesenie,
  };
}
