/*
  Prijatá eFaktúra (UBL / Peppol BIS 3.0) → údaje prijatej faktúry.

  Doteraz sa pri zaevidovaní brali len hlavičkové sumy vytiahnuté regulárnym
  výrazom: celková suma, jedna DPH a nič viac. Zaplatená záloha (BT-113) sa
  stratila v poznámke, takže faktúra chcela na úhradu celú sumu, a rozpis
  DPH po sadzbách, položky, IČO, IBAN či VS chýbali — hoci ich eFaktúra nesie
  presne. Tu sa doklad číta celým XML parserom kontroly (rozlišuje menné
  priestory, nie predpony) a údaje sa berú tak, ako ich napísal dodávateľ:

  - `celkom` = TaxInclusiveAmount (BT-112), suma dokladu s DPH,
  - základ a DPH po sadzbách z TaxSubtotal (BG-23),
  - `zaloha` = PrepaidAmount (BT-113), nezdanená zaplatená záloha,
  - `naUhradu` = PayableAmount (BT-115).

  Zdanená záloha (doklad k prijatej platbe) prichádza ako záporný riadok v
  sadzbe — ten je skutočnou položkou a znižuje základ aj DPH, do `zaloha` sa
  nepočíta (odpočítal by sa dvakrát). Zľavy a príplatky na doklad (BG-20,
  BG-21) idú do položiek ako samostatné riadky, aby súčet položiek sedel so
  základom dokladu.

  Čisté funkcie bez databázy — testy v `prijata-z-ubl.test.ts`.
*/

import { nacitajXml } from "./kontrola/xml-strom";
import { cislo, icDph, prvy, suma, text, vsetky, zostavDoklad } from "./kontrola/doklad";
import type { UdajeNespracovaneho } from "../nespracovane";

export type DruhPrijatejEfaktury =
  "faktura" | "dobropis" | "zalohova" | "samofaktura" | "samofaktura_dobropis";

export type PolozkaZUbl = {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  vat_rate: number | null;
  /** Suma riadku bez DPH (BT-131), ako `total` pri položkách prijatej faktúry. */
  total: number | null;
  /** Položka v prenesení daňovej povinnosti (kategória AE). */
  pdp?: boolean;
};

export type SadzbaZUbl = { sadzba: number; kategoria: string | null; zaklad: number; dph: number };

export type PrijataZUbl = {
  druh: DruhPrijatejEfaktury;
  typKod: string | null;
  cislo: string | null;
  vystavenie: string | null;
  dodanie: string | null;
  splatnost: string | null;
  mena: string;
  dodavatel: {
    nazov: string | null;
    ico: string | null;
    dic: string | null;
    icDph: string | null;
    ulica: string | null;
    mesto: string | null;
    psc: string | null;
    krajina: string | null;
    email: string | null;
  };
  /** Odberateľ z AccountingCustomerParty — na kontrolu, či faktúra patrí firme. */
  odberatel?: {
    nazov: string | null;
    ico: string | null;
    dic: string | null;
    icDph: string | null;
  };
  iban: string | null;
  vs: string | null;
  objednavka: string | null;
  /** Forma úhrady vo Fakteri (`prevod`, `hotovost`, `karta`, `inkaso`) alebo null. */
  platba: string | null;
  /** Kladné sumy ako v UBL — znamienko dobropisu nesie `druh`. */
  zaklad: number;
  dph: number;
  celkom: number;
  zaloha: number;
  naUhradu: number;
  zaokruhlenie: number;
  rozpis: SadzbaZUbl[];
  polozky: PolozkaZUbl[];
  /** Celý doklad je v prenesení daňovej povinnosti (všetky sadzby AE). */
  prenesenie: boolean;
  /** Číslo pôvodnej faktúry pri dobropise (BT-25). */
  opravuje: string | null;
  /** Čísla odkazovaných dokladov (BillingReference, AdditionalDocumentReference bez prílohy). */
  odkazy: string[];
};

const r2 = (n: number) => Math.round((n + Number.EPSILON * Math.sign(n)) * 100) / 100;
const cisloAleboNull = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? null : n;

/** UN/ECE Rec. 20 → jednotka vo Fakteri (opak `mapUnit` pri odosielaní). */
const JEDNOTKY: Record<string, string> = {
  C62: "ks",
  H87: "ks",
  EA: "ks",
  HUR: "hod",
  DAY: "deň",
  MON: "mes",
  ANN: "rok",
  KMT: "km",
  KGM: "kg",
  TNE: "t",
  LTR: "l",
  MTR: "m",
  MTK: "m2",
  MTQ: "m3",
  SET: "sada",
  PR: "pár",
};

