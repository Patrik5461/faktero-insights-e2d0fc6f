/**
 * Kontrola rozpisu DPH vyťaženého z prijatého dokladu.
 *
 * AI občas vráti celý základ jednej sadzbe (napr. 143,77 pri 19 %), hoci
 * doklad má dva riadky — 26,90 pri 0 % a 116,87 pri 23 %. Súčty pritom
 * „sedia“, takže chyba prejde až do priznania. Táto kontrola preto overuje
 * každý riadok zvlášť: daň musí zodpovedať základu krát sadzba, súčty musia
 * dať sumy dokladu a sadzba musí v krajine a v deň dodania naozaj platiť.
 *
 * Čistá logika bez I/O — používa ju vyťaženie aj opravný skript.
 */
import { krajinaDane, sadzbyKrajiny } from "@/lib/faktero/vat-rates";
import { sadzbyStatuSHistoriou, statEu } from "@/lib/faktero/sadzby-eu";
import { krajinaDodavatelaDph } from "@/lib/faktero/dph-pravidlo";

/**
 * Kategória riadku rozpisu DPH (Patrik 5. 11.):
 *  - `standard` — zdaniteľné plnenie v sadzbe 23 / 19 / 5 % (CZ 21 / 12 %),
 *  - `out_of_scope` — „Nie je predmetom DPH“ (správne a registračné poplatky,
 *    kolky); do priznania ani KV nevstupuje vôbec,
 *  - `exempt` — „Oslobodené“ od dane,
 *  - `reverse_charge` — prenesenie daňovej povinnosti (§ 69 ods. 12, CZ § 92a),
 *  - `needs_review` — 0 % bez uvedeného dôvodu alebo sadzba, ktorú nevieme
 *    určiť; doklad musí skontrolovať človek.
 */
export type KategoriaDph =
  "standard" | "out_of_scope" | "exempt" | "reverse_charge" | "needs_review";

export const KATEGORIE_DPH: readonly KategoriaDph[] = [
  "standard",
  "out_of_scope",
  "exempt",
  "reverse_charge",
  "needs_review",
];

/** `vat_category` je povinná v novom kóde; chýbajúca sa odvodí cez `kategoriaRiadku`. */
export type RiadokDph = {
  rate: number;
  base: number;
  vat: number;
  vat_category?: KategoriaDph | null;
};

export type VysledokKontroly = {
  ok: boolean;
  chyby: {
    kod:
      | "suma_zakladov"
      | "suma_dph"
      | "riadok_dph"
      | "neplatna_sadzba"
      | "neplatna_kategoria"
      | "dph_pri_oslobodenom"
      | "suma_dokladu";
    sprava: string;
    riadok?: number;
  }[];
};

/** Platná kategória, alebo null. */
export function jeKategoriaDph(v: unknown): v is KategoriaDph {
  return typeof v === "string" && (KATEGORIE_DPH as readonly string[]).includes(v);
}

/**
 * Kategória riadku: uvedená, inak odvodená zo sadzby — nad nulou `standard`,
 * 0 % bez dôvodu `needs_review` (nevieme, či je oslobodené, mimo DPH či PDP).
 */
export function kategoriaRiadku(r: { rate?: unknown; vat_category?: unknown }): KategoriaDph {
  if (jeKategoriaDph(r.vat_category)) return r.vat_category;
  return Number(r.rate) > 0 ? "standard" : "needs_review";
}

/** Do DPH priznania, KV a prehľadov DPH ide riadok? „Nie je predmetom DPH“ nie. */
export function ideDoPriznania(r: { rate?: unknown; vat_category?: unknown }): boolean {
  return kategoriaRiadku(r) !== "out_of_scope";
}

export const NAZVY_KATEGORII_DPH: Record<KategoriaDph, string> = {
  standard: "Zdaniteľné",
  out_of_scope: "Nie je predmetom DPH",
  exempt: "Oslobodené",
  reverse_charge: "Prenesenie DP",
  needs_review: "Na kontrolu",
};

/** Tolerancia na súčet aj na riadok — zaokrúhlenie na centy. */
export const TOLERANCIA_DPH = 0.02;

const cislo = (v: unknown): number => {
  const n = Number(typeof v === "string" ? v.replace(",", ".") : v);
  return Number.isFinite(n) ? n : 0;
};

