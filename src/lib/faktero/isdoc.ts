/**
 * ISDOC — formát, v ktorom SuperFaktúra exportuje faktúry.
 *
 * Export zo SuperFaktúry je **ZIP so súbormi `.isdoc`, jedna faktúra na súbor**.
 * To je úplne iná štruktúra než tabuľka: hlavička je zanorená v `Invoice`,
 * odberateľ v `AccountingCustomerParty` a položky v `InvoiceLines`.
 *
 * Zvyšok importu pracuje s riadkami, kde **jeden riadok je jedna položka
 * faktúry** a hlavičkové údaje sa na každom riadku opakujú (faktúry sa potom
 * zoskupia podľa čísla). Tento modul teda z jedného ISDOC dokumentu vyrobí
 * toľko riadkov, koľko má faktúra položiek.
 *
 * Stĺpce sa pomenúvajú rovno tak, ako sa volajú polia importu, takže ich
 * rozpoznávanie stĺpcov trafí bez hádania.
 */

export const ISDOC_MENOVKA = "isdoc";

/** Riadok, ktorý zvyšok importu očakáva. */
export type IsdocRiadok = Record<string, string>;

/**
 * Je to ISDOC? Rozhoduje sa podľa obsahu, nie podľa prípony — SuperFaktúra
 * niekedy pomenuje súbor `.xml` a niekedy `.isdoc`.
 */
export function jeIsdoc(xml: string): boolean {
  if (!xml) return false;
  const zaciatok = xml.slice(0, 2000);
  return (
    /isdoc\.cz\/namespace/i.test(zaciatok) ||
    (/<Invoice[\s>]/i.test(zaciatok) && /<(AccountingSupplierParty|InvoiceLines)[\s>]/i.test(xml))
  );
}

/** Hodnota uzla bez ohľadu na to, či ju parser dal ako text, číslo alebo `#text`. */
function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const t = (v as any)["#text"];
    return t == null ? "" : String(t).trim();
  }
  return String(v).trim();
}

/** Bezpečné prejdenie zanorenia — `cesta(o, "Party", "PartyName", "Name")`. */
function uzol(o: any, ...cesta: string[]): any {
  let cur = o;
  for (const k of cesta) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = Array.isArray(cur) ? cur[0]?.[k] : cur[k];
  }
  return cur;
}

function hodnota(o: any, ...cesta: string[]): string {
  return text(uzol(o, ...cesta));
}