export function jednotkaZKodu(kod: string | null | undefined): string | null {
  const k = String(kod ?? "")
    .trim()
    .toUpperCase();
  if (!k) return null;
  return JEDNOTKY[k] ?? k.toLowerCase();
}

/** Forma úhrady z kódu UNCL 4461 (BT-81). */
export function platbaZKodu(kod: string | null | undefined): string | null {
  const k = String(kod ?? "").trim();
  if (!k) return null;
  if (["30", "31", "42", "58", "59"].includes(k)) return k === "59" ? "inkaso" : "prevod";
  if (k === "49") return "inkaso";
  if (k === "10") return "hotovost";
  if (["48", "54", "55"].includes(k)) return "karta";
  return null;
}

/** Druh dokladu podľa typu (BT-3) a procesu (ProfileID). */
export function druhZTypu(
  typKod: string | null,
  dobropisKoren: boolean,
  profil: string | null,
): DruhPrijatejEfaktury {
  const samofaktura =
    typKod === "389" ||
    typKod === "527" ||
    typKod === "261" ||
    /^urn:fdc:peppol\.eu:2017:poacc:selfbilling:/.test(profil ?? "");
  const dobropis = dobropisKoren || typKod === "381" || typKod === "261";
  if (samofaktura) return dobropis ? "samofaktura_dobropis" : "samofaktura";
  if (dobropis) return "dobropis";
  // 386 zálohová faktúra (Prepayment invoice).
  if (typKod === "386") return "zalohova";
  return "faktura";
}

/** IČO z identifikácie strany: PartyLegalEntity, inak PartyIdentification (8 číslic). */
function icoStrany(strana: ReturnType<typeof prvy>): string | null {
  const kandidati = [
    text(strana, "cac:PartyLegalEntity/cbc:CompanyID"),
    ...vsetky(strana, "cac:PartyIdentification/cbc:ID").map((u) => text(u)),
  ];
  for (const k of kandidati) {
    const c = String(k ?? "").replace(/\s/g, "");
    if (/^\d{6,8}$/.test(c)) return c;
  }
  return null;
}

/**
 * Rozoberie prijatú eFaktúru. Pri XML, ktoré sa nedá načítať, vráti `null` —
 * volajúci vtedy ostane pri hlavičke z `parseEfakturaEnvelope`.
 */
