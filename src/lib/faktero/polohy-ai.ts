/*
  Polohy vyťažených údajov, ktoré vráti AI (Gemini vie vrátiť ohraničenie
  `box_2d` v mierke 0–1000 voči strane).

  Náhľad zvýrazňuje miesto údaja predovšetkým podľa textovej vrstvy PDF
  (`zvyraznenie-vytazenych.ts`) — tá je presná. Obrázok, fotka ani sken
  textovú vrstvu nemajú; tam pomôže poloha od AI. Keď ju AI nevráti (starší
  doklad, ISDOC, iný model), zvýraznenie z textovej vrstvy ostáva ako doteraz.

  Okrem jednotlivých polí (dodávateľ, čísla, dátumy, sumy, odberateľ, platba)
  AI vracia aj polohy riadkov rozpisu DPH (`vat_breakdown[i].base|vat`) a
  položiek (`items[i].name|quantity|unit_price|total|vat_rate`).

  Čisté funkcie bez Reactu, aby sa dali otestovať.
*/
import type { Obdlznik } from "./vyber-z-dokladu";

/**
 * Kľúč výstupu AI → údaj zvýraznenia (`UdajZvyraznenia.id`). Polia formulára
 * majú id rovnaké ako `KlucPola` (cislo, dodavatel.ico…), ostatné vlastné.
 */
export const POLIA_POLOH_AI: Record<string, string> = {
  supplier_name: "dodavatel.nazov",
  supplier_ico: "dodavatel.ico",
  supplier_dic: "dodavatel.dic",
  supplier_ic_dph: "dodavatel.icDph",
  supplier_iban: "dodavatel.iban",
  supplier_swift: "swift",
  supplier_street: "dodavatel.ulica",
  supplier_city: "dodavatel.mesto",
  supplier_zip: "dodavatel.psc",
  buyer_name: "odberatel.nazov",
  buyer_ico: "odberatel.ico",
  buyer_dic: "odberatel.dic",
  buyer_ic_dph: "odberatel.icDph",
  buyer_street: "odberatel.ulica",
  buyer_city: "odberatel.mesto",
  buyer_zip: "odberatel.psc",
  invoice_number: "cislo",
  variable_symbol: "vs",
  constant_symbol: "ks",
  specific_symbol: "ss",
  order_number: "objednavka",
  delivery_note_number: "dodaciList",
  corrected_invoice_number: "opravuje",
  issue_date: "datumVystavenia",
  delivery_date: "datumDodania",
  due_date: "splatnost",
  amount_without_vat: "bezDph",
  vat_amount: "dph",
  amount_total: "celkom",
  amount_due: "kUhrade",
  prepaid_amount: "zaloha",
  discount_total: "zlava",
  rounding: "zaokruhlenie",
  currency: "mena",
  payment_method_text: "platba",
  reverse_charge_text: "prenesenie",
};

/** Riadky tabuliek: pole AI → časť id údaja (`rozpis.{i}.zaklad`, `polozky.{i}.cena`). */
export const POLIA_RIADKOV_AI: Record<string, { zoznam: string; polia: Record<string, string> }> = {
  vat_breakdown: { zoznam: "rozpis", polia: { base: "zaklad", vat: "dph" } },
  items: {
    zoznam: "polozky",
    polia: {
      name: "nazov",
      quantity: "mnozstvo",
      unit_price: "cena",
      total: "spolu",
      vat_rate: "sadzba",
    },
  },
};

/** Najviac toľko položiek pýtame aj s polohou — dlhá faktúra by inak zbytočne predĺžila odpoveď. */
export const MAX_POLOZIEK_S_POLOHOU = 25;

