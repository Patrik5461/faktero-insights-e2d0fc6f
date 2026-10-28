/**
 * Pravidlá kontroly e-faktúry (UBL 2.1 / Peppol BIS Billing 3.0).
 *
 * Každé pravidlo je jeden záznam: kód, oblasť, závažnosť, popis po slovensky
 * (slúži aj ako kľúč prekladu, `{x}` sa doplní z nálezu) a funkcia, ktorá
 * vráti nálezy. Nové pravidlo = nový záznam v `PRAVIDLA`.
 *
 * Kódy BR-…, BR-CO-…, BR-CL-…, BR-DEC-… sú z EN 16931 a PEPPOL-… z Peppol BIS
 * 3.0; znenie a podmienky zodpovedajú schematronom
 * (github.com/ConnectingEurope/eInvoicing-EN16931, ubl/schematron/UBL a
 * github.com/OpenPEPPOL/peppol-bis-invoice-3, rules/sch), vrátane tolerancií
 * (napr. BR-S-08/09 ±1, PEPPOL-EN16931-R120 ±0,02). Kódy FAKTERO-… sú
 * vlastné kontroly — slovenské pravidlá, ktoré pri eFaktúre dodržiavame
 * (schéma 0245 s DIČ, tvar IČ DPH a IČO…). Oficiálne nie sú, preto sú
 * prevažne len varovaním.
 */
import {
  CUSTOMIZATION_PEPPOL,
  JEDNOTKY_REC20,
  KATEGORIE_DPH,
  KRAJINY_ISO3166,
  MENY_ISO4217,
  MIME_PEPPOL,
  PLATOBNE_PROSTRIEDKY_UNCL4461,
  PROFILY_PEPPOL,
  SCHEMY_ENDPOINT_PEPPOL,
  TYPY_DOBROPISU_PEPPOL,
  TYPY_DOBROPISU_UNCL1001,
  TYPY_FAKTURY_PEPPOL,
  TYPY_FAKTURY_UNCL1001,
  VATEX,
} from "./ciselniky";
import {
  cislo,
  f2,
  icDph,
  potomkovia,
  prvy,
  r2,
  rovnake,
  suma,
  text,
  vsetky,
  NS_CAC,
  NS_CBC,
  type Doklad,
  type Riadok,
} from "./doklad";
import type { XmlUzol } from "./xml-strom";
import { jeZnamaSadzba, sadzbyKrajiny } from "../../vat-rates";

export type Zavaznost = "chyba" | "varovanie";
export type Oblast = "xml" | "en16931" | "peppol" | "sk";

export type Nalez = {
  /** Prvok, ktorého sa nález týka (pri chýbajúcom prvku jeho rodič). */
  uzol?: XmlUzol | null;
  p?: Record<string, string | number>;
  /** Kód kategórie DPH — rozhranie k nemu doplní preložený názov. */
  kategoria?: string;
};

export type Pravidlo = {
  kod: string;
  oblast: Oblast;
  zavaznost: Zavaznost;
  popis: string;
  over: (d: Doklad) => Nalez[];
};

/* ───────────── pomocníci ───────────── */

const ak = (podmienka: unknown, uzol?: XmlUzol | null, p?: Nalez["p"]): Nalez[] =>
  podmienka ? [{ uzol, p }] : [];

function kazdyPrvok(u: XmlUzol, f: (x: XmlUzol) => void) {
  f(u);
  for (const d of u.deti) kazdyPrvok(d, f);
}

const cac = (u: XmlUzol, meno: string) => u.ns === NS_CAC && u.meno === meno;

/** Riadky, zľavy a príplatky s danou kategóriou (a sadzbou). */
function zakladKategorie(d: Doklad, kat: string, sadzba?: number | null) {
  const sedi = (k: string | null, s: number | null) =>
    k === kat && (sadzba == null || (s != null && rovnake(s, sadzba)));
  const riadky = d.riadky.filter((r) => sedi(r.kategoria, r.sadzba));
  const zp = d.zlavyPriplatky.filter((z) => sedi(z.kategoria, z.sadzba));
  return (
    riadky.reduce((a, r) => a + (r.suma ?? 0), 0) +
    zp.reduce((a, z) => a + (z.priplatok ? 1 : -1) * (z.suma ?? 0), 0)
  );
}

const cRiadku = (r: Riadok) => r.id ?? String(r.poradie);

/** DIČ z elektronickej adresy v schéme 0245. */
const dicZ0245 = (strana: XmlUzol | null) => {
  const e = prvy(strana, "cbc:EndpointID");
  return e?.atributy.schemeID === "0245" ? text(e) : null;
};

export function ibanPlatny(iban: string): boolean {
  const s = iban.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(s)) return false;
  const preusp = s.slice(4) + s.slice(0, 4);
  let zvysok = 0;
  for (const ch of preusp) {
    const v = ch >= "A" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const c of v) zvysok = (zvysok * 10 + Number(c)) % 97;
  }
  return zvysok === 1;
}

/* ───────────── kategórie DPH (BR-S, BR-Z, BR-E, BR-AE, BR-IC, BR-G, BR-O) ───────────── */

type DefKategorie = {
  kat: string;
  predpona: string;
  /** Rozpis tejto kategórie smie byť len raz (všetky okrem S). */
  jedenRozpis: boolean;
  /** Čo musí mať predávajúci/kupujúci (pravidlo -02). */
  strany: "predavajuci" | "obe-ae" | "obe-ic" | "predavajuci-vat" | "ziadne";
  /** Sadzba v riadku: kladná / nula / žiadna. */
  sadzba: "kladna" | "nula" | "ziadna";
  /** Dôvod oslobodenia: zakázaný / povinný. */
  dovod: "zakazany" | "povinny";
};

const KATEGORIE: DefKategorie[] = [
  {
    kat: "S",
    predpona: "BR-S",
    jedenRozpis: false,
    strany: "predavajuci",
    sadzba: "kladna",
    dovod: "zakazany",
  },
  {
    kat: "Z",
    predpona: "BR-Z",
    jedenRozpis: true,
    strany: "predavajuci",
    sadzba: "nula",
    dovod: "zakazany",
  },
  {
    kat: "E",
    predpona: "BR-E",
    jedenRozpis: true,
    strany: "predavajuci",
    sadzba: "nula",
    dovod: "povinny",
  },
  {
    kat: "AE",
    predpona: "BR-AE",
    jedenRozpis: true,
    strany: "obe-ae",
    sadzba: "nula",
    dovod: "povinny",
  },
  {
    kat: "K",
    predpona: "BR-IC",
    jedenRozpis: true,
    strany: "obe-ic",
    sadzba: "nula",
    dovod: "povinny",
  },
  {
    kat: "G",
    predpona: "BR-G",
    jedenRozpis: true,
    strany: "predavajuci-vat",
    sadzba: "nula",
    dovod: "povinny",
  },
  {
    kat: "O",
    predpona: "BR-O",
    jedenRozpis: true,
    strany: "ziadne",
    sadzba: "ziadna",
    dovod: "povinny",
  },
];

const daneSchemaPredavajuceho = (d: Doklad) =>
  !!text(d.predavajuci, "cac:PartyTaxScheme/cbc:CompanyID") ||
  !!icDph(prvy(d.koren, "cac:TaxRepresentativeParty"));