export function rozoberPrijatuUbl(xml: string): PrijataZUbl | null {
  let koren;
  try {
    koren = nacitajXml(xml);
  } catch {
    return null;
  }
  if (koren.meno !== "Invoice" && koren.meno !== "CreditNote") return null;
  const d = zostavDoklad(koren);
  const mena = (d.mena ?? "EUR").toUpperCase();
  const typKod = text(koren, d.menoTypu);
  const druh = druhZTypu(typKod, d.dobropis, text(koren, "cbc:ProfileID"));

  /* Rozpis DPH: TaxTotal v mene dokladu, ktorý má TaxSubtotal (BT-110). Druhý
     TaxTotal (BT-111) je len DPH v mene účtovania a sumy by sa zdvojili. */
  const ttDokladu =
    d.taxTotaly.find(
      (tt) =>
        vsetky(tt, "cac:TaxSubtotal").length > 0 &&
        (prvy(tt, "cbc:TaxAmount")?.atributy.currencyID ?? mena).toUpperCase() === mena,
    ) ??
    d.taxTotaly.find((tt) => vsetky(tt, "cac:TaxSubtotal").length > 0) ??
    null;
  const rozpis: SadzbaZUbl[] = d.rozpis
    .filter((r) => !ttDokladu || r.uzol.rodic === ttDokladu)
    .map((r) => ({
      sadzba: Number.isFinite(r.sadzba ?? NaN) ? Number(r.sadzba) : 0,
      kategoria: r.kategoria,
      zaklad: r2(Number.isFinite(r.zaklad ?? NaN) ? Number(r.zaklad) : 0),
      dph: r2(Number.isFinite(r.dan ?? NaN) ? Number(r.dan) : 0),
    }));

  const s = d.sucty;
  const bezDph = cisloAleboNull(suma(s, "cbc:TaxExclusiveAmount"));
  const sDph = cisloAleboNull(suma(s, "cbc:TaxInclusiveAmount"));
  const zaplatene = cisloAleboNull(suma(s, "cbc:PrepaidAmount")) ?? 0;
  const zaokruhlenie = cisloAleboNull(suma(s, "cbc:PayableRoundingAmount")) ?? 0;
  const naUhradu = cisloAleboNull(suma(s, "cbc:PayableAmount"));
  const dphHlavicka = cisloAleboNull(suma(ttDokladu, "cbc:TaxAmount"));

  const zaklad = rozpis.length
    ? r2(rozpis.reduce((a, r) => a + r.zaklad, 0))
    : (bezDph ?? (sDph != null && dphHlavicka != null ? r2(sDph - dphHlavicka) : 0));
  const dph = rozpis.length ? r2(rozpis.reduce((a, r) => a + r.dph, 0)) : (dphHlavicka ?? 0);
  const celkom =
    sDph ?? (naUhradu != null ? r2(naUhradu + zaplatene - zaokruhlenie) : r2(zaklad + dph));

  const polozky: PolozkaZUbl[] = d.riadky.map((r) => {
    const u = r.uzol;
    const mnozstvo = r.mnozstvo ? cislo(r.mnozstvo.text) : NaN;
    const cena = suma(u, "cac:Price/cbc:PriceAmount");
    const zakladne = suma(u, "cac:Price/cbc:BaseQuantity");
    const jc =
      cena == null || !Number.isFinite(cena)
        ? null
        : zakladne && zakladne > 0
          ? cena / zakladne
          : cena;
    const nazov =
      text(u, "cac:Item/cbc:Name") ?? text(u, "cac:Item/cbc:Description") ?? `Položka ${r.poradie}`;
    return {
      name: nazov.slice(0, 500),
      quantity: Number.isFinite(mnozstvo) ? mnozstvo : null,
      unit: jednotkaZKodu(r.mnozstvo?.atributy.unitCode),
      unit_price: jc == null ? null : Math.round(jc * 10000) / 10000,
      vat_rate: r.sadzba != null && Number.isFinite(r.sadzba) ? r.sadzba : 0,
      total: r.suma != null && Number.isFinite(r.suma) ? r2(r.suma) : null,
      ...(r.kategoria === "AE" ? { pdp: true } : {}),
    };
  });
  /* Zľava (−) a príplatok (+) na doklad ako riadky — inak by súčet položiek
     nesedel so základom a rozpis by sa počítal z hlavičky jednou sadzbou. */
  for (const z of d.zlavyPriplatky) {
    if (z.suma == null || !Number.isFinite(z.suma) || !z.suma) continue;
    const znak = z.priplatok ? 1 : -1;
    const dovod = text(z.uzol, "cbc:AllowanceChargeReason");
    polozky.push({
      name: (dovod ?? (z.priplatok ? "Príplatok" : "Zľava")).slice(0, 500),
      quantity: 1,
      unit: null,
      unit_price: r2(znak * z.suma),
      vat_rate: z.sadzba != null && Number.isFinite(z.sadzba) ? z.sadzba : 0,
      total: r2(znak * z.suma),
      ...(z.kategoria === "AE" ? { pdp: true } : {}),
    });
  }

  const predavajuci = d.predavajuci;
  const icDphText = text(icDph(predavajuci), "cbc:CompanyID");
  const endpoint = prvy(predavajuci, "cbc:EndpointID");
  const dicZEndpointu =
    endpoint && endpoint.atributy.schemeID === "0245" && /^\d{10}$/.test(endpoint.text.trim())
      ? endpoint.text.trim()
      : null;
  const dicZIcDph = icDphText && /^SK\d{10}$/i.test(icDphText) ? icDphText.slice(2) : null;
  const kupujuci = d.kupujuci;
  const icDphKupujuceho = kupujuci ? text(icDph(kupujuci), "cbc:CompanyID") : null;
  const endpointKupujuceho = kupujuci ? prvy(kupujuci, "cbc:EndpointID") : null;
  const odberatel = kupujuci
    ? {
        nazov:
          text(kupujuci, "cac:PartyLegalEntity/cbc:RegistrationName") ??
          text(kupujuci, "cac:PartyName/cbc:Name"),
        ico: icoStrany(kupujuci),
        dic:
          endpointKupujuceho &&
          endpointKupujuceho.atributy.schemeID === "0245" &&
          /^\d{10}$/.test(endpointKupujuceho.text.trim())
            ? endpointKupujuceho.text.trim()
            : icDphKupujuceho && /^SK\d{10}$/i.test(icDphKupujuceho)
              ? icDphKupujuceho.slice(2)
              : null,
        icDph: icDphKupujuceho,
      }
    : undefined;
  const platobne = vsetky(koren, "cac:PaymentMeans");
  const iban =
    platobne
      .map((p) => text(p, "cac:PayeeFinancialAccount/cbc:ID"))
      .find((x) => x && /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/i.test(x.replace(/\s/g, "")))
      ?.replace(/\s/g, "")
      .toUpperCase() ?? null;
  const vsText = platobne.map((p) => text(p, "cbc:PaymentID")).find(Boolean) ?? null;
  const vs = vsText ? vsText.replace(/\s/g, "").replace(/^VS:?/i, "").slice(0, 20) : null;

  const odkazy = [
    ...vsetky(koren, "cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID").map((u) =>
      text(u),
    ),
    ...vsetky(koren, "cac:AdditionalDocumentReference")
      .filter((a) => !prvy(a, "cac:Attachment"))
      .map((a) => text(a, "cbc:ID")),
  ].filter((x): x is string => Boolean(x));

  return {
    druh,
    typKod,
    cislo: text(koren, "cbc:ID"),
    vystavenie: text(koren, "cbc:IssueDate"),
    dodanie:
      text(koren, "cac:Delivery/cbc:ActualDeliveryDate") ??
      text(koren, "cac:InvoicePeriod/cbc:EndDate") ??
      null,
    splatnost:
      text(koren, "cbc:DueDate") ?? text(koren, "cac:PaymentTerms/cbc:PaymentDueDate") ?? null,
    mena,
    dodavatel: {
      nazov:
        text(predavajuci, "cac:PartyLegalEntity/cbc:RegistrationName") ??
        text(predavajuci, "cac:PartyName/cbc:Name"),
      ico: icoStrany(predavajuci),
      dic: dicZEndpointu ?? dicZIcDph,
      icDph: icDphText,
      ulica: text(predavajuci, "cac:PostalAddress/cbc:StreetName"),
      mesto: text(predavajuci, "cac:PostalAddress/cbc:CityName"),
      psc: text(predavajuci, "cac:PostalAddress/cbc:PostalZone"),
      krajina: d.krajinaPredavajuceho,
      email: text(predavajuci, "cac:Contact/cbc:ElectronicMail"),
    },
    ...(odberatel ? { odberatel } : {}),
    iban,
    vs,
    objednavka: text(koren, "cac:OrderReference/cbc:ID"),
    platba: platbaZKodu(platobne.map((p) => text(p, "cbc:PaymentMeansCode")).find(Boolean)),
    zaklad,
    dph,
    celkom: r2(celkom),
    zaloha: r2(Math.max(zaplatene, 0)),
    naUhradu: r2(naUhradu ?? celkom - zaplatene + zaokruhlenie),
    zaokruhlenie: r2(zaokruhlenie),
    rozpis,
    polozky,
    prenesenie: rozpis.length > 0 && rozpis.every((r) => r.kategoria === "AE"),
    opravuje:
      d.dobropis || druh === "dobropis"
        ? (text(koren, "cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID") ?? null)
        : null,
    odkazy: [...new Set(odkazy)],
  };
}