/** Uzol, ktorý sa môže vyskytnúť raz alebo viackrát, vždy ako pole. */
function pole(v: any): any[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function cislo(v: string): number {
  if (!v) return 0;
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function suma(n: number): string {
  return n === 0 ? "" : String(Math.round((n + Number.EPSILON) * 100) / 100);
}

/** Údaje o strane dokladu (odberateľ alebo dodávateľ). */
function strana(p: any): Record<string, string> {
  const party = uzol(p, "Party") ?? p;
  const ulica = [
    hodnota(party, "PostalAddress", "StreetName"),
    hodnota(party, "PostalAddress", "BuildingNumber"),
  ]
    .filter(Boolean)
    .join(" ");
  return {
    name: hodnota(party, "PartyName", "Name"),
    // V ISDOC je IČO `PartyIdentification/ID`, IČ DPH `PartyTaxScheme/CompanyID`.
    ico: hodnota(party, "PartyIdentification", "ID"),
    ic_dph: hodnota(party, "PartyTaxScheme", "CompanyID"),
    street: ulica,
    city: hodnota(party, "PostalAddress", "CityName"),
    zip: hodnota(party, "PostalAddress", "PostalZone"),
    country: hodnota(party, "PostalAddress", "Country", "IdentificationCode"),
    email: hodnota(party, "Contact", "ElectronicMail"),
    phone: hodnota(party, "Contact", "Telephone"),
  };
}

/**
 * `1` faktúra, `2` dobropis, `3` vrubopis, `4` zálohová faktúra.
 * Import pozná len bežnú faktúru a dobropis; zálohu preto označíme ako proformu.
 */
export function typDokladu(kod: string): "regular" | "credit_note" | "proforma" {
  if (kod === "2") return "credit_note";
  if (kod === "4") return "proforma";
  return "regular";
}

/**
 * Prevedie jeden rozparsovaný ISDOC dokument na riadky importu.
 * Faktúra bez položiek dá jeden riadok so samotnou hlavičkou — bez neho by
 * doklad z importu tíško vypadol.
 */
export function isdocNaRiadky(doc: any): IsdocRiadok[] {
  const inv = doc?.Invoice ?? doc;
  if (!inv || typeof inv !== "object") return [];

  const odberatel = strana(uzol(inv, "AccountingCustomerParty") ?? uzol(inv, "BuyerCustomerParty"));

  // Splatnosť a variabilný symbol sedia v platobných údajoch, ktorých môže byť
  // viac (rôzne účty). Berie sa prvá vyplnená hodnota.
  const platby = pole(uzol(inv, "PaymentMeans", "Payment")).flatMap((p: any) =>
    pole(uzol(p, "Details")),
  );
  const prvaHodnota = (kluc: string) => {
    for (const d of platby) {
      const v = hodnota(d, kluc);
      if (v) return v;
    }
    return "";
  };

  const bezDph = cislo(hodnota(inv, "LegalMonetaryTotal", "TaxExclusiveAmount"));
  // Celková suma je `TaxInclusiveAmount`, nie `PayableAmount` — tá je po
  // odpočte záloh a zaokrúhlení a pri plne zálohovanej faktúre je nula.
  const sDph = cislo(hodnota(inv, "LegalMonetaryTotal", "TaxInclusiveAmount"));

  const hlavicka: IsdocRiadok = {
    invoice_number: hodnota(inv, "ID"),
    external_id: hodnota(inv, "UUID"),
    variable_symbol: prvaHodnota("VariableSymbol"),
    issue_date: hodnota(inv, "IssueDate"),
    delivery_date: hodnota(inv, "TaxPointDate"),
    due_date: prvaHodnota("PaymentDueDate"),
    currency: hodnota(inv, "LocalCurrencyCode") || hodnota(inv, "CurrCode"),
    subtotal: suma(bezDph),
    vat_total: suma(sDph - bezDph),
    total: suma(sDph),
    notes: hodnota(inv, "Note"),
    document_type: typDokladu(hodnota(inv, "DocumentType")),
    customer_name: odberatel.name,
    customer_ico: odberatel.ico,
    customer_ic_dph: odberatel.ic_dph,
    // ISDOC nemá zvlášť DIČ; IČ DPH bez predpony krajiny mu zodpovedá.
    customer_dic: odberatel.ic_dph.replace(/^[A-Z]{2}/i, ""),
    customer_street: odberatel.street,
    customer_city: odberatel.city,
    customer_zip: odberatel.zip,
    customer_country: odberatel.country,
    customer_email: odberatel.email,
    customer_phone: odberatel.phone,
  };

  const riadky = pole(uzol(inv, "InvoiceLines", "InvoiceLine"));

  // Dokument bez čísla, odberateľa aj položiek nie je faktúra — bez tejto
  // poistky by z poškodeného súboru vznikol prázdny doklad na nula eur.
  if (!hlavicka.invoice_number && !hlavicka.customer_name && !riadky.length) return [];

  if (!riadky.length) return [{ ...hlavicka }];

  return riadky.map((r: any) => {
    const mnozstvo = uzol(r, "InvoicedQuantity");
    const bezDphRiadok = cislo(hodnota(r, "LineExtensionAmount"));
    const sDphRiadok = cislo(hodnota(r, "LineExtensionAmountTaxInclusive"));
    return {
      ...hlavicka,
      item_name: hodnota(r, "Item", "Description"),
      item_description: hodnota(r, "Note"),
      item_quantity: text(mnozstvo),
      // Merná jednotka je atribút, nie vlastný uzol.
      item_unit: typeof mnozstvo === "object" ? String((mnozstvo as any)["@unitCode"] ?? "") : "",
      item_unit_price: hodnota(r, "UnitPrice"),
      item_vat_rate: hodnota(r, "ClassifiedTaxCategory", "Percent"),
      item_total: suma(sDphRiadok || bezDphRiadok),
      item_sku: hodnota(r, "Item", "SellersItemIdentification", "ID"),
    };
  });
}