function pravidlaKategorie(k: DefKategorie): Pravidlo[] {
  const s = (n: number) => `${k.predpona}-${String(n).padStart(2, "0")}`;
  const riadkyKat = (d: Doklad) => d.riadky.filter((r) => r.kategoria === k.kat);
  const rozpisKat = (d: Doklad) => d.rozpis.filter((r) => r.kategoria === k.kat);
  const out: Pravidlo[] = [
    {
      kod: s(1),
      oblast: "en16931",
      zavaznost: "chyba",
      popis: k.jedenRozpis
        ? "Doklad používa kategóriu DPH {kat}, preto musí mať v rozpise DPH práve jeden riadok tejto kategórie (je ich {pocet})."
        : "Riadky, zľavy alebo príplatky s kategóriou DPH {kat} a rozpis DPH si nezodpovedajú — kategória musí byť na oboch miestach alebo na žiadnom.",
      over: (d) => {
        const vPolozkach =
          riadkyKat(d).length + d.zlavyPriplatky.filter((z) => z.kategoria === k.kat).length;
        const vRozpise = rozpisKat(d).length;
        const zle = k.jedenRozpis
          ? (vPolozkach > 0 || vRozpise > 0) && vRozpise !== 1
          : vPolozkach > 0 !== vRozpise > 0;
        return zle
          ? [{ uzol: d.taxTotaly[0] ?? d.koren, p: { pocet: vRozpise }, kategoria: k.kat }]
          : [];
      },
    },
    {
      kod: s(2),
      oblast: "en16931",
      zavaznost: "chyba",
      popis: {
        predavajuci:
          "Riadok s kategóriou DPH {kat} vyžaduje IČ DPH alebo daňové identifikačné číslo predávajúceho (BT-31/BT-32).",
        "predavajuci-vat": "Riadok s kategóriou DPH {kat} vyžaduje IČ DPH predávajúceho (BT-31).",
        "obe-ae":
          "Prenesenie daňovej povinnosti ({kat}) vyžaduje IČ DPH predávajúceho a IČ DPH alebo IČO kupujúceho (BT-31, BT-48/BT-47).",
        "obe-ic":
          "Dodanie v rámci EÚ ({kat}) vyžaduje IČ DPH predávajúceho aj kupujúceho (BT-31, BT-48).",
        ziadne:
          "Pri plnení mimo predmetu DPH ({kat}) nesmie doklad uvádzať IČ DPH predávajúceho ani kupujúceho (BT-31, BT-48).",
      }[k.strany],
      over: (d) => {
        if (!riadkyKat(d).length) return [];
        const predavajuciDan = daneSchemaPredavajuceho(d);
        const predavajuciVat =
          !!icDph(d.predavajuci) || !!icDph(prvy(d.koren, "cac:TaxRepresentativeParty"));
        const kupujuciVat = !!icDph(d.kupujuci);
        const ok = {
          predavajuci: predavajuciDan,
          "predavajuci-vat": predavajuciVat,
          "obe-ae":
            predavajuciDan &&
            (kupujuciVat || !!text(d.kupujuci, "cac:PartyLegalEntity/cbc:CompanyID")),
          "obe-ic": predavajuciVat && kupujuciVat,
          ziadne: !predavajuciVat && !kupujuciVat,
        }[k.strany];
        const uzol =
          k.strany === "ziadne" ? (icDph(d.predavajuci) ?? icDph(d.kupujuci)) : d.predavajuci;
        return ok ? [] : [{ uzol: uzol ?? d.koren, kategoria: k.kat }];
      },
    },
    {
      kod: s(5),
      oblast: "en16931",
      zavaznost: "chyba",
      popis: {
        kladna: "Riadok {riadok} s kategóriou DPH {kat} musí mať sadzbu väčšiu ako nula.",
        nula: "Riadok {riadok} s kategóriou DPH {kat} musí mať sadzbu 0 %.",
        ziadna: "Riadok {riadok} s kategóriou DPH {kat} nesmie uvádzať sadzbu DPH.",
      }[k.sadzba],
      over: (d) =>
        riadkyKat(d)
          .filter((r) =>
            k.sadzba === "kladna"
              ? !(r.sadzba != null && r.sadzba > 0)
              : k.sadzba === "nula"
                ? !(r.sadzba != null && rovnake(r.sadzba, 0))
                : r.sadzba != null,
          )
          .map((r) => ({ uzol: r.kategoriaUzol, p: { riadok: cRiadku(r) }, kategoria: k.kat })),
    },
    {
      kod: s(8),
      oblast: "en16931",
      zavaznost: "chyba",
      popis:
        k.kat === "S"
          ? "Základ dane v kategórii {kat} so sadzbou {sadzba} % je {uvedene}, ale riadky, zľavy a príplatky s touto sadzbou dávajú {vypocitane}."
          : "Základ dane v kategórii {kat} je {uvedene}, ale riadky, zľavy a príplatky tejto kategórie dávajú {vypocitane}.",
      over: (d) =>
        rozpisKat(d).flatMap((r) => {
          if (r.zaklad == null || !Number.isFinite(r.zaklad)) return [];
          const v = zakladKategorie(d, k.kat, k.kat === "S" ? r.sadzba : undefined);
          // BR-S-08 má v schematrone toleranciu ±1, ostatné porovnávajú presne.
          const zle = k.kat === "S" ? Math.abs(r.zaklad - v) >= 1 : !rovnake(r2(v), r.zaklad);
          return zle
            ? [
                {
                  uzol: r.uzol,
                  p: { uvedene: f2(r.zaklad), vypocitane: f2(v), sadzba: r.sadzba ?? "" },
                  kategoria: k.kat,
                },
              ]
            : [];
        }),
    },
    {
      kod: s(9),
      oblast: "en16931",
      zavaznost: "chyba",
      popis:
        k.kat === "S"
          ? "DPH v kategórii {kat} so sadzbou {sadzba} % je {uvedene}, ale základ × sadzba dáva {vypocitane}."
          : "DPH v kategórii {kat} musí byť nula (je {uvedene}).",
      over: (d) =>
        rozpisKat(d).flatMap((r) => {
          if (r.dan == null || !Number.isFinite(r.dan)) return [];
          if (k.kat !== "S")
            return rovnake(r.dan, 0)
              ? []
              : [{ uzol: r.uzol, p: { uvedene: f2(r.dan) }, kategoria: k.kat }];
          if (r.zaklad == null || r.sadzba == null) return [];
          const v = r2((Math.abs(r.zaklad) * r.sadzba) / 100);
          return Math.abs(Math.abs(r.dan) - v) < 1
            ? []
            : [
                {
                  uzol: r.uzol,
                  p: { uvedene: f2(r.dan), vypocitane: f2(v), sadzba: r.sadzba },
                  kategoria: k.kat,
                },
              ];
        }),
    },
    {
      kod: s(10),
      oblast: "en16931",
      zavaznost: "chyba",
      popis:
        k.dovod === "zakazany"
          ? "Rozpis DPH v kategórii {kat} nesmie uvádzať dôvod oslobodenia (TaxExemptionReason/Code)."
          : "Rozpis DPH v kategórii {kat} musí uvádzať dôvod oslobodenia — text alebo kód VATEX (BT-120/BT-121).",
      over: (d) =>
        rozpisKat(d)
          .filter((r) =>
            k.dovod === "zakazany" ? !!(r.dovod || r.dovodKod) : !(r.dovod || r.dovodKod),
          )
          .map((r) => ({ uzol: r.kategoriaUzol ?? r.uzol, kategoria: k.kat })),
    },
  ];
  if (k.kat === "K") {
    out.push(
      {
        kod: "BR-IC-11",
        oblast: "en16931",
        zavaznost: "chyba",
        popis:
          "Pri dodaní v rámci EÚ ({kat}) musí byť uvedený dátum dodania (BT-72) alebo fakturačné obdobie (BG-14).",
        over: (d) =>
          ak(
            rozpisKat(d).length &&
              !text(d.koren, "cac:Delivery/cbc:ActualDeliveryDate") &&
              !text(d.koren, "cac:InvoicePeriod/cbc:StartDate") &&
              !text(d.koren, "cac:InvoicePeriod/cbc:EndDate"),
            d.koren,
          ).map((n) => ({ ...n, kategoria: "K" })),
      },
      {
        kod: "BR-IC-12",
        oblast: "en16931",
        zavaznost: "chyba",
        popis:
          "Pri dodaní v rámci EÚ ({kat}) musí byť uvedená krajina dodania (Delivery/DeliveryLocation/Address/Country, BT-80).",
        over: (d) =>
          ak(
            rozpisKat(d).length &&
              !text(
                d.koren,
                "cac:Delivery/cac:DeliveryLocation/cac:Address/cac:Country/cbc:IdentificationCode",
              ),
            d.koren,
          ).map((n) => ({ ...n, kategoria: "K" })),
      },
    );
  }
  if (k.kat === "O") {
    out.push(
      {
        kod: "BR-O-11",
        oblast: "en16931",
        zavaznost: "chyba",
        popis: "Doklad s rozpisom DPH v kategórii {kat} nesmie mať rozpis v inej kategórii.",
        over: (d) =>
          rozpisKat(d).length
            ? d.rozpis
                .filter((r) => r.kategoria !== "O")
                .map((r) => ({ uzol: r.uzol, kategoria: "O" }))
            : [],
      },
      {
        kod: "BR-O-12",
        oblast: "en16931",
        zavaznost: "chyba",
        popis:
          "Doklad s rozpisom DPH v kategórii {kat} nesmie mať riadok s inou kategóriou (riadok {riadok}).",
        over: (d) =>
          rozpisKat(d).length
            ? d.riadky
                .filter((r) => r.kategoria !== "O")
                .map((r) => ({
                  uzol: r.kategoriaUzol ?? r.uzol,
                  p: { riadok: cRiadku(r) },
                  kategoria: "O",
                }))
            : [],
      },
    );
  }
  return out;
}

