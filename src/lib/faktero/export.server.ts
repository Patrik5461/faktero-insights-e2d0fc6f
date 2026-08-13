// Server-only helpers for accounting exports.
// Format strategies are pluggable so we can add Omega/Money/Alfa Plus later.

type InvoiceRow = any;
type ItemRow = any;
type CompanyRow = any;

function esc(s: any): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function fixed2(n: any) {
  return Number(n ?? 0).toFixed(2);
}

/**
 * Build a Pohoda XML data pack (Stormware) containing N invoice entries.
 * Conforms to the Pohoda XML schema family (invoice / invoiceItem).
 * Reference: data_xml_invoice.xsd
 */
export function buildPohodaInvoiceXml(opts: {
  company: CompanyRow;
  invoices: { invoice: InvoiceRow; items: ItemRow[] }[];
}): string {
  const { company, invoices } = opts;
  const ico = esc(company?.ico ?? "");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dataPackId = `FAKTERO_${stamp}`;

  const entries = invoices
    .map(({ invoice, items }, idx) => {
      const isCreditNote = invoice.type === "credit_note";
      const invoiceType = isCreditNote ? "issuedCreditNotice" : "issuedInvoice";
      // Pohoda `typ:vatRateType` pozná hodnoty none | high | low | third |
      // historyHigh: "none" = 0 %, "third" = druhá znížená (5 %), "low" =
      // znížená (19 %), "high" = základná (23 %).
      const rateVatCode = (r: number) => {
        const n = Number(r);
        if (n === 0) return "none";
        if (n === 5) return "third";
        if (n === 19 || n === 10) return "low";
        return "high"; // 23, 20 alebo iné → základná
      };
      const bucket = (code: "none" | "third" | "low" | "high") =>
        items.filter((it) => rateVatCode(Number(it.vat_rate)) === code);
      const sum0 = bucket("none");
      const sumThird = bucket("third");
      const sumLow = bucket("low");
      const sumHigh = bucket("high");
      const sumBase = (arr: ItemRow[]) => arr.reduce((a, it) => a + Number(it.subtotal ?? 0), 0);
      const sumVat = (arr: ItemRow[]) => arr.reduce((a, it) => a + Number(it.vat_amount ?? 0), 0);

      const itemRows = items
        .map(
          (it) => `
        <inv:invoiceItem>
          <inv:text>${esc(it.name)}</inv:text>
          <inv:quantity>${Number(it.quantity ?? 0)}</inv:quantity>
          <inv:unit>${esc(it.unit ?? "ks")}</inv:unit>
          <inv:rateVAT>${rateVatCode(Number(it.vat_rate))}</inv:rateVAT>
          <inv:homeCurrency>
            <typ:unitPrice>${fixed2(it.unit_price)}</typ:unitPrice>
            <typ:price>${fixed2(it.subtotal)}</typ:price>
            <typ:priceVAT>${fixed2(it.vat_amount)}</typ:priceVAT>
            <typ:priceSum>${fixed2(it.total)}</typ:priceSum>
          </inv:homeCurrency>
        </inv:invoiceItem>`,
        )
        .join("");

      return `
  <dat:dataPackItem id="INV${idx + 1}" version="2.0">
    <inv:invoice version="2.0">
      <inv:invoiceHeader>
        <inv:invoiceType>${invoiceType}</inv:invoiceType>
        <inv:number><typ:numberRequested>${esc(invoice.invoice_number)}</typ:numberRequested></inv:number>
        <inv:symVar>${esc(invoice.variable_symbol ?? invoice.invoice_number)}</inv:symVar>
        <inv:date>${esc(invoice.issue_date)}</inv:date>
        <inv:dateTax>${esc(invoice.delivery_date ?? invoice.issue_date)}</inv:dateTax>
        <inv:dateDue>${esc(invoice.due_date)}</inv:dateDue>
        <inv:text>${esc(invoice.notes ?? `Faktúra ${invoice.invoice_number}`)}</inv:text>
        <inv:partnerIdentity>
          <typ:address>
            <typ:company>${esc(invoice.customer_name)}</typ:company>
            <typ:street>${esc(invoice.customer_street ?? "")}</typ:street>
            <typ:city>${esc(invoice.customer_city ?? "")}</typ:city>
            <typ:zip>${esc(invoice.customer_zip ?? "")}</typ:zip>
            <typ:country><typ:ids>${esc(invoice.customer_country ?? "SK")}</typ:ids></typ:country>
            <typ:ico>${esc(invoice.customer_ico ?? "")}</typ:ico>
            <typ:dic>${esc(invoice.customer_dic ?? "")}</typ:dic>
            <typ:icDph>${esc(invoice.customer_ic_dph ?? "")}</typ:icDph>
            <typ:email>${esc(invoice.customer_email ?? "")}</typ:email>
          </typ:address>
        </inv:partnerIdentity>
        <inv:paymentType><typ:paymentType>draft</typ:paymentType></inv:paymentType>
        <inv:account><typ:accountNo>${esc(company?.iban ?? "")}</typ:accountNo></inv:account>
      </inv:invoiceHeader>
      <inv:invoiceDetail>${itemRows}
      </inv:invoiceDetail>
      <inv:invoiceSummary>
        <inv:homeCurrency>
          <typ:priceNone>${fixed2(sumBase(sum0))}</typ:priceNone>
          <typ:price3>${fixed2(sumBase(sumThird))}</typ:price3>
          <typ:price3VAT>${fixed2(sumVat(sumThird))}</typ:price3VAT>
          <typ:priceLow>${fixed2(sumBase(sumLow))}</typ:priceLow>
          <typ:priceLowVAT>${fixed2(sumVat(sumLow))}</typ:priceLowVAT>
          <typ:priceHigh>${fixed2(sumBase(sumHigh))}</typ:priceHigh>
          <typ:priceHighVAT>${fixed2(sumVat(sumHigh))}</typ:priceHighVAT>
          <typ:round><typ:priceRound>0.00</typ:priceRound></typ:round>
        </inv:homeCurrency>
      </inv:invoiceSummary>
    </inv:invoice>
  </dat:dataPackItem>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>
<dat:dataPack id="${dataPackId}" ico="${ico}" application="Faktero" version="2.0" note="Export z Faktero"
  xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd"
  xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd"
  xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">${entries}
</dat:dataPack>`;
}

export type ExportFormat = "pohoda_xml" | "omega_txt" | "money_s3_xml";

export interface ExportStrategy {
  format: ExportFormat;
  target_system: "pohoda" | "omega" | "money" | "alfa_plus" | "other";
  /** Názov do rozhrania a do histórie exportov. */
  label: string;
  /** Komu ešte súbor sadne — Omegu číta aj ALFA plus. */
  note?: string;
  /**
   * Kódovanie súboru. Omega vyžaduje Windows-1250; obsah sa všade nesie ako
   * bežný reťazec a prevedie sa až pri stiahnutí.
   */
  encoding: "utf-8" | "windows-1250";
  /** Typ súboru — potrebný aj pri sťahovaní z histórie, bez prestavania obsahu. */
  mime: string;
  build(input: { company: CompanyRow; invoices: { invoice: InvoiceRow; items: ItemRow[] }[] }): {
    content: string;
    fileName: string;
    mime: string;
  };
}

export const POHODA_XML: ExportStrategy = {
  format: "pohoda_xml",
  target_system: "pohoda",
  label: "Pohoda XML",
  encoding: "utf-8",
  mime: "application/xml",
  build({ company, invoices }) {
    const content = buildPohodaInvoiceXml({ company, invoices });
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `pohoda-faktury-${stamp}.xml`;
    return { content, fileName, mime: "application/xml" };
  },
};

export const OMEGA_TXT: ExportStrategy = {
  format: "omega_txt",
  target_system: "omega",
  label: "KROS Omega (TXT)",
  note: "Ten istý súbor číta aj ALFA plus — Evidencie → Pohľadávky → Import faktúr z Omegy.",
  // Špecifikácia KROSu: „Kodovanie slovenskej diakritiky - Windows ANSI".
  encoding: "windows-1250",
  mime: "text/plain",
  build({ company, invoices }) {
    const content = buildOmegaTxt({ company, invoices });
    const stamp = new Date().toISOString().slice(0, 10);
    return { content, fileName: `omega-faktury-${stamp}.txt`, mime: "text/plain" };
  },
};

export const MONEY_S3_XML: ExportStrategy = {
  format: "money_s3_xml",
  target_system: "money",
  label: "Money S3 XML",
  encoding: "utf-8",
  mime: "application/xml",
  build({ company, invoices }) {
    const content = buildMoneyS3Xml({ company, invoices });
    const stamp = new Date().toISOString().slice(0, 10);
    return { content, fileName: `money-s3-faktury-${stamp}.xml`, mime: "application/xml" };
  },
};

export const EXPORT_STRATEGIES: Record<ExportFormat, ExportStrategy> = {
  pohoda_xml: POHODA_XML,
  omega_txt: OMEGA_TXT,
  money_s3_xml: MONEY_S3_XML,
};

// =========================================================
// Spoločné pomôcky pre formáty s rozpisom po sadzbách DPH
// =========================================================

/**
 * Sadzby DPH použité na doklade, od najvyššej. Slovenská faktúra ich má
 * najviac tri (23 / 19 / 5) plus nulovú; účtovné programy majú presne toľko
 * priehradok, tak sa priradzujú v tomto poradí.
 */
function sadzbyDokladu(items: ItemRow[]): number[] {
  return [...new Set(items.map((it) => Number(it.vat_rate) || 0))]
    .filter((r) => r > 0)
    .sort((a, b) => b - a);
}

function zaSadzbu(items: ItemRow[], sadzba: number | undefined) {
  if (sadzba == null) return { zaklad: 0, dan: 0 };
  const vybrane = items.filter((it) => (Number(it.vat_rate) || 0) === sadzba);
  return {
    zaklad: vybrane.reduce((a, it) => a + Number(it.subtotal ?? 0), 0),
    dan: vybrane.reduce((a, it) => a + Number(it.vat_amount ?? 0), 0),
  };
}

/**
 * Celková suma dokladu. Keď ju hlavička nenesie, spočíta sa z položiek — bez
 * toho by export zapísal nulu a účtovníčke by prišla faktúra na 0 €.
 */
function celkomDokladu(invoice: InvoiceRow, items: ItemRow[]): number {
  const z = Number(invoice?.total ?? 0);
  if (z) return z;
  return items.reduce((a, it) => a + Number(it.total ?? 0), 0);
}

/** `2025-03-04` → `04.03.2025`. Omega číta dátumy v slovenskom tvare. */
function datumSk(iso: any): string {
  const s = String(iso ?? "");
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
}

/**
 * Desatinná čiarka. KROS uvádza, že importný súbor sa vyrába uložením hárku
 * z Excelu ako „text oddelený tabulátormi" — slovenský Excel píše čiarku a
 * rovnako je v slovenskom tvare aj dátum. Hodnoty sú oddelené tabulátorom,
 * takže čiarka rozdelenie stĺpcov neohrozí.
 */
function cislaSk(n: any): string {
  const v = Number(n ?? 0);
  return (Math.round((v + Number.EPSILON) * 100) / 100).toFixed(2).replace(".", ",");
}

/** Text do stĺpca s obmedzenou dĺžkou; tabulátor a nový riadok by rozbili riadok. */
function pole(v: any, max = 0): string {
  const s = String(v ?? "")
    .replace(/[\t\r\n]+/g, " ")
    .trim();
  return max > 0 ? s.slice(0, max) : s;
}

// =========================================================
// KROS Omega — textový súbor R00/R01/R02
// =========================================================

/**
 * Export do KROS Omegy podľa oficiálnej štruktúry (ImportExport_28_00_2025.xls):
 * riadky `R00` (typ údajov), `R01` (hlavička dokladu) a `R02` (položka),
 * hodnoty oddelené tabulátorom, riadky ukončené CRLF.
 *
 * **Ten istý súbor číta aj ALFA plus** — v nej sa import volá
 * „Import faktúr z Omegy", takže sa nemusí robiť zvlášť.
 *
 * Súbor sa musí uložiť v kódovaní Windows-1250; prevod robí až sťahovanie,
 * tu ostáva bežný reťazec.
 */
export function buildOmegaTxt(opts: {
  company: CompanyRow;
  invoices: { invoice: InvoiceRow; items: ItemRow[] }[];
}): string {
  const { company, invoices } = opts;
  const riadky: string[] = [];

  // R00 — typ údajov a hlavička súboru: T01 = fakturácia.
  riadky.push(
    [
      "R00",
      "T01",
      "",
      pole(company?.name),
      pole(company?.ico, 12),
      pole(company?.street, 40),
      pole(company?.zip, 6),
      pole(company?.city, 40),
    ].join("\t"),
  );

  for (const { invoice, items } of invoices) {
    const sadzby = sadzbyDokladu(items);
    const vyssia = sadzby[0];
    const nizsia = sadzby[1];
    const znizena2 = sadzby[2];

    const v = zaSadzbu(items, vyssia);
    const n = zaSadzbu(items, nizsia);
    const z2 = zaSadzbu(items, znizena2);
    const nulova = items
      .filter((it) => (Number(it.vat_rate) || 0) === 0)
      .reduce((a, it) => a + Number(it.subtotal ?? 0), 0);

    // 0 = odberateľská faktúra, 1 = preddavková, 4 = odoslaný dobropis.
    const typDokladu =
      invoice.type === "credit_note" ? "4" : invoice.type === "proforma" ? "1" : "0";

    const cudzia = (invoice.currency ?? "EUR") !== "EUR";
    const icDph = pole(invoice.customer_ic_dph);
    const kodIcDph = /^[A-Z]{2}/i.test(icDph) ? icDph.slice(0, 2).toUpperCase() : "";

    // Stĺpce podľa špecifikácie, číslované od 1. Prázdne sa vyplnia tabulátormi.
    const r01: string[] = new Array(97).fill("");
    const set = (stlpec: number, hodnota: string) => {
      r01[stlpec - 1] = hodnota;
    };
    set(1, "R01");
    set(2, pole(invoice.invoice_number, 20));
    set(3, pole(invoice.customer_name, 75));
    set(4, pole(invoice.customer_ico, 12));
    set(5, datumSk(invoice.issue_date));
    set(6, datumSk(invoice.due_date));
    set(7, datumSk(invoice.delivery_date ?? invoice.issue_date));
    set(8, cislaSk(n.zaklad));
    set(9, cislaSk(v.zaklad));
    set(10, cislaSk(nulova));
    set(11, cislaSk(0));
    set(12, nizsia != null ? String(nizsia) : "");
    set(13, vyssia != null ? String(vyssia) : "");
    set(14, cislaSk(n.dan));
    set(15, cislaSk(v.dan));
    set(16, cislaSk(0));
    set(17, cudzia ? cislaSk(celkomDokladu(invoice, items)) : "");
    set(18, typDokladu);
    set(25, pole(invoice.customer_street, 40));
    set(26, pole(invoice.customer_zip, 6));
    set(27, pole(invoice.customer_city, 40));
    set(28, pole(invoice.customer_dic, 12));
    set(40, pole(invoice.currency ?? "EUR", 5));
    set(41, "1");
    set(43, cudzia ? "" : cislaSk(celkomDokladu(invoice, items)));
    set(45, pole(invoice.notes));
    set(47, pole(invoice.customer_country ?? "SK", 30));
    set(48, kodIcDph);
    set(49, icDph);
    set(71, pole(invoice.variable_symbol ?? invoice.invoice_number, 20));
    set(84, pole(invoice.customer_phone, 25));
    if (znizena2 != null) {
      set(95, String(znizena2));
      set(96, cislaSk(z2.zaklad));
      set(97, cislaSk(z2.dan));
    }
    riadky.push(r01.join("\t").replace(/\t+$/, ""));

    for (const it of items) {
      const sadzba = Number(it.vat_rate) || 0;
      // 0 nulová, N nižšia, Y znížená 2, V vyššia, X neobsahuje.
      const kod = sadzba === 0 ? "0" : sadzba === vyssia ? "V" : sadzba === nizsia ? "N" : "Y";
      const r02 = [
        "R02",
        pole(it.name),
        String(Number(it.quantity ?? 0)),
        pole(it.unit ?? "ks", 5),
        cislaSk(it.unit_price),
        kod,
        "",
        "",
        "",
        // K = skladová karta, S = služba, V = voľná položka.
        "V",
      ];
      riadky.push(r02.join("\t").replace(/\t+$/, ""));
    }
  }

  return riadky.join("\r\n") + "\r\n";
}

// =========================================================
// Money S3 — dátový balík MoneyData
// =========================================================

/**
 * Export do Money S3 podľa oficiálnej schémy (`__Faktura.xsd`, `__Comtypes.xsd`):
 * `MoneyData / SeznamFaktVyd / FaktVyd`.
 *
 * Money S3 má v hlavičke len dve sadzby — zníženú (`SazbaDPH1`) a základnú
 * (`SazbaDPH2`). Slovenská druhá znížená sadzba (5 %) sa preto zapisuje do
 * `SeznamDalsiSazby`, na to je tá časť schémy určená.
 */
export function buildMoneyS3Xml(opts: {
  company: CompanyRow;
  invoices: { invoice: InvoiceRow; items: ItemRow[] }[];
}): string {
  const { company, invoices } = opts;

  const doklady = invoices
    .map(({ invoice, items }) => {
      const sadzby = sadzbyDokladu(items);
      const vyssia = sadzby[0];
      const nizsia = sadzby[1];
      const dalsie = sadzby.slice(2);

      const v = zaSadzbu(items, vyssia);
      const n = zaSadzbu(items, nizsia);
      const nulova = items
        .filter((it) => (Number(it.vat_rate) || 0) === 0)
        .reduce((a, it) => a + Number(it.subtotal ?? 0), 0);

      const dalsieSadzby = dalsie
        .map((s) => {
          const x = zaSadzbu(items, s);
          return `
            <DalsiSazba>
              <Popis>Znížená sadzba ${s} %</Popis>
              <HladinaDPH>1</HladinaDPH>
              <Sazba>${s}</Sazba>
              <Zaklad>${fixed2(x.zaklad)}</Zaklad>
              <DPH>${fixed2(x.dan)}</DPH>
            </DalsiSazba>`;
        })
        .join("");

      const polozky = items
        .map(
          (it) => `
        <Polozka>
          <Popis>${esc(it.name)}</Popis>
          <PocetMJ>${Number(it.quantity ?? 0)}</PocetMJ>
          <SazbaDPH>${Number(it.vat_rate ?? 0)}</SazbaDPH>
          <Cena>${fixed2(it.unit_price)}</Cena>
          <SouhrnDPH>
            <Zaklad>${fixed2(it.subtotal)}</Zaklad>
            <DPH>${fixed2(it.vat_amount)}</DPH>
          </SouhrnDPH>
        </Polozka>`,
        )
        .join("");

      return `
    <FaktVyd>
      <Doklad>${esc(invoice.invoice_number)}</Doklad>
      <Popis>${esc(invoice.notes ?? `Faktúra ${invoice.invoice_number}`)}</Popis>
      <Vystaveno>${esc(invoice.issue_date)}</Vystaveno>
      <PlnenoDPH>${esc(invoice.delivery_date ?? invoice.issue_date)}</PlnenoDPH>
      <Splatno>${esc(invoice.due_date)}</Splatno>
      <VarSymbol>${esc(invoice.variable_symbol ?? invoice.invoice_number)}</VarSymbol>
      <Dobropis>${invoice.type === "credit_note" ? 1 : 0}</Dobropis>
      ${nizsia != null ? `<SazbaDPH1>${nizsia}</SazbaDPH1>` : ""}
      ${vyssia != null ? `<SazbaDPH2>${vyssia}</SazbaDPH2>` : ""}
      <SouhrnDPH>
        <Zaklad0>${fixed2(nulova)}</Zaklad0>
        <Zaklad5>${fixed2(n.zaklad)}</Zaklad5>
        <Zaklad22>${fixed2(v.zaklad)}</Zaklad22>
        <DPH5>${fixed2(n.dan)}</DPH5>
        <DPH22>${fixed2(v.dan)}</DPH22>${
          dalsieSadzby
            ? `\n        <SeznamDalsiSazby>${dalsieSadzby}\n        </SeznamDalsiSazby>`
            : ""
        }
      </SouhrnDPH>
      <Celkem>${fixed2(celkomDokladu(invoice, items))}</Celkem>
      <DodOdb>
        <ObchNazev>${esc(invoice.customer_name)}</ObchNazev>
        <Adresa>
          <Ulice>${esc(invoice.customer_street ?? "")}</Ulice>
          <Misto>${esc(invoice.customer_city ?? "")}</Misto>
          <PSC>${esc(invoice.customer_zip ?? "")}</PSC>
          <KodStatu>${esc(invoice.customer_country ?? "SK")}</KodStatu>
        </Adresa>
        <ICO>${esc(invoice.customer_ico ?? "")}</ICO>
        <DIC>${esc(invoice.customer_ic_dph ?? invoice.customer_dic ?? "")}</DIC>
        <EMail>${esc(invoice.customer_email ?? "")}</EMail>
      </DodOdb>
      <SeznamPolozek>${polozky}
      </SeznamPolozek>
      <MojeFirma>
        <Nazev>${esc(company?.name ?? "")}</Nazev>
        <ICO>${esc(company?.ico ?? "")}</ICO>
        <DIC>${esc(company?.ic_dph ?? company?.dic ?? "")}</DIC>
        <MenaKod>${esc(invoice.currency ?? "EUR")}</MenaKod>
      </MojeFirma>
    </FaktVyd>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>
<MoneyData ICAgendy="${esc(company?.ico ?? "")}" JazykVerze="SK" GeneratedBy="Faktero">
  <SeznamFaktVyd>${doklady}
  </SeznamFaktVyd>
</MoneyData>`;
}
