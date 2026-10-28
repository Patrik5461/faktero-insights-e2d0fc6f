/**
 * Kontrola e-faktúry — vstup je text XML (UBL 2.1 Invoice / CreditNote podľa
 * Peppol BIS Billing 3.0), výstup zoznam chýb a varovaní s kódom pravidla a
 * miestom v súbore. Čistý TypeScript bez závislostí, beží v prehliadači aj
 * na serveri; nič neukladá.
 *
 * Nenahrádza oficiálny schematron (Java/Saxon) — pokrýva najčastejšie
 * pravidlá EN 16931 a Peppol BIS, pozri `pravidla.ts`.
 */
import { ChybaXml, cestaUzla, nacitajXml } from "./xml-strom";
import { NS_CREDIT, NS_INVOICE, text, suma, zostavDoklad } from "./doklad";
import { PRAVIDLA, type Oblast, type Zavaznost } from "./pravidla";

export { PRAVIDLA, NAZVY_KATEGORII } from "./pravidla";
export type { Oblast, Pravidlo, Zavaznost } from "./pravidla";

/** Najväčší súbor, ktorý kontrola prijme (vrátane príloh v base64). */
export const MAX_VELKOST_KONTROLY = 20 * 1024 * 1024;
/** Verejná stránka bez prihlásenia má strop nižší. */
export const MAX_VELKOST_VEREJNA = 5 * 1024 * 1024;

/** Viac nálezov jedného pravidla sa neukáže — stačí vedieť, že sa opakuje. */
const MAX_NALEZOV_PRAVIDLA = 50;

export type NalezKontroly = {
  kod: string;
  oblast: Oblast;
  zavaznost: Zavaznost;
  /** Slovenský popis so `{x}` — kľúč prekladu. */
  popis: string;
  parametre: Record<string, string | number>;
  /** Kód kategórie DPH, ak sa nález týka kategórie. */
  kategoria?: string;
  riadok?: number;
  stlpec?: number;
  cesta?: string;
};

export type SuhrnDokladu = {
  druh: "Invoice" | "CreditNote";
  cislo: string | null;
  typ: string | null;
  datum: string | null;
  mena: string | null;
  predavajuci: string | null;
  kupujuci: string | null;
  sumaNaUhradu: number | null;
  pocetRiadkov: number;
};

export type VysledokKontroly = {
  /** Žiadna chyba (varovania nevadia). */
  platny: boolean;
  nalezy: NalezKontroly[];
  pocetChyb: number;
  pocetVarovani: number;
  suhrn: SuhrnDokladu | null;
  /** Koľko pravidiel sa skontrolovalo. */
  pocetPravidiel: number;
};

function vysledok(
  nalezy: NalezKontroly[],
  suhrn: SuhrnDokladu | null,
  pocetPravidiel: number,
): VysledokKontroly {
  const pocetChyb = nalezy.filter((n) => n.zavaznost === "chyba").length;
  return {
    platny: pocetChyb === 0,
    nalezy,
    pocetChyb,
    pocetVarovani: nalezy.length - pocetChyb,
    suhrn,
    pocetPravidiel,
  };
}

export function skontrolujEfakturu(xml: string): VysledokKontroly {
  let koren;
  try {
    koren = nacitajXml(xml);
  } catch (e) {
    if (!(e instanceof ChybaXml)) throw e;
    return vysledok(
      [
        {
          kod: "FAKTERO-XML-01",
          oblast: "xml",
          zavaznost: "chyba",
          popis: "Súbor nie je dobre formovaný XML: {chyba}",
          parametre: { chyba: e.message },
          riadok: e.riadok,
          stlpec: e.stlpec,
        },
      ],
      null,
      1,
    );
  }

  const spravnyKoren =
    (koren.meno === "Invoice" && koren.ns === NS_INVOICE) ||
    (koren.meno === "CreditNote" && koren.ns === NS_CREDIT);
  if (!spravnyKoren) {
    return vysledok(
      [
        {
          kod: "FAKTERO-XML-02",
          oblast: "xml",
          zavaznost: "chyba",
          popis:
            "Koreňový prvok musí byť Invoice alebo CreditNote v mennom priestore UBL 2.1 (je {koren} v „{ns}“).",
          parametre: { koren: koren.qname, ns: koren.ns || "—" },
          riadok: koren.riadok,
          stlpec: koren.stlpec,
          cesta: cestaUzla(koren),
        },
      ],
      null,
      2,
    );
  }

  const d = zostavDoklad(koren);
  const nalezy: NalezKontroly[] = [];
  for (const p of PRAVIDLA) {
    let zoznam;
    try {
      zoznam = p.over(d);
    } catch {
      // Chyba v pravidle nesmie zhodiť celú kontrolu — doklad je už aj tak čudný.
      continue;
    }
    for (const n of zoznam.slice(0, MAX_NALEZOV_PRAVIDLA)) {
      const u = n.uzol ?? null;
      nalezy.push({
        kod: p.kod,
        oblast: p.oblast,
        zavaznost: p.zavaznost,
        popis: p.popis,
        parametre: n.p ?? {},
        kategoria: n.kategoria,
        riadok: u?.riadok,
        stlpec: u?.stlpec,
        cesta: u ? cestaUzla(u) : undefined,
      });
    }
  }
  // Chyby pred varovaniami, inak podľa miesta v súbore.
  nalezy.sort(
    (a, b) =>
      (a.zavaznost === b.zavaznost ? 0 : a.zavaznost === "chyba" ? -1 : 1) ||
      (a.riadok ?? 0) - (b.riadok ?? 0),
  );

  const meno = (strana: typeof d.predavajuci) =>
    text(strana, "cac:PartyLegalEntity/cbc:RegistrationName") ??
    text(strana, "cac:PartyName/cbc:Name");
  return vysledok(
    nalezy,
    {
      druh: d.dobropis ? "CreditNote" : "Invoice",
      cislo: text(koren, "cbc:ID"),
      typ: text(koren, d.menoTypu),
      datum: text(koren, "cbc:IssueDate"),
      mena: d.mena,
      predavajuci: meno(d.predavajuci),
      kupujuci: meno(d.kupujuci),
      sumaNaUhradu: suma(d.sucty, "cbc:PayableAmount"),
      pocetRiadkov: d.riadky.length,
    },
    PRAVIDLA.length + 2,
  );
}

/** Odkaz na oficiálne znenie pravidla (docs.peppol.eu), pri vlastných `null`. */
export function odkazNaPravidlo(kod: string): string | null {
  if (kod.startsWith("PEPPOL-"))
    return `https://docs.peppol.eu/poacc/billing/3.0/rules/ubl-peppol/${kod}/`;
  if (kod.startsWith("BR-"))
    return `https://docs.peppol.eu/poacc/billing/3.0/rules/ubl-tc434/${kod}/`;
  return null;
}