/* ───────────── desatinné miesta (BR-DEC) ───────────── */

const DEC: [kod: string, cesta: string, popisPrvku: string][] = [
  ["BR-DEC-09", "cac:LegalMonetaryTotal/cbc:LineExtensionAmount", "LineExtensionAmount (BT-106)"],
  ["BR-DEC-10", "cac:LegalMonetaryTotal/cbc:AllowanceTotalAmount", "AllowanceTotalAmount (BT-107)"],
  ["BR-DEC-11", "cac:LegalMonetaryTotal/cbc:ChargeTotalAmount", "ChargeTotalAmount (BT-108)"],
  ["BR-DEC-12", "cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount", "TaxExclusiveAmount (BT-109)"],
  ["BR-DEC-13", "cac:TaxTotal/cbc:TaxAmount", "TaxTotal/TaxAmount (BT-110)"],
  ["BR-DEC-14", "cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount", "TaxInclusiveAmount (BT-112)"],
  ["BR-DEC-16", "cac:LegalMonetaryTotal/cbc:PrepaidAmount", "PrepaidAmount (BT-113)"],
  [
    "BR-DEC-17",
    "cac:LegalMonetaryTotal/cbc:PayableRoundingAmount",
    "PayableRoundingAmount (BT-114)",
  ],
  ["BR-DEC-18", "cac:LegalMonetaryTotal/cbc:PayableAmount", "PayableAmount (BT-115)"],
  [
    "BR-DEC-19",
    "cac:TaxTotal/cac:TaxSubtotal/cbc:TaxableAmount",
    "TaxSubtotal/TaxableAmount (BT-116)",
  ],
  ["BR-DEC-20", "cac:TaxTotal/cac:TaxSubtotal/cbc:TaxAmount", "TaxSubtotal/TaxAmount (BT-117)"],
  ["BR-DEC-01", "cac:AllowanceCharge/cbc:Amount", "AllowanceCharge/Amount (BT-92/BT-99)"],
];

const viacAkoDveMiesta = (t: string | null) => !!t && (t.split(".")[1]?.length ?? 0) > 2;

const pravidlaDec: Pravidlo[] = [
  ...DEC.map(([kod, cesta, prvok]): Pravidlo => ({
    kod,
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Suma {prvok} smie mať najviac 2 desatinné miesta (je {hodnota}).",
    over: (d) =>
      vsetky(d.koren, cesta)
        .filter((u) => viacAkoDveMiesta(text(u)))
        .map((u) => ({ uzol: u, p: { prvok, hodnota: text(u) ?? "" } })),
  })),
  {
    kod: "BR-DEC-23",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Suma {prvok} smie mať najviac 2 desatinné miesta (je {hodnota}).",
    over: (d) =>
      d.riadky
        .map((r) => prvy(r.uzol, "cbc:LineExtensionAmount"))
        .filter((u): u is XmlUzol => !!u && viacAkoDveMiesta(text(u)))
        .map((u) => ({
          uzol: u,
          p: { prvok: "LineExtensionAmount (BT-131)", hodnota: text(u) ?? "" },
        })),
  },
];

/* ───────────── zoznam pravidiel ───────────── */

const TYPY_SUM = new Set([
  "Amount",
  "BaseAmount",
  "PriceAmount",
  "TaxAmount",
  "TaxableAmount",
  "LineExtensionAmount",
  "TaxExclusiveAmount",
  "TaxInclusiveAmount",
  "AllowanceTotalAmount",
  "ChargeTotalAmount",
  "PrepaidAmount",
  "PayableRoundingAmount",
  "PayableAmount",
]);
const DATUMY = new Set([
  "IssueDate",
  "DueDate",
  "TaxPointDate",
  "StartDate",
  "EndDate",
  "ActualDeliveryDate",
]);
const CISELNE = new Set([
  ...TYPY_SUM,
  "InvoicedQuantity",
  "CreditedQuantity",
  "BaseQuantity",
  "Percent",
]);

