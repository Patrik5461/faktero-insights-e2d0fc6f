/*
  Polohy vyťažených údajov, ktoré vráti AI (Gemini vie vrátiť ohraničenie
  `box_2d` v mierke 0–1000 voči strane).

  Náhľad zvýrazňuje miesto údaja predovšetkým podľa textovej vrstvy PDF
  (`zvyraznenie-vytazenych.ts`) — tá je presná. Obrázok, fotka ani sken
  textovú vrstvu nemajú; tam pomôže poloha od AI. Keď ju AI nevráti (starší
  doklad, ISDOC, iný model), zvýraznenie z textovej vrstvy ostáva ako doteraz.

  Čisté funkcie bez Reactu, aby sa dali otestovať.
*/
import type { KlucPola, Obdlznik } from "./vyber-z-dokladu";

/** Kľúč výstupu AI → pole formulára. */
export const POLIA_POLOH_AI: Record<string, KlucPola> = {
  supplier_name: "dodavatel.nazov",
  supplier_ico: "dodavatel.ico",
  supplier_dic: "dodavatel.dic",
  supplier_ic_dph: "dodavatel.icDph",
  supplier_iban: "dodavatel.iban",
  invoice_number: "cislo",
  variable_symbol: "vs",
  order_number: "objednavka",
  issue_date: "datumVystavenia",
  delivery_date: "datumDodania",
  due_date: "splatnost",
  amount_total: "celkom",
};

/** Doplnok pokynu na čítanie dokladu — kde je ktorá hodnota vytlačená. */
export const POKYN_POLOH = `Pridaj "field_locations" — kde presne je na doklade vytlačená hodnota polí ${Object.keys(
  POLIA_POLOH_AI,
)
  .map((k) => `"${k}"`)
  .join(", ")}.
Pre každé vyplnené pole odmeraj na obrázku strany ohraničenie samotnej hodnoty (nie popisu pred ňou)
ako "box_2d": [ymin, xmin, ymax, xmax] — celé čísla 0–1000 voči výške a šírke strany, 0,0 je ľavý horný
roh — a "page" (číslo strany od 1). Príklad tvaru (súradnice sú len ukážka, nekopíruj ich):
{"invoice_number": {"page": 1, "box_2d": [88, 702, 104, 861]}, "amount_total": {"page": 1, "box_2d": [655, 790, 676, 905]}}
Nikdy nedávaj [0, 0, 0, 0]. Pole, ktoré si nevyplnil alebo jeho miesto nevidíš, do "field_locations" nedávaj.`;

/** Miesto jedného údaja podľa AI a hodnota, ktorú AI vtedy prečítala. */
export type PolohaAi = {
  kluc: KlucPola;
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

/** Polohy z odpovede AI (`ai.field_locations`); bez nich prázdne pole. */
export function polohyZAi(ai: unknown): PolohaAi[] {
  if (!ai || typeof ai !== "object") return [];
  const a = ai as Record<string, unknown>;
  const polohy = a.field_locations;
  if (!polohy || typeof polohy !== "object" || Array.isArray(polohy)) return [];
  const out: PolohaAi[] = [];
  for (const [kluc, v] of Object.entries(polohy as Record<string, unknown>)) {
    const pole = POLIA_POLOH_AI[kluc];
    if (!pole || !v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const r = obdlznikZBox2d(o.box_2d ?? o.box);
    if (!r) continue;
    const strana = Math.round(cislo(o.page) ?? 1) - 1;
    if (strana < 0 || strana >= MAX_STRAN) continue;
    const h = a[kluc];
    out.push({
      kluc: pole,
      strana,
      r,
      hodnota: typeof h === "number" || typeof h === "string" ? h : null,
    });
  }
  return out;
}