/** Doplnok pokynu na čítanie dokladu — kde je ktorá hodnota vytlačená. */
export const POKYN_POLOH = `Pridaj aj tieto údaje, ak sú na doklade (inak null) — slúžia len na označenie v náhľade:
"buyer_street", "buyer_city", "buyer_zip" (adresa ODBERATEĽA), "supplier_swift" (SWIFT/BIC dodávateľa),
"corrected_invoice_number" (číslo opravovanej faktúry pri dobropise), "payment_method_text" (spôsob
úhrady presne tak, ako je vytlačený, napr. „Prevodným príkazom"), "discount_total" (zľava na doklad
ako kladné číslo), "prepaid_amount" (odpočítaná zaplatená záloha) a "amount_due" (suma k úhrade,
keď sa líši od "amount_total").
Pridaj "field_locations" — kde presne je na doklade vytlačená hodnota polí ${Object.keys(
  POLIA_POLOH_AI,
)
  .map((k) => `"${k}"`)
  .join(", ")}.
Pridaj do "field_locations" aj polohy riadkov rozpisu DPH ako "vat_breakdown[i].base" a "vat_breakdown[i].vat"
(i = index riadku vo "vat_breakdown" od 0) — hodnotu v rekapitulácii DPH, pri tabuľke so stĺpcami
podľa sadzieb v stĺpci, ktorého HLAVIČKA zodpovedá sadzbe alebo kategórii riadku (napr. „Základná",
„Nie je predmetom DPH", „Oslobodené"), nie podľa poradia stĺpcov; stĺpec „Celkom"/„Spolu" nikdy nie je
riadok sadzby. A polohy položiek ako "items[i].name", "items[i].quantity", "items[i].unit_price",
"items[i].total", "items[i].vat_rate" (najviac prvých ${MAX_POLOZIEK_S_POLOHOU} položiek).
Pre každé vyplnené pole odmeraj na obrázku strany ohraničenie samotnej hodnoty (nie popisu pred ňou)
ako "box_2d": [ymin, xmin, ymax, xmax] — celé čísla 0–1000 voči výške a šírke strany, 0,0 je ľavý horný
roh — a "page" (číslo strany od 1). Príklad tvaru (súradnice sú len ukážka, nekopíruj ich):
{"invoice_number": {"page": 1, "box_2d": [88, 702, 104, 861]}, "amount_total": {"page": 1, "box_2d": [655, 790, 676, 905]},
 "vat_breakdown[0].base": {"page": 1, "box_2d": [610, 520, 626, 600]}}
Nikdy nedávaj [0, 0, 0, 0]. Pole, ktoré si nevyplnil alebo jeho miesto nevidíš, do "field_locations" nedávaj.`;

/** Miesto jedného údaja podľa AI a hodnota, ktorú AI vtedy prečítala. */
export type PolohaAi = {
  /**
   * Id údaja (`UdajZvyraznenia.id`, napr. "cislo", "bezDph") alebo pri
   * riadkoch tabuľky vzor s hviezdičkou ("rozpis.*.zaklad") a `index`.
   */
  kluc: string;
  /** Index riadku vo výstupe AI (rozpis DPH, položky). */
  index?: number;
  /** Index strany (od 0). */
  strana: number;
  /** Obdĺžnik v zlomkoch strany. */
  r: Obdlznik;
  /** Hodnota z AI — keď ju človek prepíše, poloha už neplatí. */
  hodnota: string | number | null;
};

/** Najviac toľko strán — náhľad aj tak kreslí len prvých niekoľko. */
const MAX_STRAN = 50;