const platnyDatum = (t: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(t + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
};

export const PRAVIDLA: Pravidlo[] = [
  /* — dokument — */
  {
    kod: "FAKTERO-XML-03",
    oblast: "xml",
    zavaznost: "chyba",
    popis:
      "Hodnota prvku {prvok} musí byť číslo s desatinnou bodkou, napr. 123.45 (je „{hodnota}“).",
    over: (d) => {
      const out: Nalez[] = [];
      kazdyPrvok(d.koren, (u) => {
        if (u.ns === NS_CBC && CISELNE.has(u.meno) && u.text.trim() && Number.isNaN(cislo(u.text)))
          out.push({ uzol: u, p: { prvok: u.meno, hodnota: u.text.trim() } });
      });
      return out;
    },
  },

  /* — povinné prvky a kardinalita (EN 16931) — */
  {
    kod: "BR-01",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Chýba identifikátor špecifikácie (CustomizationID, BT-24).",
    over: (d) => ak(!text(d.koren, "cbc:CustomizationID"), d.koren),
  },
  {
    kod: "BR-02",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Chýba číslo faktúry (ID, BT-1).",
    over: (d) => ak(!text(d.koren, "cbc:ID"), d.koren),
  },
  {
    kod: "BR-03",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Chýba dátum vystavenia (IssueDate, BT-2).",
    over: (d) => ak(!text(d.koren, "cbc:IssueDate"), d.koren),
  },
  {
    kod: "BR-04",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Chýba kód typu dokladu (InvoiceTypeCode / CreditNoteTypeCode, BT-3).",
    over: (d) => ak(!text(d.koren, d.menoTypu), d.koren),
  },
  {
    kod: "BR-05",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Chýba kód meny faktúry (DocumentCurrencyCode, BT-5).",
    over: (d) => ak(!d.mena, d.koren),
  },
  {
    kod: "BR-06",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Chýba obchodné meno predávajúceho (PartyLegalEntity/RegistrationName, BT-27).",
    over: (d) =>
      ak(
        !text(d.predavajuci, "cac:PartyLegalEntity/cbc:RegistrationName"),
        d.predavajuci ?? d.koren,
      ),
  },
  {
    kod: "BR-07",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Chýba obchodné meno kupujúceho (PartyLegalEntity/RegistrationName, BT-44).",
    over: (d) =>
      ak(!text(d.kupujuci, "cac:PartyLegalEntity/cbc:RegistrationName"), d.kupujuci ?? d.koren),
  },
  {
    kod: "BR-08",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Chýba poštová adresa predávajúceho (BG-5).",
    over: (d) => ak(!prvy(d.predavajuci, "cac:PostalAddress"), d.predavajuci ?? d.koren),
  },
  {
    kod: "BR-09",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Adresa predávajúceho nemá kód krajiny (BT-40).",
    over: (d) => {
      const a = prvy(d.predavajuci, "cac:PostalAddress");
      return ak(a && !d.krajinaPredavajuceho, a);
    },
  },
  {
    kod: "BR-10",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Chýba poštová adresa kupujúceho (BG-8).",
    over: (d) => ak(!prvy(d.kupujuci, "cac:PostalAddress"), d.kupujuci ?? d.koren),
  },
  {
    kod: "BR-11",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Adresa kupujúceho nemá kód krajiny (BT-55).",
    over: (d) => {
      const a = prvy(d.kupujuci, "cac:PostalAddress");
      return ak(a && !d.krajinaKupujuceho, a);
    },
  },
  {
    kod: "BR-12",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Chýba súčet čistých súm riadkov (LegalMonetaryTotal/LineExtensionAmount, BT-106).",
    over: (d) => ak(!text(d.sucty, "cbc:LineExtensionAmount"), d.sucty ?? d.koren),
  },
  {
    kod: "BR-13",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Chýba celková suma bez DPH (TaxExclusiveAmount, BT-109).",
    over: (d) => ak(!text(d.sucty, "cbc:TaxExclusiveAmount"), d.sucty ?? d.koren),
  },
  {
    kod: "BR-14",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Chýba celková suma s DPH (TaxInclusiveAmount, BT-112).",
    over: (d) => ak(!text(d.sucty, "cbc:TaxInclusiveAmount"), d.sucty ?? d.koren),
  },
  {
    kod: "BR-15",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Chýba suma na úhradu (PayableAmount, BT-115).",
    over: (d) => ak(!text(d.sucty, "cbc:PayableAmount"), d.sucty ?? d.koren),
  },
  {
    kod: "BR-16",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Faktúra musí mať aspoň jeden riadok (BG-25).",
    over: (d) => ak(!d.riadky.length, d.koren),
  },
  {
    kod: "BR-21",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Riadok {riadok} nemá identifikátor (ID, BT-126).",
    over: (d) =>
      d.riadky.filter((r) => !r.id).map((r) => ({ uzol: r.uzol, p: { riadok: r.poradie } })),
  },
  {
    kod: "BR-22",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Riadok {riadok} nemá fakturované množstvo (BT-129).",
    over: (d) =>
      d.riadky
        .filter((r) => !text(r.mnozstvo))
        .map((r) => ({ uzol: r.uzol, p: { riadok: cRiadku(r) } })),
  },
  {
    kod: "BR-23",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Množstvo v riadku {riadok} nemá mernú jednotku (unitCode, BT-130).",
    over: (d) =>
      d.riadky
        .filter((r) => r.mnozstvo && !r.mnozstvo.atributy.unitCode?.trim())
        .map((r) => ({ uzol: r.mnozstvo, p: { riadok: cRiadku(r) } })),
  },
  {
    kod: "BR-24",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Riadok {riadok} nemá čistú sumu (LineExtensionAmount, BT-131).",
    over: (d) =>
      d.riadky
        .filter((r) => r.suma == null)
        .map((r) => ({ uzol: r.uzol, p: { riadok: cRiadku(r) } })),
  },
  {
    kod: "BR-25",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Riadok {riadok} nemá názov položky (Item/Name, BT-153).",
    over: (d) =>
      d.riadky
        .filter((r) => !text(r.uzol, "cac:Item/cbc:Name"))
        .map((r) => ({ uzol: r.uzol, p: { riadok: cRiadku(r) } })),
  },
  {
    kod: "BR-26",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Riadok {riadok} nemá čistú cenu položky (Price/PriceAmount, BT-146).",
    over: (d) =>
      d.riadky
        .filter((r) => !text(r.uzol, "cac:Price/cbc:PriceAmount"))
        .map((r) => ({ uzol: r.uzol, p: { riadok: cRiadku(r) } })),
  },
  {
    kod: "BR-27",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Čistá cena položky v riadku {riadok} nesmie byť záporná (je {cena}).",
    over: (d) =>
      d.riadky.flatMap((r) => {
        const u = prvy(r.uzol, "cac:Price/cbc:PriceAmount");
        const c = cislo(text(u));
        return u && c < 0 ? [{ uzol: u, p: { riadok: cRiadku(r), cena: text(u) ?? "" } }] : [];
      }),
  },
  {
    kod: "BR-CO-04",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Riadok {riadok} nemá kategóriu DPH (Item/ClassifiedTaxCategory/ID, BT-151).",
    over: (d) =>
      d.riadky
        .filter((r) => !r.kategoria)
        .map((r) => ({ uzol: prvy(r.uzol, "cac:Item") ?? r.uzol, p: { riadok: cRiadku(r) } })),
  },
  {
    kod: "BR-CO-18",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Faktúra musí mať aspoň jeden rozpis DPH (TaxTotal/TaxSubtotal, BG-23).",
    over: (d) => ak(!d.rozpis.length, d.taxTotaly[0] ?? d.koren),
  },
  {
    kod: "BR-45",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Rozpis DPH nemá základ dane (TaxableAmount, BT-116).",
    over: (d) => d.rozpis.filter((r) => r.zaklad == null).map((r) => ({ uzol: r.uzol })),
  },
  {
    kod: "BR-46",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Rozpis DPH nemá sumu dane (TaxAmount, BT-117).",
    over: (d) => d.rozpis.filter((r) => r.dan == null).map((r) => ({ uzol: r.uzol })),
  },
  {
    kod: "BR-47",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Rozpis DPH nemá kód kategórie DPH (TaxCategory/ID, BT-118).",
    over: (d) => d.rozpis.filter((r) => !r.kategoria).map((r) => ({ uzol: r.uzol })),
  },
  {
    kod: "BR-48",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Rozpis DPH v kategórii {kat} nemá sadzbu (Percent, BT-119).",
    over: (d) =>
      d.rozpis
        .filter((r) => r.kategoria && r.kategoria !== "O" && r.sadzba == null)
        .map((r) => ({ uzol: r.kategoriaUzol ?? r.uzol, kategoria: r.kategoria! })),
  },
  {
    kod: "BR-49",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Platobný pokyn nemá kód spôsobu úhrady (PaymentMeansCode, BT-81).",
    over: (d) =>
      vsetky(d.koren, "cac:PaymentMeans")
        .filter((u) => !text(u, "cbc:PaymentMeansCode"))
        .map((u) => ({ uzol: u })),
  },
  {
    kod: "BR-50",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Platobný účet nemá identifikátor (PayeeFinancialAccount/ID, BT-84).",
    over: (d) =>
      vsetky(d.koren, "cac:PaymentMeans/cac:PayeeFinancialAccount")
        .filter((u) => !text(u, "cbc:ID"))
        .map((u) => ({ uzol: u })),
  },
  {
    kod: "BR-61",
    oblast: "en16931",
    zavaznost: "chyba",
    popis:
      "Pri úhrade prevodom (kód {kod}) musí byť uvedený účet príjemcu (PayeeFinancialAccount/ID, BT-84).",
    over: (d) =>
      vsetky(d.koren, "cac:PaymentMeans").flatMap((u) => {
        const kod = text(u, "cbc:PaymentMeansCode");
        return (kod === "30" || kod === "58") && !text(u, "cac:PayeeFinancialAccount/cbc:ID")
          ? [{ uzol: u, p: { kod } }]
          : [];
      }),
  },
  {
    kod: "BR-55",
    oblast: "en16931",
    zavaznost: "chyba",
    popis:
      "Odkaz na predchádzajúcu faktúru nemá jej číslo (BillingReference/InvoiceDocumentReference/ID, BT-25).",
    over: (d) =>
      vsetky(d.koren, "cac:BillingReference/cac:InvoiceDocumentReference")
        .filter((u) => !text(u, "cbc:ID"))
        .map((u) => ({ uzol: u })),
  },
  {
    kod: "BR-52",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Príloha nemá identifikátor (AdditionalDocumentReference/ID, BT-122).",
    over: (d) =>
      vsetky(d.koren, "cac:AdditionalDocumentReference")
        .filter((u) => !text(u, "cbc:ID"))
        .map((u) => ({ uzol: u })),
  },
  {
    kod: "BR-57",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Adresa dodania nemá kód krajiny (BT-80).",
    over: (d) =>
      vsetky(d.koren, "cac:Delivery/cac:DeliveryLocation/cac:Address")
        .filter((u) => !text(u, "cac:Country/cbc:IdentificationCode"))
        .map((u) => ({ uzol: u })),
  },
  {
    kod: "BR-62",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Elektronická adresa predávajúceho nemá schému (EndpointID/@schemeID, BT-34).",
    over: (d) => {
      const e = prvy(d.predavajuci, "cbc:EndpointID");
      return ak(e && !e.atributy.schemeID, e);
    },
  },
  {
    kod: "BR-63",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Elektronická adresa kupujúceho nemá schému (EndpointID/@schemeID, BT-49).",
    over: (d) => {
      const e = prvy(d.kupujuci, "cbc:EndpointID");
      return ak(e && !e.atributy.schemeID, e);
    },
  },
  {
    kod: "BR-29",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Koniec fakturačného obdobia ({koniec}) je skôr ako jeho začiatok ({zaciatok}).",
    over: (d) =>
      [
        ...vsetky(d.koren, "cac:InvoicePeriod"),
        ...d.riadky.flatMap((r) => vsetky(r.uzol, "cac:InvoicePeriod")),
      ].flatMap((u) => {
        const z = text(u, "cbc:StartDate");
        const k = text(u, "cbc:EndDate");
        return z && k && k < z ? [{ uzol: u, p: { zaciatok: z, koniec: k } }] : [];
      }),
  },
  {
    kod: "BR-31",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Zľava alebo príplatok na úrovni dokladu nemá sumu (Amount, BT-92/BT-99).",
    over: (d) => d.zlavyPriplatky.filter((z) => z.suma == null).map((z) => ({ uzol: z.uzol })),
  },
  {
    kod: "BR-32",
    oblast: "en16931",
    zavaznost: "chyba",
    popis:
      "Zľava alebo príplatok na úrovni dokladu nemá kategóriu DPH (TaxCategory/ID, BT-95/BT-102).",
    over: (d) => d.zlavyPriplatky.filter((z) => !z.kategoria).map((z) => ({ uzol: z.uzol })),
  },
  {
    kod: "BR-33",
    oblast: "en16931",
    zavaznost: "chyba",
    popis:
      "Zľava alebo príplatok na úrovni dokladu nemá dôvod ani kód dôvodu (BT-97/BT-98, BT-104/BT-105).",
    over: (d) =>
      d.zlavyPriplatky
        .filter(
          (z) =>
            !text(z.uzol, "cbc:AllowanceChargeReason") &&
            !text(z.uzol, "cbc:AllowanceChargeReasonCode"),
        )
        .map((z) => ({ uzol: z.uzol })),
  },
  {
    kod: "BR-CO-09",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "IČ DPH {id} musí začínať kódom krajiny podľa ISO 3166-1 (napr. SK, CZ; Grécko EL).",
    over: (d) =>
      [
        icDph(d.predavajuci),
        icDph(d.kupujuci),
        icDph(prvy(d.koren, "cac:TaxRepresentativeParty")),
      ].flatMap((p) => {
        const id = text(p, "cbc:CompanyID");
        if (!p || !id) return [];
        const pred = id.slice(0, 2);
        return KRAJINY_ISO3166.has(pred) || pred === "EL"
          ? []
          : [{ uzol: prvy(p, "cbc:CompanyID"), p: { id } }];
      }),
  },
  {
    kod: "BR-CO-26",
    oblast: "en16931",
    zavaznost: "chyba",
    popis:
      "Predávajúci musí mať identifikátor, IČO (PartyLegalEntity/CompanyID) alebo IČ DPH, aby ho kupujúci vedel rozpoznať.",
    over: (d) =>
      ak(
        d.predavajuci &&
          !icDph(d.predavajuci) &&
          !text(d.predavajuci, "cac:PartyLegalEntity/cbc:CompanyID") &&
          !vsetky(d.predavajuci, "cac:PartyIdentification/cbc:ID").some(
            (u) => text(u) && u.atributy.schemeID !== "SEPA",
          ),
        d.predavajuci,
      ),
  },

  /* — výpočty súm (EN 16931) — */
  {
    kod: "BR-CO-10",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Súčet čistých súm riadkov (BT-106) je {uvedene}, ale riadky dávajú spolu {vypocitane}.",
    over: (d) => {
      const u = prvy(d.sucty, "cbc:LineExtensionAmount");
      const uvedene = cislo(text(u));
      if (!u || !Number.isFinite(uvedene)) return [];
      const v = r2(d.riadky.reduce((a, r) => a + (r.suma ?? 0), 0));
      return ak(!rovnake(uvedene, v), u, { uvedene: f2(uvedene), vypocitane: f2(v) });
    },
  },
  {
    kod: "BR-CO-11",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Súčet zliav na doklade (BT-107) je {uvedene}, ale zľavy dávajú spolu {vypocitane}.",
    over: (d) => {
      const zlavy = d.zlavyPriplatky.filter((z) => !z.priplatok);
      const u = prvy(d.sucty, "cbc:AllowanceTotalAmount");
      const v = r2(zlavy.reduce((a, z) => a + (z.suma ?? 0), 0));
      if (!u) return ak(zlavy.length, d.sucty, { uvedene: "—", vypocitane: f2(v) });
      const uvedene = cislo(text(u));
      return ak(Number.isFinite(uvedene) && !rovnake(uvedene, v), u, {
        uvedene: f2(uvedene),
        vypocitane: f2(v),
      });
    },
  },
  {
    kod: "BR-CO-12",
    oblast: "en16931",
    zavaznost: "chyba",
    popis:
      "Súčet príplatkov na doklade (BT-108) je {uvedene}, ale príplatky dávajú spolu {vypocitane}.",
    over: (d) => {
      const pr = d.zlavyPriplatky.filter((z) => z.priplatok);
      const u = prvy(d.sucty, "cbc:ChargeTotalAmount");
      const v = r2(pr.reduce((a, z) => a + (z.suma ?? 0), 0));
      if (!u) return ak(pr.length, d.sucty, { uvedene: "—", vypocitane: f2(v) });
      const uvedene = cislo(text(u));
      return ak(Number.isFinite(uvedene) && !rovnake(uvedene, v), u, {
        uvedene: f2(uvedene),
        vypocitane: f2(v),
      });
    },
  },
  {
    kod: "BR-CO-13",
    oblast: "en16931",
    zavaznost: "chyba",
    popis:
      "Suma bez DPH (BT-109) je {uvedene}, ale súčet riadkov − zľavy + príplatky dáva {vypocitane}.",
    over: (d) => {
      const u = prvy(d.sucty, "cbc:TaxExclusiveAmount");
      const uvedene = cislo(text(u));
      const riadky = suma(d.sucty, "cbc:LineExtensionAmount");
      if (!u || !Number.isFinite(uvedene) || riadky == null || !Number.isFinite(riadky)) return [];
      const v = r2(
        riadky -
          (suma(d.sucty, "cbc:AllowanceTotalAmount") ?? 0) +
          (suma(d.sucty, "cbc:ChargeTotalAmount") ?? 0),
      );
      return ak(!rovnake(uvedene, v), u, { uvedene: f2(uvedene), vypocitane: f2(v) });
    },
  },
  {
    kod: "BR-CO-14",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Celková DPH (BT-110) je {uvedene}, ale súčet DPH v rozpise dáva {vypocitane}.",
    over: (d) =>
      d.taxTotaly.flatMap((tt) => {
        const sub = vsetky(tt, "cac:TaxSubtotal");
        const u = prvy(tt, "cbc:TaxAmount");
        const uvedene = cislo(text(u));
        if (!sub.length || !u || !Number.isFinite(uvedene)) return [];
        const v = r2(sub.reduce((a, s) => a + (suma(s, "cbc:TaxAmount") ?? 0), 0));
        return ak(!rovnake(uvedene, v), u, { uvedene: f2(uvedene), vypocitane: f2(v) });
      }),
  },
  {
    kod: "BR-CO-15",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Suma s DPH (BT-112) je {uvedene}, ale suma bez DPH + DPH dáva {vypocitane}.",
    over: (d) => {
      const u = prvy(d.sucty, "cbc:TaxInclusiveAmount");
      const uvedene = cislo(text(u));
      const bez = suma(d.sucty, "cbc:TaxExclusiveAmount");
      if (!u || !Number.isFinite(uvedene) || bez == null || !Number.isFinite(bez)) return [];
      // DPH v mene dokladu — TaxTotal s rovnakou menou (druhý môže byť v mene účtovania).
      const tt =
        d.taxTotaly.find((t) => prvy(t, "cbc:TaxAmount")?.atributy.currencyID === d.mena) ??
        d.taxTotaly[0];
      const dan = suma(tt, "cbc:TaxAmount") ?? 0;
      const v = r2(bez + dan);
      return ak(!rovnake(uvedene, v), u, { uvedene: f2(uvedene), vypocitane: f2(v) });
    },
  },
  {
    kod: "BR-CO-16",
    oblast: "en16931",
    zavaznost: "chyba",
    popis:
      "Suma na úhradu (BT-115) je {uvedene}, ale suma s DPH − zaplatené + zaokrúhlenie dáva {vypocitane}.",
    over: (d) => {
      const u = prvy(d.sucty, "cbc:PayableAmount");
      const uvedene = cislo(text(u));
      const s = suma(d.sucty, "cbc:TaxInclusiveAmount");
      if (!u || !Number.isFinite(uvedene) || s == null || !Number.isFinite(s)) return [];
      const v = r2(
        s -
          (suma(d.sucty, "cbc:PrepaidAmount") ?? 0) +
          (suma(d.sucty, "cbc:PayableRoundingAmount") ?? 0),
      );
      return ak(!rovnake(uvedene, v), u, { uvedene: f2(uvedene), vypocitane: f2(v) });
    },
  },
  {
    kod: "BR-CO-17",
    oblast: "en16931",
    zavaznost: "chyba",
    popis:
      "DPH v rozpise kategórie {kat} je {uvedene}, ale základ × sadzba {sadzba} % dáva {vypocitane}.",
    over: (d) =>
      d.rozpis.flatMap((r) => {
        if (
          r.zaklad == null ||
          r.dan == null ||
          !Number.isFinite(r.zaklad) ||
          !Number.isFinite(r.dan)
        )
          return [];
        if (r.sadzba == null || Math.round(r.sadzba) === 0)
          return Math.round(r.dan) === 0
            ? []
            : [
                {
                  uzol: r.uzol,
                  p: { uvedene: f2(r.dan), vypocitane: "0.00", sadzba: r.sadzba ?? 0 },
                  kategoria: r.kategoria ?? "",
                },
              ];
        const v = r2((Math.abs(r.zaklad) * r.sadzba) / 100);
        return Math.abs(Math.abs(r.dan) - v) < 1
          ? []
          : [
              {
                uzol: r.uzol,
                p: { uvedene: f2(r.dan), vypocitane: f2(v), sadzba: r.sadzba },
                kategoria: r.kategoria ?? "",
              },
            ];
      }),
  },

  /* — číselníky (EN 16931) — */
  {
    kod: "BR-CL-01",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Kód typu dokladu {kod} nie je v číselníku UNCL 1001.",
    over: (d) => {
      const u = prvy(d.koren, d.menoTypu);
      const kod = text(u);
      const zoznam = d.dobropis ? TYPY_DOBROPISU_UNCL1001 : TYPY_FAKTURY_UNCL1001;
      return ak(kod && !zoznam.has(kod), u, { kod: kod ?? "" });
    },
  },
  {
    kod: "BR-CL-04",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Mena faktúry {kod} nie je platný kód ISO 4217.",
    over: (d) =>
      ak(d.mena && !MENY_ISO4217.has(d.mena), prvy(d.koren, "cbc:DocumentCurrencyCode"), {
        kod: d.mena ?? "",
      }),
  },
  {
    kod: "BR-CL-14",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Kód krajiny {kod} nie je platný podľa ISO 3166-1 alpha-2.",
    over: (d) =>
      [...potomkovia(d.koren, "cac:Country"), ...potomkovia(d.koren, "cac:OriginCountry")].flatMap(
        (c) => {
          const u = prvy(c, "cbc:IdentificationCode");
          const kod = text(u);
          return kod && !KRAJINY_ISO3166.has(kod) ? [{ uzol: u, p: { kod } }] : [];
        },
      ),
  },
  {
    kod: "BR-CL-16",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Kód spôsobu úhrady {kod} nie je v číselníku UNCL 4461.",
    over: (d) =>
      vsetky(d.koren, "cac:PaymentMeans/cbc:PaymentMeansCode").flatMap((u) => {
        const kod = text(u);
        return kod && !PLATOBNE_PROSTRIEDKY_UNCL4461.has(kod) ? [{ uzol: u, p: { kod } }] : [];
      }),
  },
  {
    kod: "BR-CL-17",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Kategória DPH {kod} nie je v číselníku UNCL 5305 (S, Z, E, AE, K, G, O, L, M, B).",
    over: (d) =>
      [
        ...d.rozpis.map((r) => r.kategoriaUzol),
        ...d.zlavyPriplatky.map((z) => prvy(z.uzol, "cac:TaxCategory")),
      ].flatMap((k) => {
        const kod = text(k, "cbc:ID");
        return k && kod && !KATEGORIE_DPH.has(kod) ? [{ uzol: prvy(k, "cbc:ID"), p: { kod } }] : [];
      }),
  },
  {
    kod: "BR-CL-18",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Kategória DPH {kod} nie je v číselníku UNCL 5305 (S, Z, E, AE, K, G, O, L, M, B).",
    over: (d) =>
      d.riadky.flatMap((r) => {
        const kod = text(r.kategoriaUzol, "cbc:ID");
        return kod && !KATEGORIE_DPH.has(kod)
          ? [{ uzol: prvy(r.kategoriaUzol, "cbc:ID"), p: { kod } }]
          : [];
      }),
  },
  {
    kod: "BR-CL-22",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Kód dôvodu oslobodenia {kod} nie je v číselníku VATEX.",
    over: (d) =>
      potomkovia(d.koren, "cbc:TaxExemptionReasonCode").flatMap((u) => {
        const kod = text(u);
        return kod && !VATEX.has(kod.toUpperCase()) ? [{ uzol: u, p: { kod } }] : [];
      }),
  },
  {
    kod: "BR-CL-23",
    oblast: "en16931",
    zavaznost: "chyba",
    popis: "Merná jednotka {kod} nie je v číselníku UN/ECE Rec. 20/21 (kus je C62, hodina HUR).",
    over: (d) =>
      [...d.riadky.map((r) => r.mnozstvo), ...potomkovia(d.koren, "cbc:BaseQuantity")].flatMap(
        (u) => {
          const kod = u?.atributy.unitCode?.trim();
          return u && kod && !JEDNOTKY_REC20.has(kod) ? [{ uzol: u, p: { kod } }] : [];
        },
      ),
  },

  /* — kategórie DPH — */
  ...KATEGORIE.flatMap(pravidlaKategorie),

  /* — desatinné miesta — */
  ...pravidlaDec,

  /* — Peppol BIS 3.0 — */
  {
    kod: "PEPPOL-EN16931-R001",
    oblast: "peppol",
    zavaznost: "chyba",
    popis: "Chýba identifikátor obchodného procesu (ProfileID).",
    over: (d) => ak(!text(d.koren, "cbc:ProfileID"), d.koren),
  },
  {
    kod: "PEPPOL-EN16931-R007",
    oblast: "peppol",
    zavaznost: "chyba",
    popis:
      "ProfileID „{hodnota}“ nie je schválený proces Peppol BIS (očakáva sa urn:fdc:peppol.eu:2017:poacc:billing:01:1.0).",
    over: (d) => {
      const u = prvy(d.koren, "cbc:ProfileID");
      const h = text(u);
      return ak(h && !PROFILY_PEPPOL.has(h), u, { hodnota: h ?? "" });
    },
  },
  {
    kod: "PEPPOL-EN16931-R004",
    oblast: "peppol",
    zavaznost: "chyba",
    popis:
      "CustomizationID musí začínať urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0 (je „{hodnota}“).",
    over: (d) => {
      const u = prvy(d.koren, "cbc:CustomizationID");
      const h = text(u);
      return ak(h && (!h.startsWith(CUSTOMIZATION_PEPPOL) || h.includes("::")), u, {
        hodnota: h ?? "",
      });
    },
  },
  {
    kod: "PEPPOL-EN16931-R002",
    oblast: "peppol",
    zavaznost: "chyba",
    popis: "V hlavičke dokladu smie byť najviac jedna poznámka (Note), je ich {pocet}.",
    over: (d) => {
      const n = vsetky(d.koren, "cbc:Note");
      const de = d.krajinaPredavajuceho === "DE" && d.krajinaKupujuceho === "DE";
      return ak(n.length > 1 && !de, n[1], { pocet: n.length });
    },
  },
  {
    kod: "PEPPOL-EN16931-R003",
    oblast: "peppol",
    zavaznost: "chyba",
    popis:
      "Chýba referencia kupujúceho (BuyerReference) aj číslo objednávky (OrderReference/ID) — aspoň jedno je povinné.",
    over: (d) =>
      ak(
        !text(d.koren, "cbc:BuyerReference") && !text(d.koren, "cac:OrderReference/cbc:ID"),
        d.koren,
      ),
  },
  {
    kod: "PEPPOL-EN16931-R008",
    oblast: "peppol",
    zavaznost: "chyba",
    popis: "Prvok {prvok} je prázdny — prázdne prvky nie sú povolené.",
    over: (d) => {
      const out: Nalez[] = [];
      kazdyPrvok(d.koren, (u) => {
        if (!u.deti.length && !u.text.trim()) out.push({ uzol: u, p: { prvok: u.qname } });
      });
      return out;
    },
  },
  {
    kod: "PEPPOL-EN16931-R010",
    oblast: "peppol",
    zavaznost: "chyba",
    popis:
      "Chýba elektronická adresa kupujúceho (EndpointID) — bez nej sa faktúra v sieti Peppol nedoručí.",
    over: (d) => ak(d.kupujuci && !prvy(d.kupujuci, "cbc:EndpointID"), d.kupujuci),
  },
  {
    kod: "PEPPOL-EN16931-R020",
    oblast: "peppol",
    zavaznost: "chyba",
    popis: "Chýba elektronická adresa predávajúceho (EndpointID).",
    over: (d) => ak(d.predavajuci && !prvy(d.predavajuci, "cbc:EndpointID"), d.predavajuci),
  },
  {
    kod: "PEPPOL-EN16931-CL008",
    oblast: "peppol",
    zavaznost: "chyba",
    popis:
      "Schéma elektronickej adresy „{kod}“ nie je v zozname Peppol (slovenská firma používa 0245).",
    over: (d) =>
      potomkovia(d.koren, "cbc:EndpointID").flatMap((u) => {
        const kod = u.atributy.schemeID;
        return kod != null && !SCHEMY_ENDPOINT_PEPPOL.has(kod) ? [{ uzol: u, p: { kod } }] : [];
      }),
  },
  {
    kod: "PEPPOL-EN16931-R053",
    oblast: "peppol",
    zavaznost: "chyba",
    popis: "Doklad musí mať práve jeden TaxTotal s rozpisom DPH (je ich {pocet}).",
    over: (d) => {
      const n = d.taxTotaly.filter((t) => prvy(t, "cac:TaxSubtotal")).length;
      return ak(n !== 1, d.taxTotaly[1] ?? d.koren, { pocet: n });
    },
  },
  {
    kod: "PEPPOL-EN16931-R051",
    oblast: "peppol",
    zavaznost: "chyba",
    popis: "Mena sumy {prvok} ({mena}) sa líši od meny faktúry ({menaFaktury}).",
    over: (d) => {
      if (!d.mena) return [];
      const out: Nalez[] = [];
      kazdyPrvok(d.koren, (u) => {
        if (!(u.ns === NS_CBC && TYPY_SUM.has(u.meno))) return;
        // Výnimka: DPH v mene účtovania (TaxTotal bez rozpisu, BT-111).
        if (
          u.meno === "TaxAmount" &&
          u.rodic &&
          cac(u.rodic, "TaxTotal") &&
          !prvy(u.rodic, "cac:TaxSubtotal")
        )
          return;
        const m = u.atributy.currencyID;
        if (m && m !== d.mena)
          out.push({ uzol: u, p: { prvok: u.meno, mena: m, menaFaktury: d.mena! } });
      });
      return out;
    },
  },
  {
    kod: "PEPPOL-EN16931-CL007",
    oblast: "peppol",
    zavaznost: "chyba",
    popis: "Mena {kod} v atribúte currencyID nie je platný kód ISO 4217.",
    over: (d) => {
      const out: Nalez[] = [];
      kazdyPrvok(d.koren, (u) => {
        const m = u.atributy.currencyID;
        if (u.ns === NS_CBC && TYPY_SUM.has(u.meno) && m != null && !MENY_ISO4217.has(m))
          out.push({ uzol: u, p: { kod: m } });
      });
      return out;
    },
  },
  {
    kod: "PEPPOL-EN16931-F001",
    oblast: "peppol",
    zavaznost: "chyba",
    popis: "Dátum {prvok} musí byť v tvare RRRR-MM-DD (je „{hodnota}“).",
    over: (d) => {
      const out: Nalez[] = [];
      kazdyPrvok(d.koren, (u) => {
        if (u.ns === NS_CBC && DATUMY.has(u.meno) && u.text.trim() && !platnyDatum(u.text.trim()))
          out.push({ uzol: u, p: { prvok: u.meno, hodnota: u.text.trim() } });
      });
      return out;
    },
  },
  {
    kod: "PEPPOL-EN16931-P0100",
    oblast: "peppol",
    zavaznost: "chyba",
    popis: "Typ faktúry {kod} nie je v Peppol BIS Billing 3.0 povolený.",
    over: (d) => {
      if (d.dobropis || !PROFILY_PEPPOL.has(text(d.koren, "cbc:ProfileID") ?? "")) return [];
      const u = prvy(d.koren, "cbc:InvoiceTypeCode");
      const kod = text(u);
      return ak(kod && !TYPY_FAKTURY_PEPPOL.has(kod), u, { kod: kod ?? "" });
    },
  },
  {
    kod: "PEPPOL-EN16931-P0101",
    oblast: "peppol",
    zavaznost: "chyba",
    popis: "Typ dobropisu {kod} nie je v Peppol BIS Billing 3.0 povolený.",
    over: (d) => {
      if (!d.dobropis || !PROFILY_PEPPOL.has(text(d.koren, "cbc:ProfileID") ?? "")) return [];
      const u = prvy(d.koren, "cbc:CreditNoteTypeCode");
      const kod = text(u);
      return ak(kod && !TYPY_DOBROPISU_PEPPOL.has(kod), u, { kod: kod ?? "" });
    },
  },
  {
    kod: "PEPPOL-EN16931-P0112",
    oblast: "peppol",
    zavaznost: "chyba",
    popis:
      "Typ dokladu {kod} je povolený len medzi dvoma nemeckými firmami (384 aj medzi dvoma slovenskými).",
    over: (d) => {
      const u = prvy(d.koren, "cbc:InvoiceTypeCode");
      const kod = text(u);
      if (!kod || !["326", "384", "389"].includes(kod)) return [];
      const de = d.krajinaPredavajuceho === "DE" && d.krajinaKupujuceho === "DE";
      const sk = kod === "384" && d.krajinaPredavajuceho === "SK" && d.krajinaKupujuceho === "SK";
      return ak(!de && !sk, u, { kod });
    },
  },
  {
    kod: "PEPPOL-EN16931-P0104",
    oblast: "peppol",
    zavaznost: "chyba",
    popis: "Kód oslobodenia {kod} vyžaduje kategóriu DPH {ocakavana}, nie {skutocna}.",
    over: (d) => {
      // P0104 až P0111 — kód VATEX určuje kategóriu.
      const MAPA: Record<string, string> = {
        "VATEX-EU-G": "G",
        "VATEX-EU-O": "O",
        "VATEX-EU-IC": "K",
        "VATEX-EU-AE": "AE",
        "VATEX-EU-D": "E",
        "VATEX-EU-F": "E",
        "VATEX-EU-I": "E",
        "VATEX-EU-J": "E",
      };
      return potomkovia(d.koren, "cbc:TaxExemptionReasonCode").flatMap((u) => {
        const kod = text(u)?.toUpperCase() ?? "";
        const ocakavana = MAPA[kod];
        const skutocna = text(u.rodic, "cbc:ID") ?? "—";
        return ocakavana && skutocna !== ocakavana
          ? [{ uzol: u, p: { kod, ocakavana, skutocna } }]
          : [];
      });
    },
  },
  {
    kod: "PEPPOL-EN16931-R061",
    oblast: "peppol",
    zavaznost: "chyba",
    popis: "Pri inkase (kód {kod}) musí byť uvedená referencia mandátu (PaymentMandate/ID).",
    over: (d) =>
      vsetky(d.koren, "cac:PaymentMeans").flatMap((u) => {
        const kod = text(u, "cbc:PaymentMeansCode");
        return (kod === "49" || kod === "59") && !text(u, "cac:PaymentMandate/cbc:ID")
          ? [{ uzol: u, p: { kod } }]
          : [];
      }),
  },
  {
    kod: "PEPPOL-EN16931-R120",
    oblast: "peppol",
    zavaznost: "chyba",
    popis:
      "Čistá suma riadku {riadok} je {uvedene}, ale množstvo × cena (+ príplatky − zľavy riadku) dáva {vypocitane}.",
    over: (d) =>
      d.riadky.flatMap((r) => {
        const q = cislo(text(r.mnozstvo));
        const cena = suma(r.uzol, "cac:Price/cbc:PriceAmount");
        const zaklad = suma(r.uzol, "cac:Price/cbc:BaseQuantity") ?? 1;
        if (
          r.suma == null ||
          !Number.isFinite(r.suma) ||
          !Number.isFinite(q) ||
          cena == null ||
          !Number.isFinite(cena) ||
          !(zaklad > 0)
        )
          return [];
        const zp = vsetky(r.uzol, "cac:AllowanceCharge").reduce(
          (a, z) =>
            a +
            (text(z, "cbc:ChargeIndicator")?.toLowerCase() === "true" ? 1 : -1) *
              (suma(z, "cbc:Amount") ?? 0),
          0,
        );
        const v = q * (cena / zaklad) + zp;
        return Math.abs(r.suma - v) > 0.02
          ? [
              {
                uzol: prvy(r.uzol, "cbc:LineExtensionAmount"),
                p: { riadok: cRiadku(r), uvedene: f2(r.suma), vypocitane: f2(v) },
              },
            ]
          : [];
      }),
  },
  {
    kod: "PEPPOL-EN16931-R121",
    oblast: "peppol",
    zavaznost: "chyba",
    popis:
      "Základné množstvo ceny (Price/BaseQuantity) v riadku {riadok} musí byť väčšie ako nula.",
    over: (d) =>
      d.riadky.flatMap((r) => {
        const u = prvy(r.uzol, "cac:Price/cbc:BaseQuantity");
        return u && !(cislo(text(u)) > 0) ? [{ uzol: u, p: { riadok: cRiadku(r) } }] : [];
      }),
  },
  {
    kod: "PEPPOL-EN16931-R044",
    oblast: "peppol",
    zavaznost: "chyba",
    popis:
      "Príplatok na úrovni ceny nie je povolený — Price/AllowanceCharge/ChargeIndicator musí byť false (riadok {riadok}).",
    over: (d) =>
      d.riadky.flatMap((r) =>
        vsetky(r.uzol, "cac:Price/cac:AllowanceCharge")
          .filter((z) => text(z, "cbc:ChargeIndicator") !== "false")
          .map((z) => ({ uzol: z, p: { riadok: cRiadku(r) } })),
      ),
  },
  {
    kod: "PEPPOL-EN16931-R046",
    oblast: "peppol",
    zavaznost: "chyba",
    popis: "Čistá cena v riadku {riadok} sa musí rovnať hrubej cene mínus zľava z ceny.",
    over: (d) =>
      d.riadky.flatMap((r) =>
        vsetky(r.uzol, "cac:Price/cac:AllowanceCharge").flatMap((z) => {
          const zaklad = suma(z, "cbc:BaseAmount");
          const cena = suma(r.uzol, "cac:Price/cbc:PriceAmount");
          if (zaklad == null || cena == null) return [];
          return rovnake(cena, zaklad - (suma(z, "cbc:Amount") ?? 0))
            ? []
            : [{ uzol: z, p: { riadok: cRiadku(r) } }];
        }),
      ),
  },
  {
    kod: "PEPPOL-EN16931-CL001",
    oblast: "peppol",
    zavaznost: "chyba",
    popis:
      "Typ prílohy {kod} nie je v Peppole povolený (povolené sú PDF, PNG, JPEG, CSV, XLSX a ODS).",
    over: (d) =>
      potomkovia(d.koren, "cbc:EmbeddedDocumentBinaryObject").flatMap((u) => {
        const kod = u.atributy.mimeCode;
        return kod != null && !MIME_PEPPOL.has(kod) ? [{ uzol: u, p: { kod } }] : [];
      }),
  },

  /* — slovenské pravidlá eFaktúry 2027 (vlastné kontroly Faktera) — */
  {
    kod: "FAKTERO-SK-01",
    oblast: "sk",
    zavaznost: "varovanie",
    popis:
      "Slovenský predávajúci sa v sieti Peppol adresuje schémou 0245 s DIČ, tu je schéma „{schema}“.",
    over: (d) => {
      const e = prvy(d.predavajuci, "cbc:EndpointID");
      const schema = e?.atributy.schemeID;
      return ak(d.krajinaPredavajuceho === "SK" && e && schema && schema !== "0245", e, {
        schema: schema ?? "",
      });
    },
  },
  {
    kod: "FAKTERO-SK-02",
    oblast: "sk",
    zavaznost: "varovanie",
    popis:
      "Slovenský kupujúci sa v sieti Peppol adresuje schémou 0245 s DIČ, tu je schéma „{schema}“ — faktúra mu nemusí byť doručená.",
    over: (d) => {
      const e = prvy(d.kupujuci, "cbc:EndpointID");
      const schema = e?.atributy.schemeID;
      return ak(d.krajinaKupujuceho === "SK" && e && schema && schema !== "0245", e, {
        schema: schema ?? "",
      });
    },
  },
  {
    kod: "FAKTERO-SK-03",
    oblast: "sk",
    zavaznost: "chyba",
    popis: "Adresa v schéme 0245 musí byť DIČ — 10 číslic bez predpony SK (je „{hodnota}“).",
    over: (d) =>
      potomkovia(d.koren, "cbc:EndpointID").flatMap((u) => {
        const h = text(u) ?? "";
        return u.atributy.schemeID === "0245" && !/^\d{10}$/.test(h)
          ? [{ uzol: u, p: { hodnota: h } }]
          : [];
      }),
  },
  {
    kod: "FAKTERO-SK-04",
    oblast: "sk",
    zavaznost: "varovanie",
    popis: "DIČ v elektronickej adrese ({dic}) sa nezhoduje s IČ DPH {icdph} tej istej strany.",
    over: (d) =>
      [d.predavajuci, d.kupujuci].flatMap((strana) => {
        const dic = dicZ0245(strana);
        const ic = text(icDph(strana), "cbc:CompanyID");
        if (!dic || !ic || !/^SK\d{10}$/i.test(ic)) return [];
        return ic.slice(2) === dic
          ? []
          : [{ uzol: prvy(strana, "cbc:EndpointID"), p: { dic, icdph: ic } }];
      }),
  },
  {
    kod: "FAKTERO-SK-05",
    oblast: "sk",
    zavaznost: "varovanie",
    popis: "Slovenské IČ DPH má tvar SK a 10 číslic (je „{hodnota}“).",
    over: (d) =>
      [icDph(d.predavajuci), icDph(d.kupujuci)].flatMap((p) => {
        const h = text(p, "cbc:CompanyID") ?? "";
        return h.toUpperCase().startsWith("SK") && !/^SK\d{10}$/.test(h)
          ? [{ uzol: prvy(p, "cbc:CompanyID"), p: { hodnota: h } }]
          : [];
      }),
  },
  {
    kod: "FAKTERO-SK-06",
    oblast: "sk",
    zavaznost: "varovanie",
    popis: "IČO slovenskej firmy má 8 číslic (je „{hodnota}“).",
    over: (d) =>
      (
        [
          [d.predavajuci, d.krajinaPredavajuceho],
          [d.kupujuci, d.krajinaKupujuceho],
        ] as const
      ).flatMap(([strana, krajina]) => {
        const u = prvy(strana, "cac:PartyLegalEntity/cbc:CompanyID");
        const h = (text(u) ?? "").replace(/\s/g, "");
        // Iná schéma ako IČO (napr. 0245 s DIČ) sa netýka.
        if (krajina !== "SK" || !u || u.atributy.schemeID) return [];
        return /^\d{8}$/.test(h) ? [] : [{ uzol: u, p: { hodnota: text(u) ?? "" } }];
      }),
  },
  {
    kod: "FAKTERO-SK-07",
    oblast: "sk",
    zavaznost: "chyba",
    popis:
      "Dobropis a opravná faktúra (typ {kod}) musí obsahovať číslo pôvodnej faktúry (BillingReference, BT-25).",
    over: (d) => {
      const kod = text(d.koren, d.menoTypu);
      return ak(
        d.krajinaPredavajuceho === "SK" &&
          kod &&
          ["381", "383", "384"].includes(kod) &&
          !text(d.koren, "cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID"),
        prvy(d.koren, d.menoTypu),
        { kod: kod ?? "" },
      );
    },
  },
  {
    kod: "FAKTERO-SK-08",
    oblast: "sk",
    zavaznost: "varovanie",
    popis:
      "Sadzba DPH {sadzba} % sa na Slovensku nepoužíva (k dátumu vystavenia platia {sadzby} %).",
    over: (d) => {
      if (d.krajinaPredavajuceho !== "SK") return [];
      const sadzby = sadzbyKrajiny("SK", text(d.koren, "cbc:IssueDate")).join(", ");
      const videne = new Set<number>();
      return d.rozpis.flatMap((r) => {
        if (
          r.kategoria !== "S" ||
          r.sadzba == null ||
          jeZnamaSadzba(r.sadzba, "SK") ||
          videne.has(r.sadzba)
        )
          return [];
        videne.add(r.sadzba);
        return [{ uzol: r.kategoriaUzol ?? r.uzol, p: { sadzba: r.sadzba, sadzby } }];
      });
    },
  },
  {
    kod: "FAKTERO-SK-09",
    oblast: "sk",
    zavaznost: "varovanie",
    popis: "IBAN {iban} nemá platný kontrolný súčet — skontrolujte číslo účtu.",
    over: (d) =>
      vsetky(d.koren, "cac:PaymentMeans").flatMap((pm) => {
        const kod = text(pm, "cbc:PaymentMeansCode");
        const u = prvy(pm, "cac:PayeeFinancialAccount/cbc:ID");
        const iban = text(u);
        return kod === "58" && iban && !ibanPlatny(iban) ? [{ uzol: u, p: { iban } }] : [];
      }),
  },
];

/** Slovenské názvy kategórií DPH (UNCL 5305) — na zobrazenie pri nálezoch. */
export const NAZVY_KATEGORII: Record<string, string> = {
  S: "základná alebo znížená sadzba",
  Z: "nulová sadzba",
  E: "oslobodené od dane",
  AE: "prenesenie daňovej povinnosti",
  K: "dodanie tovaru alebo služby v rámci EÚ",
  G: "vývoz mimo EÚ",
  O: "mimo predmetu DPH",
  L: "Kanárske ostrovy (IGIC)",
  M: "Ceuta a Melilla (IPSI)",
  B: "rozdelená platba (Taliansko)",
};