const zaokruhli = (n: number) => Math.round(n * 100) / 100;

const fmt = (n: number) =>
  zaokruhli(n).toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Porovnanie s toleranciou; drobné plávajúce chyby (0,020000001) nerozhodujú. */
const sedi = (a: number, b: number, tol = TOLERANCIA_DPH) => Math.abs(a - b) <= tol + 1e-9;

/**
 * sum(base) == bezDph, sum(vat) == dph (tolerancia 0,02 na súčet),
 * |base × rate / 100 − vat| ≤ 0,02 na riadok, sadzba platná pre krajinu a dátum.
 *
 * Pri `out_of_scope` a `exempt` musí byť DPH 0, `needs_review` (aj 0 % bez
 * kategórie) je vždy chyba. Bez dátumu dodania platia dnešné sadzby.
 */
export function skontrolujRozpisDph(
  r: RiadokDph[],
  suma: { bezDph: number; dph: number },
  kontext: {
    krajina: string;
    datumDodania?: string | null;
    /** Krajina dodávateľa (ISO) — zahraničný smie mať sadzby svojho štátu. */
    krajinaDodavatela?: string | null;
    /** IČ DPH dodávateľa — keď krajina chýba, odvodí sa z prefixu. */
    icDphDodavatela?: string | null;
  },
): VysledokKontroly {
  const chyby: VysledokKontroly["chyby"] = [];
  const krajina = krajinaDane(kontext.krajina);
  const datum = kontext.datumDodania ? String(kontext.datumDodania).slice(0, 10) : null;
  /*
    Povolené sadzby: platné v deň dodania (SK od 2025 23/19/5/0, CZ 21/12/0);
    bez dátumu dnešné. Inú hodnotu (napr. „1,46 %“ dopočítanú z pomeru dane
    a základu) nikdy neprijmeme.
  */
  const denOk = datum && /^\d{4}-\d{2}-\d{2}$/.test(datum) ? datum : null;
  let povolene = sadzbyKrajiny(krajina, denOk);
  /*
    Zahraničný dodávateľ (bloček za palivo v Maďarsku, hotel v Rakúsku) nesie
    sadzbu svojho štátu — súčasnú aj historickú, ako pravidlo `skontrolujDph`.
    Krajina mimo EÚ: sadzbu nevieme overiť, ponecháme len zdaniteľné sadzby
    z dokladu (výpočet a súčty sa kontrolujú ďalej).
  */
  const dod = krajinaDodavatelaDph(kontext.krajinaDodavatela, kontext.icDphDodavatela);
  if (dod && dod !== krajina) {
    const cudzie =
      dod === "SK" || dod === "CZ" || dod === "DE"
        ? sadzbyKrajiny(dod, denOk)
        : statEu(dod)
          ? sadzbyStatuSHistoriou(dod)
          : (r ?? []).map((x) => cislo(x.rate));
    povolene = [...new Set([...povolene, ...cudzie])];
  }

  let sumaZakladov = 0;
  let sumaDph = 0;
  (r ?? []).forEach((riadok, i) => {
    const rate = cislo(riadok.rate);
    const base = cislo(riadok.base);
    const vat = cislo(riadok.vat);
    sumaZakladov += base;
    sumaDph += vat;

    const kategoria = kategoriaRiadku(riadok);
    const platna = povolene.some((s) => Math.abs(s - rate) < 0.001);
    if (kategoria === "needs_review") {
      chyby.push({
        kod: "neplatna_kategoria",
        riadok: i,
        sprava:
          rate === 0
            ? `Riadok 0 % so základom ${fmt(base)} nemá dôvod — určte, či je oslobodený, nie je predmetom DPH alebo ide o prenesenie.`
            : `Riadok so základom ${fmt(base)} treba skontrolovať — sadzba ani druh plnenia nie sú isté.`,
      });
    } else if (kategoria === "standard" && rate === 0) {
      chyby.push({
        kod: "neplatna_kategoria",
        riadok: i,
        sprava: `Zdaniteľné plnenie so základom ${fmt(base)} nemôže mať sadzbu 0 % — vyberte sadzbu alebo dôvod nulovej dane.`,
      });
    }
    if ((kategoria === "out_of_scope" || kategoria === "exempt") && Math.abs(vat) > 0.004) {
      chyby.push({
        kod: "dph_pri_oslobodenom",
        riadok: i,
        sprava: `Plnenie „${kategoria === "exempt" ? "oslobodené" : "nie je predmetom DPH"}“ nemôže mať DPH (${fmt(vat)}).`,
      });
    }
    if (!platna) {
      chyby.push({
        kod: "neplatna_sadzba",
        riadok: i,
        sprava: `Sadzba ${String(rate).replace(".", ",")} % nie je povolená (platia ${[...povolene].sort((a, b) => a - b).join(", ")} %).`,
      });
    }
    // Daň zo základu sa kontroluje len pri zdaniteľnom plnení; PDP nesie daň 0.
    const ocakavana =
      kategoria === "standard" || kategoria === "needs_review" ? (base * rate) / 100 : 0;
    if (kategoria !== "out_of_scope" && kategoria !== "exempt" && !sedi(ocakavana, vat)) {
      chyby.push({
        kod: "riadok_dph",
        riadok: i,
        sprava: `Pri ${rate} % zo základu ${fmt(base)} vychádza DPH ${fmt(ocakavana)}, na doklade je ${fmt(vat)}.`,
      });
    }
  });

  const bezDph = cislo(suma.bezDph);
  const dph = cislo(suma.dph);
  if (!sedi(sumaZakladov, bezDph)) {
    chyby.push({
      kod: "suma_zakladov",
      sprava: `Súčet základov ${fmt(sumaZakladov)} nesedí so sumou bez DPH ${fmt(bezDph)}.`,
    });
  }
  if (!sedi(sumaDph, dph)) {
    chyby.push({
      kod: "suma_dph",
      sprava: `Súčet DPH v rozpise ${fmt(sumaDph)} nesedí s DPH dokladu ${fmt(dph)}.`,
    });
  }
  return { ok: chyby.length === 0, chyby };
}