const prazdne = (v: string | null | undefined) => {
  const t = String(v ?? "").trim();
  return t ? t : null;
};

/** VS z eFaktúry, inak číslo faktúry, ak je celé z číslic (ako `vsDokladu`). */
function vsPrijatej(r: PrijataZUbl): string | null {
  if (r.vs && /^\d{1,10}$/.test(r.vs)) return r.vs;
  const c = String(r.cislo ?? "").replace(/\s/g, "");
  if (/^\d{1,10}$/.test(c)) return c;
  return r.vs;
}

/**
 * Riadok `purchase_invoices` z rozobratej eFaktúry (bez `company_id`,
 * stavu a zdroja — tie dopĺňa volajúci). Dobropis má sumy záporné, ako
 * všade vo Fakteri; zálohová faktúra je `proforma` bez odpočtu DPH.
 */
export function prijataZUbl(
  r: PrijataZUbl,
  v: { dnes: string; prijate: string; nahradneCislo: string },
) {
  const zn = r.druh === "dobropis" ? -1 : 1;
  const zaloha = r.druh === "faktura" && r.zaloha > 0 ? r2(Math.min(r.zaloha, r.celkom)) : 0;
  const poznamka: string[] = [
    r.druh === "dobropis"
      ? `Dobropis prijatý cez eFaktúru (Peppol)${r.opravuje ? ` k faktúre ${r.opravuje}` : ""}.`
      : r.druh === "zalohova"
        ? "Zálohová faktúra prijatá cez eFaktúru (Peppol)."
        : "Prijaté cez eFaktúru (Peppol).",
  ];
  if (zaloha) {
    poznamka.push(
      `Dodávateľ odpočítal zaplatenú zálohu ${zaloha.toFixed(2)} ${r.mena} — na úhradu ostáva ${r.naUhradu.toFixed(2)} ${r.mena}.`,
    );
  }
  if (r.zaokruhlenie) poznamka.push(`Zaokrúhlenie ${r.zaokruhlenie.toFixed(2)} ${r.mena}.`);
  const polozky = r.polozky.filter((p) => p.name.trim());
  return {
    supplier_name: r.dodavatel.nazov ?? "Neznámy dodávateľ",
    supplier_ico: r.dodavatel.ico,
    supplier_dic: r.dodavatel.dic,
    supplier_ic_dph: r.dodavatel.icDph,
    supplier_street: r.dodavatel.ulica,
    supplier_city: r.dodavatel.mesto,
    supplier_zip: r.dodavatel.psc,
    supplier_country: r.dodavatel.krajina,
    supplier_email: r.dodavatel.email,
    supplier_iban: r.iban,
    invoice_number: prazdne(r.cislo) ?? v.nahradneCislo,
    variable_symbol: vsPrijatej(r),
    order_number: r.objednavka,
    issue_date: r.vystavenie ?? v.dnes,
    delivery_date: r.dodanie ?? r.vystavenie ?? v.dnes,
    received_date: v.prijate,
    due_date: r.splatnost ?? r.vystavenie ?? v.dnes,
    amount_without_vat: r2(zn * r.zaklad),
    vat_amount: r2(zn * r.dph),
    amount_total: r2(zn * r.celkom),
    advance_amount: zaloha || null,
    currency: r.mena,
    payment_method: r.platba ?? "prevod",
    type: r.druh === "zalohova" ? "proforma" : "regular",
    // Zo zálohovej faktúry sa daň neodpočítava.
    odpocet: r.druh !== "zalohova",
    opravuje_cislo: r.druh === "dobropis" ? r.opravuje : null,
    items: polozky.length ? polozky : null,
    ...(r.prenesenie ? { reverse_charge: true, dph_rezim: "samozdanenie" } : {}),
    note: poznamka.join(" "),
  };
}

