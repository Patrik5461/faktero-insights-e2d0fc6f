/**
 * Kontrola eFaktúry pred odoslaním — rozhodnutie, čo odoslanie zastaví.
 *
 * ePošták dostáva JSON a UBL si skladá sám, preto sa z tých istých údajov
 * vyrobí vlastné UBL (`kontrola-odoslania.server.ts`) a skontroluje ho
 * `skontrolujEfakturu`. Náš generátor však niektoré časti píše inak ako
 * ePošták — také pravidlá by blokovali neprávom, a preto sa pri odoslaní
 * ukážu len ako varovanie (`LEN_VAROVANIE_PRI_ODOSLANI`, `jeUdajStrany`).
 *
 * Čistý TypeScript — používa ho server aj okno odoslania.
 */
import type { NalezKontroly, VysledokKontroly } from "./kontrola";
import { NAZVY_KATEGORII } from "./kontrola/pravidla";

/**
 * Pravidlá, ktoré pri odoslaní neblokujú, hoci v kontrole sú chybou.
 *
 * - PEPPOL-EN16931-R020 — elektronická adresa predávajúceho. Pri odoslaní ju
 *   do UBL dopĺňa ePošták podľa registrácie firmy, nie podľa DIČ na karte.
 */
export const LEN_VAROVANIE_PRI_ODOSLANI: ReadonlySet<string> = new Set(["PEPPOL-EN16931-R020"]);

/**
 * Údaje strán ePošták od nás nedostáva — predávajúceho berie z registrácie
 * firmy a kupujúceho zo svojho adresára podľa Peppol ID. Nálezy v adrese,
 * IČ DPH či IČO strán (napr. krajina „Slovensko“, IČ DPH bez „SK“) sa teda
 * odoslanej faktúry netýkajú a len varujú. Výnimkou je to, čo ePoštákovi
 * posielame: elektronická adresa a meno kupujúceho.
 */
export function jeUdajStrany(n: Pick<NalezKontroly, "kod" | "cesta">): boolean {
  const c = n.cesta ?? "";
  if (c.includes("/cac:AccountingSupplierParty")) return true;
  if (!c.includes("/cac:AccountingCustomerParty")) return false;
  return !(n.kod === "PEPPOL-EN16931-R010" || n.kod === "BR-07" || c.includes("/cbc:EndpointID"));
}

/** Vlastná kontrola: suma eFaktúry (ePošták počíta z položiek) nesedí so sumou faktúry. */
export const KOD_ROZDIEL_SUMY = "FAKTERO-ODOSLANIE-01";
export const POPIS_ROZDIEL_SUMY =
  "Suma s DPH podľa položiek je {efaktura} {mena}, na faktúre {faktura} {mena}. eFaktúra počíta daň z položiek — odberateľ by dostal inú sumu ako na PDF. Skontrolujte ceny a DPH položiek.";

export type NalezOdoslania = NalezKontroly & {
  /** Pravidlo je chybou, ale pri odoslaní len varuje (pozri vyššie). */
  preradene?: boolean;
};

export type KontrolaPredOdoslanim = {
  /** Odoslanie sa smie spustiť (žiadna blokujúca chyba). */
  mozno: boolean;
  chyby: NalezOdoslania[];
  varovania: NalezOdoslania[];
  /**
   * Kontrola je len orientačná — doklad nemá vlastný generátor v presnom
   * tvare (samofaktúra), nálezy preto nikdy neblokujú.
   */
  orientacna?: boolean;
};

/**
 * Rozdelí nálezy kontroly na chyby (blokujú) a varovania (nie).
 * `orientacna` — všetky chyby sa preradia na varovania.
 */
export function vyhodnotNaOdoslanie(
  v: Pick<VysledokKontroly, "nalezy">,
  volby: { orientacna?: boolean } = {},
): KontrolaPredOdoslanim {
  const chyby: NalezOdoslania[] = [];
  const varovania: NalezOdoslania[] = [];
  for (const n of v.nalezy) {
    if (n.zavaznost !== "chyba") varovania.push(n);
    else if (volby.orientacna || LEN_VAROVANIE_PRI_ODOSLANI.has(n.kod) || jeUdajStrany(n))
      varovania.push({ ...n, zavaznost: "varovanie", preradene: true });
    else chyby.push(n);
  }
  return {
    mozno: chyby.length === 0,
    chyby,
    varovania,
    ...(volby.orientacna ? { orientacna: true } : {}),
  };
}

/** Parametre popisu nálezu vrátane názvu kategórie DPH (`{kat}`). */
export function parametreNalezu(
  n: Pick<NalezKontroly, "parametre" | "kategoria">,
  prelozKategoriu: (s: string) => string = (s) => s,
): Record<string, string | number> {
  const p: Record<string, string | number> = { ...n.parametre };
  if (n.kategoria) {
    const nazov = NAZVY_KATEGORII[n.kategoria];
    p.kat = nazov ? `${n.kategoria} (${prelozKategoriu(nazov)})` : n.kategoria;
  }
  return p;
}

/** Slovenský popis nálezu s doplnenými hodnotami (na server, do hlášok). */
export function textNalezu(n: Pick<NalezKontroly, "popis" | "parametre" | "kategoria">): string {
  const p = parametreNalezu(n);
  return n.popis.replace(/\{(\w+)\}/g, (cele, k) => (k in p ? String(p[k]) : cele));
}

/** Najviac toľko chýb sa vypíše do hlášky; zvyšok ukáže okno odoslania. */
const MAX_V_HLASKE = 8;

/** Hláška pri odmietnutí odoslania — kód pravidla a popis každej chyby. */
export function spravaOdmietnutia(
  chyby: Pick<NalezKontroly, "kod" | "popis" | "parametre" | "kategoria">[],
): string {
  const riadky = chyby.slice(0, MAX_V_HLASKE).map((n) => `${n.kod}: ${textNalezu(n)}`);
  if (chyby.length > MAX_V_HLASKE) riadky.push(`… a ďalšie (${chyby.length - MAX_V_HLASKE}).`);
  return [
    `eFaktúra neprešla kontrolou (chyby: ${chyby.length}) a neodoslala sa. Opravte faktúru a skúste to znova:`,
    ...riadky,
  ].join("\n");
}

/** Chyba, ktorou server odmietne odoslanie — nesie aj zoznam nálezov. */
export class ChybaKontrolyEfaktury extends Error {
  readonly kontrola: KontrolaPredOdoslanim;
  constructor(kontrola: KontrolaPredOdoslanim) {
    super(spravaOdmietnutia(kontrola.chyby));
    this.name = "ChybaKontrolyEfaktury";
    this.kontrola = kontrola;
  }
}