/** Jedna veta pre používateľa — do upozornenia a do dôvodu „na kontrolu“. */
export function popisChybRozpisu(v: VysledokKontroly): string {
  if (v.ok) return "";
  return `Rozpis DPH nesedí: ${v.chyby.map((c) => c.sprava).join(" ")}`;
}

/**
 * 0 % + text „prenesenie daňovej povinnosti“ / „§ 69 ods. 12“
 * (aj CZ „přenesení daňové povinnosti“, § 92a).
 *
 * Text z dokladu býva bez diakritiky, s rozdelenými slovami či veľkými
 * písmenami — porovnáva sa preto normalizovaný tvar.
 */
export function jePrenesenieZTextu(text: string): boolean {
  const t = String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!t.trim()) return false;
  if (/prenes\w*\s+(danovej|danove)\s+povinnost/.test(t)) return true;
  if (/reverse[\s-]?charge/.test(t)) return true;
  if (/(tuzemsk\w*\s+)?prenesen\w*\s+danov\w*\s+povinnost/.test(t)) return true;
  if (/§\s*69\s*(ods\.?|odst\.?)?\s*12/.test(t)) return true;
  if (/§\s*92\s*a\b/.test(t)) return true;
  if (/steuerschuldnerschaft\s+des\s+leistungsempfangers/.test(t)) return true;
  return false;
}

/* ------------------------------------------------------------------------
   Súčet podľa sadzieb voči celkovej sume dokladu (Patrik 6. 11., B1-2).

   Keď človek vo formulári zmení sadzbu, základ + DPH podľa sadzieb už
   nemusí dať sumu, ktorá je vytlačená na doklade. Kontrola rozpisu vyššie
   to nevidí, lebo porovnáva rozpis so súčtami formulára, ktoré sa s ním
   prepočítajú. Tu sa preto počíta zo sadzieb: pri zdaniteľnom riadku
   základ × (1 + sadzba), pri ostatných len základ — a výsledok sa porovná
   so sumou dokladu. Tolerancia je 0,01 € na každú sadzbu (zaokrúhlenie).

   Ak človek nesúlad vedome potvrdí („Pokračovať aj tak“), ukladá sa podpis
   rozpisu (`podpisRozpisu`) do `rozpis_dph_potvrdeny`; kým sa rozpis ani suma
   nezmenia, formulár sa už nepýta znova.
------------------------------------------------------------------------ */

