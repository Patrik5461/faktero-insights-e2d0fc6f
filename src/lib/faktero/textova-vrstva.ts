/*
  Kopírovateľný text v náhľade dokladu — čisté pomôcky bez Reactu.

  Náhľad PDF je plátno; aby sa dal text označiť myšou a skopírovať, kreslí sa
  nad ním priehľadná textová vrstva pdf.js (`TextovaVrstvaPdf.tsx`). Vrstva
  kladie slová v percentách strany a veľkosť písma odvodí z CSS premennej
  `--total-scale-factor` — tú treba nastaviť podľa skutočnej šírky strany na
  obrazovke (mení sa s oknom, priblížením aj otočením v kompaktnom rozložení).

  Sken bez textovej vrstvy (obrázok, PDF z fotky) nemá čo označiť. Ak AI
  vrátila polohy vyťažených údajov, nad skenom sa položia aspoň tie hodnoty
  (`slovaZoZvyrazneni`), aby sa dalo skopírovať číslo faktúry či IBAN.
*/
import type { UdajeNespracovaneho } from "./nespracovane";
import { prazdneUdaje } from "./nespracovane";
import type { KlucPola, Obdlznik } from "./vyber-z-dokladu";
import { poleVyberu } from "./vyber-z-dokladu";
import type { Zvyraznenie } from "./zvyraznenie-vytazenych";

/**
 * Mierka textovej vrstvy: koľko px na obrazovke pripadá na 1 bod strany
 * (šírka viewportu pdf.js pri scale 1). `sirkaPx` je šírka obalu strany bez
 * transformácií (clientWidth) — priblíženie mení šírku, otočenie je CSS
 * transformácia predka a vrstva sa otočí spolu so stranou.
 */
export function mierkaTextovejVrstvy(sirkaPx: number, sirkaStranyBody: number): number {
  if (!(sirkaPx > 0) || !(sirkaStranyBody > 0)) return 0;
  return Math.round((sirkaPx / sirkaStranyBody) * 10000) / 10000;
}

/** Má obsah strany z pdf.js (getTextContent) aspoň jeden neprázdny text? */
export function maStranaText(obsah: { items?: unknown[] } | null | undefined): boolean {
  return Boolean(
    obsah?.items?.some((p) => {
      const s = (p as { str?: unknown })?.str;
      return typeof s === "string" && s.trim() !== "";
    }),
  );
}

/** Hodnota poľa v tvare, ako býva vytlačená (na skopírovanie zo skenu). */
export function textHodnoty(kluc: KlucPola, hodnota: string | number | null): string {
  if (hodnota == null || hodnota === "") return "";
  const typ = poleVyberu(kluc).typ;
  if (typ === "datum") {
    const m = String(hodnota).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : String(hodnota);
  }
  if (typ === "suma") {
    const n = typeof hodnota === "number" ? hodnota : Number(String(hodnota).replace(",", "."));
    if (!Number.isFinite(n)) return String(hodnota);
    const [cele, des] = Math.abs(n).toFixed(2).split(".");
    return `${n < 0 ? "-" : ""}${cele.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${des}`;
  }
  return String(hodnota).trim();
}

/** Slovo položené nad skenom — hodnota údaja na mieste, ktoré určila AI. */
export type SlovoSkenu = Obdlznik & { text: string; kluc: string };

/**
 * Slová pre sken bez textovej vrstvy zo zvýraznení (polohy od AI) jednej
 * strany. Každá hodnota len raz (prvý výskyt), prázdne sa vynechajú.
 */
export function slovaZoZvyrazneni(
  zvyraznenia: Zvyraznenie[],
  udaje: UdajeNespracovaneho | null | undefined,
  strana: number,
): SlovoSkenu[] {
  if (!udaje) return [];
  const out: SlovoSkenu[] = [];
  const videne = new Set<string>();
  for (const z of zvyraznenia) {
    if (z.strana !== strana || videne.has(z.kluc) || !z.r.length) continue;
    const text = z.text;
    if (!text) continue;
    videne.add(z.kluc);
    out.push({ ...z.r[0], text, kluc: z.kluc });
  }
  // Poradie čítania: zhora nadol, zľava doprava — aby označenie viacerých dávalo zmysel.
  return out.sort((a, b) => (Math.abs(a.y - b.y) > 0.01 ? a.y - b.y : a.x - b.x));
}

/** Údaje na zvýraznenie z uloženého bločku (`receipts`). */
export function udajeZBlocku(r: Record<string, any> | null | undefined): UdajeNespracovaneho {
  const u = prazdneUdaje();
  if (!r) return u;
  const s = (v: unknown) => (v == null ? "" : String(v));
  u.dodavatel = {
    ...u.dodavatel,
    nazov: s(r.supplier_name),
    ico: s(r.supplier_ico),
    dic: s(r.supplier_dic),
    icDph: s(r.supplier_ic_dph),
  };
  u.cislo = s(r.document_number);
  u.datumVystavenia = s(r.issue_date);
  u.mena = s(r.currency) || "EUR";
  const c = r.total_amount ?? r.amount_total;
  u.celkom = c != null && c !== "" ? Math.abs(Number(c)) : null;
  return u;
}