function cislo(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Obdĺžnik z `[ymin, xmin, ymax, xmax]` v mierke 0–1000; nezmysel = null. */
export function obdlznikZBox2d(box: unknown): Obdlznik | null {
  if (!Array.isArray(box) || box.length !== 4) return null;
  const c = box.map(cislo);
  if (c.some((x) => x == null)) return null;
  let [ymin, xmin, ymax, xmax] = c as number[];
  if ([ymin, xmin, ymax, xmax].some((x) => x < 0 || x > 1000)) return null;
  // Model občas prehodí poradie rohov — obdĺžnik je ten istý.
  if (ymin > ymax) [ymin, ymax] = [ymax, ymin];
  if (xmin > xmax) [xmin, xmax] = [xmax, xmin];
  const r = { x: xmin / 1000, y: ymin / 1000, w: (xmax - xmin) / 1000, h: (ymax - ymin) / 1000 };
  // Nulová plocha nie je miesto, polovica strany nie je jedna hodnota.
  if (r.w <= 0 || r.h <= 0 || r.w * r.h > 0.25) return null;
  return r;
}

const jeHodnota = (h: unknown): h is string | number =>
  typeof h === "number" || typeof h === "string";

/**
 * Polohy v plochom tvare „cesta → miesto". AI ich vracia ploché
 * ("vat_breakdown[0].base"), občas ale aj vnorené ({"vat_breakdown": [{"base": …}]}).
 */
function plocheMiesta(polohy: Record<string, unknown>): [string, Record<string, unknown>][] {
  const out: [string, Record<string, unknown>][] = [];
  const jeMiesto = (o: Record<string, unknown>) => "box_2d" in o || "box" in o;
  for (const [k, v] of Object.entries(polohy)) {
    if (!v || typeof v !== "object") continue;
    if (Array.isArray(v)) {
      v.forEach((riadok, i) => {
        if (!riadok || typeof riadok !== "object") return;
        for (const [pk, pv] of Object.entries(riadok as Record<string, unknown>))
          if (pv && typeof pv === "object" && jeMiesto(pv as Record<string, unknown>))
            out.push([`${k}[${i}].${pk}`, pv as Record<string, unknown>]);
      });
    } else if (jeMiesto(v as Record<string, unknown>)) {
      out.push([k, v as Record<string, unknown>]);
    }
  }
  return out;
}

/** Polohy z odpovede AI (`ai.field_locations`); bez nich prázdne pole. */
export function polohyZAi(ai: unknown): PolohaAi[] {
  if (!ai || typeof ai !== "object") return [];
  const a = ai as Record<string, unknown>;
  const polohy = a.field_locations;
  if (!polohy || typeof polohy !== "object" || Array.isArray(polohy)) return [];
  const out: PolohaAi[] = [];
  for (const [cesta, o] of plocheMiesta(polohy as Record<string, unknown>)) {
    let kluc: string | null = null;
    let index: number | undefined;
    let hodnota: unknown = null;
    const m = cesta.match(/^([a-z_]+)\[(\d+)\]\.([a-z_]+)$/);
    if (m) {
      const tab = POLIA_RIADKOV_AI[m[1]];
      const pole = tab?.polia[m[3]];
      if (!tab || !pole) continue;
      index = Number(m[2]);
      kluc = `${tab.zoznam}.*.${pole}`;
      const riadky = a[m[1]];
      const riadok = Array.isArray(riadky) ? riadky[index] : null;
      hodnota =
        riadok && typeof riadok === "object" ? (riadok as Record<string, unknown>)[m[3]] : null;
    } else {
      kluc = POLIA_POLOH_AI[cesta] ?? null;
      hodnota = a[cesta];
    }
    if (!kluc) continue;
    const r = obdlznikZBox2d(o.box_2d ?? o.box);
    if (!r) continue;
    const strana = Math.round(cislo(o.page) ?? 1) - 1;
    if (strana < 0 || strana >= MAX_STRAN) continue;
    out.push({
      kluc,
      ...(index != null ? { index } : {}),
      strana,
      r,
      hodnota: jeHodnota(hodnota) ? hodnota : null,
    });
  }
  return out;
}

/** Údaje z výstupu AI, ktoré formulár nemá, no v náhľade sa označia (odberateľ, SWIFT…). */
export type DoplnokZvyraznenia = {
  odberatel?: {
    nazov?: string;
    ico?: string;
    dic?: string;
    icDph?: string;
    ulica?: string;
    mesto?: string;
    psc?: string;
  };
  swift?: string;
  /** Spôsob úhrady tak, ako je vytlačený. */
  formaUhrady?: string;
  /** Veta o prenesení daňovej povinnosti. */
  prenesenie?: string;
  opravuje?: string;
  zlava?: number;
  zaloha?: number;
  kUhrade?: number;
};

/** Doplnok zvýraznenia z výstupu AI (`nespracovane_doklady.ai`, `ai_raw`). */
export function doplnokZAi(ai: unknown): DoplnokZvyraznenia | undefined {
  if (!ai || typeof ai !== "object") return undefined;
  const a = ai as Record<string, unknown>;
  const t = (v: unknown) =>
    typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
  const n = (v: unknown) => {
    const c = cislo(typeof v === "string" ? v.replace(",", ".") : v);
    return c != null && c !== 0 ? Math.abs(c) : undefined;
  };
  const odberatel = {
    nazov: t(a.buyer_name),
    ico: t(a.buyer_ico).replace(/\s/g, ""),
    dic: t(a.buyer_dic),
    icDph: t(a.buyer_ic_dph).replace(/\s/g, ""),
    ulica: t(a.buyer_street),
    mesto: t(a.buyer_city),
    psc: t(a.buyer_zip),
  };
  const d: DoplnokZvyraznenia = {
    odberatel: Object.values(odberatel).some(Boolean) ? odberatel : undefined,
    swift: t(a.supplier_swift).replace(/\s/g, "").toUpperCase() || undefined,
    formaUhrady: t(a.payment_method_text) || undefined,
    prenesenie: t(a.reverse_charge_text) || undefined,
    opravuje: t(a.corrected_invoice_number) || undefined,
    zlava: n(a.discount_total),
    zaloha: n(a.prepaid_amount),
    kUhrade: n(a.amount_due),
  };
  return Object.values(d).some((v) => v !== undefined) ? d : undefined;
}