/** Tolerancia súčtu voči dokladu — 0,01 € na každú sadzbu rozpisu. */
export const TOLERANCIA_NA_SADZBU = 0.01;

/**
 * Základ + DPH podľa sadzby (pri nezdaniteľných riadkoch len základ). Daň
 * z dokladu, ktorá sa od základ × sadzba líši len zaokrúhlením (do 0,02 —
 * daň po položkách), sa berie tak, ako je; inak sa ráta zo sadzby.
 */
export function vypocitanyCelkom(riadky: RiadokDph[]): number {
  let spolu = 0;
  for (const r of riadky ?? []) {
    const base = cislo(r.base);
    const kategoria = kategoriaRiadku(r);
    const zoSadzby = (base * cislo(r.rate)) / 100;
    const vat = Math.abs(cislo(r.vat));
    const dan =
      kategoria === "standard" ? (sedi(vat, Math.abs(zoSadzby)) ? vat : zaokruhli(Math.abs(zoSadzby))) : 0;
    spolu += base + dan;
  }
  return zaokruhli(spolu);
}

const fmtMena = (n: number, mena?: string | null) =>
  `${fmt(n)} ${!mena || mena.toUpperCase() === "EUR" ? "€" : mena.toUpperCase()}`;

/**
 * Nesedí základ + DPH podľa sadzieb so sumou dokladu? Vráti chybu
 * „Sadzba DPH / súčet nesedí s dokladom (doklad: X €, vypočítané: Y €)“,
 * inak null. Bez sumy dokladu (alebo bez rozpisu) sa nekontroluje.
 */
export function nesuladSDokladom(
  riadky: RiadokDph[],
  celkomDokladu: number | string | null | undefined,
  mena?: string | null,
  /** Hotovosť: suma sa zaokrúhľuje na 5 centov (export to rieši sám) — +0,02 tolerancie. */
  hotovost = false,
): VysledokKontroly["chyby"][number] | null {
  if (!riadky?.length) return null;
  if (celkomDokladu == null || celkomDokladu === "") return null;
  const doklad = Math.abs(cislo(celkomDokladu));
  if (!doklad) return null;
  const vypocitane = vypocitanyCelkom(riadky.map((r) => ({ ...r, base: Math.abs(cislo(r.base)) })));
  if (sedi(doklad, vypocitane, TOLERANCIA_NA_SADZBU * riadky.length + (hotovost ? 0.02 : 0))) return null;
  return {
    kod: "suma_dokladu",
    sprava: `Sadzba DPH / súčet nesedí s dokladom (doklad: ${fmtMena(doklad, mena)}, vypočítané: ${fmtMena(vypocitane, mena)}).`,
  };
}

/** Kontrola rozpisu doplnená o porovnanie so sumou dokladu (chyba sumy ide prvá). */
export function sNesuladomDokladu(
  k: VysledokKontroly,
  riadky: RiadokDph[],
  celkomDokladu: number | string | null | undefined,
  mena?: string | null,
  hotovost = false,
): VysledokKontroly {
  const n = nesuladSDokladom(riadky, celkomDokladu, mena, hotovost);
  if (!n) return k;
  return { ok: false, chyby: [n, ...k.chyby] };
}

/**
 * Podpis rozpisu a sumy — čo človek potvrdil. Zmena sadzby, základu, DPH
 * alebo sumy dá iný podpis a kontrola sa ozve znova.
 */
export function podpisRozpisu(riadky: RiadokDph[], celkom: number | string | null | undefined): string {
  const r = [...(riadky ?? [])]
    .map(
      (x) =>
        `${cislo(x.rate)}:${Math.abs(zaokruhli(cislo(x.base))).toFixed(2)}:${Math.abs(zaokruhli(cislo(x.vat))).toFixed(2)}:${kategoriaRiadku(x)}`,
    )
    .sort()
    .join("|");
  return `${r}#${Math.abs(zaokruhli(cislo(celkom))).toFixed(2)}`;
}

/** Potvrdenie uložené v `rozpis_dph_potvrdeny` ({ podpis, at, … }) sedí s aktuálnym rozpisom? */
export function jeRozpisPotvrdeny(ulozene: unknown, podpis: string): boolean {
  if (!ulozene || typeof ulozene !== "object") return false;
  return (ulozene as { podpis?: unknown }).podpis === podpis;
}