/**
 * Údaje formulára Nespracovaných z eFaktúry — všetko zo štruktúrovaných
 * údajov, nič z OCR. Človek ich v Nespracovaných len skontroluje.
 */
export function udajeNespracovanehoZUbl(
  r: PrijataZUbl,
  zaklad: UdajeNespracovaneho,
): UdajeNespracovaneho {
  const s = (x: string | null | undefined) => String(x ?? "");
  return {
    ...zaklad,
    dodavatel: {
      nazov: s(r.dodavatel.nazov),
      ico: s(r.dodavatel.ico),
      dic: s(r.dodavatel.dic),
      icDph: s(r.dodavatel.icDph),
      iban: s(r.iban),
      ulica: s(r.dodavatel.ulica),
      mesto: s(r.dodavatel.mesto),
      psc: s(r.dodavatel.psc),
    },
    cislo: s(r.cislo),
    vs: s(vsPrijatej(r)),
    objednavka: s(r.objednavka),
    datumVystavenia: s(r.vystavenie),
    datumDodania: s(r.dodanie ?? r.vystavenie),
    splatnost: s(r.splatnost),
    mena: r.mena,
    rozpis: r.rozpis.map((x) => ({ sadzba: x.sadzba, zaklad: x.zaklad, dph: x.dph })),
    celkom: r.celkom,
    zaloha: r.druh === "faktura" && r.zaloha > 0 ? r.zaloha : undefined,
    platba: s(r.platba ?? "prevod"),
    opravuje: s(r.druh === "dobropis" ? r.opravuje : ""),
    poznamka: "Prijaté cez eFaktúru (Peppol).",
    polozky: r.polozky.map((p) => ({
      name: p.name,
      quantity: p.quantity,
      unit: p.unit,
      unit_price: p.unit_price,
      vat_rate: p.vat_rate,
      total: p.total,
      ...(p.pdp ? { pdp: true } : {}),
    })),
    prenesenie: r.prenesenie || undefined,
  };
}

/** Druh Nespracovaného dokladu pre eFaktúru (samofaktúra sem nepatrí). */
export function druhNespracovanehoZUbl(
  druh: DruhPrijatejEfaktury,
): "faktura" | "zalohova" | "dobropis" | null {
  if (druh === "faktura" || druh === "zalohova" || druh === "dobropis") return druh;
  return null;
}