/**
 * Riadky rozpisu uloženého dokladu (prijatá faktúra aj bloček): `vat_breakdown`
 * v tvare {sadzba, zaklad, dph, pdp?, vat_category?} alebo {rate, base, vat},
 * inak jedna sadzba z hlavičky (bloček má `vat_rate`). Hodnoty v absolútnej
 * hodnote — dobropis je v databáze záporný.
 */
export function riadkyUlozenehoDokladu(d: {
  vat_breakdown?: unknown;
  vat_rate?: unknown;
  net_amount?: unknown;
  amount_without_vat?: unknown;
  vat_amount?: unknown;
}): RiadokDph[] {
  const pole = Array.isArray(d.vat_breakdown) ? (d.vat_breakdown as any[]) : [];
  if (pole.length)
    return pole.map((r) => ({
      rate: cislo(r?.sadzba ?? r?.rate),
      base: Math.abs(cislo(r?.zaklad ?? r?.base)),
      vat: Math.abs(cislo(r?.dph ?? r?.vat)),
      vat_category: jeKategoriaDph(r?.vat_category)
        ? r.vat_category
        : r?.pdp === true
          ? "reverse_charge"
          : null,
    }));
  if (d.vat_rate == null || d.vat_rate === "") return [];
  const zaklad = d.net_amount ?? d.amount_without_vat;
  if (zaklad == null || zaklad === "") return [];
  return [
    { rate: cislo(d.vat_rate), base: Math.abs(cislo(zaklad)), vat: Math.abs(cislo(d.vat_amount)) },
  ];
}

/**
 * Kontrola sadzieb prijatej faktúry — formulár (aj kompaktný) a zaúčtovanie.
 * Rozpis je uložený `vat_breakdown`; pri jednej sadzbe nasleduje sumy
 * hlavičky (človek ich mohol vo formulári zmeniť). Bez rozpisu, pri zálohovej
 * faktúre (nie je daňový doklad) a pri neplatiteľovi bez dane sa nekontroluje.
 * Vráti aj podpis pre `rozpis_dph_potvrdeny` a či ho človek už potvrdil.
 */
export function kontrolaSadziebPrijatej(
  d: {
    vat_breakdown?: unknown;
    amount_without_vat?: unknown;
    vat_amount?: unknown;
    amount_total?: unknown;
    currency?: string | null;
    delivery_date?: string | null;
    issue_date?: string | null;
    type?: string | null;
    supplier_ic_dph?: string | null;
    supplier_country?: string | null;
    rozpis_dph_potvrdeny?: unknown;
  },
  krajina?: string | null,
): { kontrola: VysledokKontroly; podpis: string; potvrdene: boolean } {
  const ok: VysledokKontroly = { ok: true, chyby: [] };
  const pole = Array.isArray(d.vat_breakdown) ? (d.vat_breakdown as any[]) : [];
  const bezDph = Math.abs(cislo(d.amount_without_vat));
  const dph = Math.abs(cislo(d.vat_amount));
  const riadky = riadkyUlozenehoDokladu({
    vat_breakdown: pole.length === 1 ? [{ ...pole[0], zaklad: bezDph, dph, base: bezDph, vat: dph }] : pole,
  });
  const podpis = podpisRozpisu(riadky, d.amount_total as number);
  if (!riadky.length || d.type === "proforma") return { kontrola: ok, podpis, potvrdene: false };
  if (!String(d.supplier_ic_dph ?? "").trim() && riadky.every((r) => !r.vat))
    return { kontrola: ok, podpis, potvrdene: false };
  const k = sNesuladomDokladu(
    skontrolujRozpisDph(riadky, { bezDph, dph }, {
      krajina: krajina ?? "SK",
      datumDodania: d.delivery_date || d.issue_date || null,
      krajinaDodavatela: d.supplier_country ?? null,
      icDphDodavatela: d.supplier_ic_dph ?? null,
    }),
    riadky,
    d.amount_total as number,
    d.currency,
  );
  return { kontrola: k, podpis, potvrdene: !k.ok && jeRozpisPotvrdeny(d.rozpis_dph_potvrdeny, podpis) };
}
