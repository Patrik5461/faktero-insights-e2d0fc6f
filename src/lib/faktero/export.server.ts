// Server-only helpers for accounting exports.
// Format strategies are pluggable so we can add Omega/Money/Alfa Plus later.

type InvoiceRow = any;
type ItemRow = any;
type CompanyRow = any;
/** Prijatý doklad (`expense_documents`) — rovnaký zvyk ako pri riadkoch vyššie. */
type DokladRow = any;

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
 * Pohoda XML — dátový balík `dataPack` pre XML import v programe POHODA
 * (Súbor → Dátová komunikácia → XML import/export).
 *
 * Schéma: `invoice.xsd` a `type.xsd` z www.stormware.cz/xml/schema/version_2.
 * Prázdne elementy sa nezapisujú vôbec — Pohoda ich pri niektorých poliach
 * odmieta a v ostatných prípadoch len zbytočne šumia v protokole importu.
 */

/** Sadzba DPH, ktorú Pohoda pozná pod daným kódom, podľa dňa plnenia. */
type Priehradka = "none" | "low" | "high" | "third";
type KodSadzby = Priehradka | "historyLow" | "historyHigh" | "historyThird";

/**
 * Pohoda neukladá percento, ale **priehradku** (základná, znížená, tretia) a
 * percento si k nej domyslí podľa dátumu plnenia. Preto sa tu percentá musia
 * prekladať tou istou tabuľkou, akú má program pre daný deň — inak by sa
 * doklad z roku 2024 s 20 % zaúčtoval na 23 %.
 */
function sadzbyKuDnu(den: string): { high: number; low: number; third: number | null } {
  const d = String(den ?? "");
  // Sadzby platné od 1. 1. 2025; predtým platili 20 % a 10 %.
  return d >= "2025-01-01" ? { high: 23, low: 19, third: 5 } : { high: 20, low: 10, third: null };
}

function kodSadzby(sadzba: number, tab: ReturnType<typeof sadzbyKuDnu>): KodSadzby {
  const n = Number(sadzba) || 0;
  if (n === 0) return "none";
  if (n === tab.high) return "high";
  if (n === tab.low) return "low";
  if (tab.third != null && n === tab.third) return "third";
  // Sadzba, ktorá v ten deň neplatila — opravný doklad k staršej faktúre.
  if (n > tab.low) return "historyHigh";
  if (tab.third != null && n <= tab.third) return "historyThird";
  return "historyLow";
}

/** Do ktorej priehradky súhrnu položka spadne. História ide k svojej sadzbe. */
function priehradka(kod: KodSadzby): Priehradka {
  if (kod === "historyHigh") return "high";
  if (kod === "historyLow") return "low";
  if (kod === "historyThird") return "third";
  return kod;
}

/**
 * Forma úhrady. Naše hodnoty sa v priebehu času menili (`prevod` aj
 * `bank_transfer`), preto sú tu obidve; neznáme padne na príkaz.
 */
const FORMY_UHRADY: Record<string, string> = {
  bank_transfer: "draft",
  prevod: "draft",
  transfer: "draft",
  cash: "cash",
  hotovost: "cash",
  card: "creditcard",
  karta: "creditcard",
  cod: "delivery",
  dobierka: "delivery",
  compensation: "compensation",
  zapocet: "compensation",
};

/** Typ dokladu. Zálohová faktúra **nie je** bežná faktúra — nesmie sa zaúčtovať ako výnos. */
const TYPY_DOKLADU: Record<string, string> = {
  regular: "issuedInvoice",
  credit_note: "issuedCreditNotice",
  proforma: "issuedAdvanceInvoice",
};

/** Element, ktorý sa zapíše len keď má obsah. */
function el(nazov: string, hodnota: unknown, odsadenie: string): string {
  const v = hodnota == null ? "" : String(hodnota).trim();
  return v ? `\n${odsadenie}<${nazov}>${esc(v)}</${nazov}>` : "";
}

/** Peňažný element — nula je platná hodnota, takže sa zapisuje vždy. */
function elSuma(nazov: string, hodnota: unknown, odsadenie: string): string {
  return `\n${odsadenie}<${nazov}>${fixed2(hodnota)}</${nazov}>`;
}

/** Text s obmedzenou dĺžkou; Pohoda dlhší reťazec pri importe odmietne. */
function skrat(v: unknown, max: number): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Predkontácia a členenie DPH — kódy z Pohody účtovníka, ak si ich vyplnil. */
export type PohodaNastavenia = {
  /** Predkontácia pre bežnú faktúru, napr. `3Fv`. */
  predkontacia?: string | null;
  /** Predkontácia pre zálohovú faktúru. */
  predkontaciaZaloha?: string | null;
  /** Predkontácia pre dobropis. */
  predkontaciaDobropis?: string | null;
  /** Členenie DPH, napr. `UD` alebo `UDpdp`. */
  clenenieDph?: string | null;
  /** Členenie DPH pri prenesení daňovej povinnosti. */
  clenenieDphPdp?: string | null;
  /** Predkontácia pre prijatý doklad — náklady sa účtujú inam než výnosy. */
  predkontaciaPrijata?: string | null;
  /** Členenie DPH pre prijatý doklad. */
  clenenieDphPrijata?: string | null;
  /** Skratka pokladne v Pohode — do ktorej pokladne pohyby patria. */
  pokladna?: string | null;
  /** Predkontácia pre pokladničný doklad. */
  predkontaciaPokladna?: string | null;
};

function domacaMenaFirmy(company: CompanyRow): string {
  return String(company?.default_currency ?? "EUR").toUpperCase() || "EUR";
}

/**
 * Prečo sa doklad do Pohody vyviezť nedá, alebo `null`, keď sa dá.
 *
 * Pohoda drží rozpis po sadzbách **vždy v domácej mene** a cudziu menu berie
 * len ako celkovú sumu s kurzom (`typeCurrencyForeign`: currency, rate, amount,
 * priceSum). Kurz k faktúre neevidujeme, takže domáce základy dane nemáme z
 * čoho spočítať — a odhad by znamenal tichú chybu v priznaní k DPH. Taký doklad
 * je preto lepšie vynechať a povedať to, než ho vyviezť nesprávne.
 */
export function pohodaPrekazka(invoice: InvoiceRow, company: CompanyRow): string | null {
  const domaca = domacaMenaFirmy(company);
  const mena = String(invoice?.currency ?? domaca).toUpperCase() || domaca;
  if (mena !== domaca) return `${invoice?.invoice_number ?? "?"} — faktúra v mene ${mena}`;
  return null;
}

/**
 * Balík faktúr pre XML import do Pohody.
 *
 * **Dobropis má záporné sumy** — tak ho zakladá aj samotná Pohoda príkazom
 * Záznam → Dobropis a inak by znížením pohľadávky nebolo, ale zvýšením.
 * V databáze ho držíme kladný a znamienko dávame až pri sčítavaní, preto sa
 * musí otočiť tu.
 *
 * Doklady, ktoré Pohoda takto prijať nevie, sa preskočia — dôvod povie
 * {@link pohodaPrekazka}.
 */
export function buildPohodaInvoiceXml(opts: {
  company: CompanyRow;
  invoices: { invoice: InvoiceRow; items: ItemRow[] }[];
  nastavenia?: PohodaNastavenia;
}): string {
  const { company, nastavenia } = opts;
  const invoices = opts.invoices.filter(({ invoice }) => !pohodaPrekazka(invoice, company));
  const ico = esc(company?.ico ?? "");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dataPackId = `FAKTERO_${stamp}`;

  const entries = invoices
    .map(({ invoice, items }, idx) => {
      const typ = String(invoice.type ?? "regular");
      const invoiceType = TYPY_DOKLADU[typ] ?? "issuedInvoice";
      // Dobropis sa zapisuje záporne; otáča sa množstvo, nie jednotková cena,
      // aby doklad aj po vytlačení vyzeral tak, ako ho Pohoda robí sama.
      const zn = typ === "credit_note" ? -1 : 1;

      const denPlnenia = String(invoice.delivery_date ?? invoice.issue_date ?? "");
      const tab = sadzbyKuDnu(denPlnenia);

      const kody = items.map((it) => kodSadzby(Number(it.vat_rate), tab));
      const kosik = (p: Priehradka) => items.filter((_, i) => priehradka(kody[i]) === p);
      const zaklad = (arr: ItemRow[]) => arr.reduce((a, it) => a + Number(it.subtotal ?? 0), 0);
      const dan = (arr: ItemRow[]) => arr.reduce((a, it) => a + Number(it.vat_amount ?? 0), 0);

      const s0 = kosik("none");
      const s3 = kosik("third");
      const sLow = kosik("low");
      const sHigh = kosik("high");

      // Zaokrúhlenie je rozdiel medzi hlavičkou dokladu a súčtom položiek. Bez
      // neho by Pohoda hlásila nesúlad o cent a doklad by sa nedal zlikvidovať
      // úhradou na presnú sumu.
      const zPoloziek =
        zaklad(s0) + zaklad(s3) + zaklad(sLow) + zaklad(sHigh) + dan(s3) + dan(sLow) + dan(sHigh);
      const celkom = Number(invoice.total ?? 0) || zPoloziek;
      const zaokruhlenie = Math.round((celkom - zPoloziek) * 100) / 100;

      const predkontacia =
        typ === "proforma"
          ? nastavenia?.predkontaciaZaloha
          : typ === "credit_note"
            ? nastavenia?.predkontaciaDobropis
            : nastavenia?.predkontacia;
      const clenenie = invoice.reverse_charge
        ? (nastavenia?.clenenieDphPdp ?? nastavenia?.clenenieDph)
        : nastavenia?.clenenieDph;

      const forma = FORMY_UHRADY[String(invoice.payment_method ?? "")] ?? "draft";

      const itemRows = items
        .map((it, i) => {
          const kod = kody[i];
          const mnozstvo = zn * Number(it.quantity ?? 0);
          return `
        <inv:invoiceItem>${el("inv:text", skrat(it.name, 90), "          ")}
          <inv:quantity>${mnozstvo}</inv:quantity>${el("inv:unit", skrat(it.unit ?? "ks", 10), "          ")}
          <inv:rateVAT>${kod}</inv:rateVAT>
          <inv:homeCurrency>${elSuma("typ:unitPrice", it.unit_price, "            ")}${elSuma(
            "typ:price",
            zn * Number(it.subtotal ?? 0),
            "            ",
          )}${elSuma("typ:priceVAT", zn * Number(it.vat_amount ?? 0), "            ")}${elSuma(
            "typ:priceSum",
            zn * Number(it.total ?? 0),
            "            ",
          )}
          </inv:homeCurrency>
        </inv:invoiceItem>`;
        })
        .join("");

      const adresa = [
        el("typ:company", skrat(invoice.customer_name, 96), "            "),
        el("typ:street", skrat(invoice.customer_street, 64), "            "),
        el("typ:city", skrat(invoice.customer_city, 45), "            "),
        el("typ:zip", skrat(invoice.customer_zip, 15), "            "),
        invoice.customer_country
          ? `\n            <typ:country><typ:ids>${esc(invoice.customer_country)}</typ:ids></typ:country>`
          : "",
        el("typ:ico", skrat(invoice.customer_ico, 15), "            "),
        el("typ:dic", skrat(invoice.customer_dic, 18), "            "),
        el("typ:icDph", skrat(invoice.customer_ic_dph, 18), "            "),
        el("typ:email", skrat(invoice.customer_email, 98), "            "),
      ].join("");

      // Poznámka pre účtovníka. Prenesenie daňovej povinnosti sa z holých čísel
      // nedá spoznať — na doklade sú nulové sadzby ako pri oslobodení.
      const poznamky = [
        invoice.reverse_charge ? "Prenesenie daňovej povinnosti" : "",
        skrat(invoice.notes, 200),
      ]
        .filter(Boolean)
        .join(" · ");

      return `
  <dat:dataPackItem id="INV${idx + 1}" version="2.0">
    <inv:invoice version="2.0">
      <inv:invoiceHeader>
        <inv:invoiceType>${invoiceType}</inv:invoiceType>
        <inv:number><typ:numberRequested>${esc(invoice.invoice_number)}</typ:numberRequested></inv:number>${el(
          "inv:symVar",
          skrat(invoice.variable_symbol ?? invoice.invoice_number, 20),
          "        ",
        )}${el("inv:symConst", skrat(invoice.constant_symbol, 4), "        ")}${el(
          "inv:symSpec",
          skrat(invoice.specific_symbol, 16),
          "        ",
        )}
        <inv:date>${esc(invoice.issue_date)}</inv:date>${el(
          "inv:dateTax",
          invoice.delivery_date ?? invoice.issue_date,
          "        ",
        )}${el("inv:dateDue", invoice.due_date, "        ")}${el(
          "inv:text",
          skrat(invoice.notes ?? `Faktúra ${invoice.invoice_number}`, 240),
          "        ",
        )}${el("inv:note", poznamky, "        ")}${
          predkontacia
            ? `\n        <inv:accounting><typ:ids>${esc(predkontacia)}</typ:ids></inv:accounting>`
            : ""
        }${
          clenenie
            ? `\n        <inv:classificationVAT><typ:ids>${esc(clenenie)}</typ:ids></inv:classificationVAT>`
            : ""
        }${
          invoice.order_number
            ? `\n        <inv:numberOrder>${esc(skrat(invoice.order_number, 32))}</inv:numberOrder>`
            : ""
        }
        <inv:partnerIdentity>
          <typ:address>${adresa}
          </typ:address>
        </inv:partnerIdentity>
        <inv:paymentType><typ:paymentType>${forma}</typ:paymentType></inv:paymentType>${
          company?.iban
            ? `\n        <inv:account><typ:accountNo>${esc(company.iban)}</typ:accountNo></inv:account>`
            : ""
        }
      </inv:invoiceHeader>
      <inv:invoiceDetail>${itemRows}
      </inv:invoiceDetail>
      <inv:invoiceSummary>
        <inv:homeCurrency>${elSuma("typ:priceNone", zn * zaklad(s0), "          ")}${elSuma(
          "typ:price3",
          zn * zaklad(s3),
          "          ",
        )}${elSuma("typ:price3VAT", zn * dan(s3), "          ")}${elSuma(
          "typ:priceLow",
          zn * zaklad(sLow),
          "          ",
        )}${elSuma("typ:priceLowVAT", zn * dan(sLow), "          ")}${elSuma(
          "typ:priceHigh",
          zn * zaklad(sHigh),
          "          ",
        )}${elSuma("typ:priceHighVAT", zn * dan(sHigh), "          ")}
          <typ:round><typ:priceRound>${fixed2(zn * zaokruhlenie)}</typ:priceRound></typ:round>
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

/**
 * Pokladničné doklady ako agenda `voucher` (príjmový a výdavkový doklad).
 *
 * **Bez rozpisu DPH.** Pohyb v pokladni u nás nemá sadzbu — evidujú sa ním
 * vklady, výbery a drobné výdavky, kým doklady s DPH sú prijaté doklady a
 * faktúry. Zapisovať vymyslenú sadzbu by znamenalo tichú chybu v priznaní,
 * takže celá suma ide do nulovej priehradky a DPH priradí účtovník, ak nejaká
 * na doklad patrí.
 *
 * Číslo dokladu si Pohoda pridelí z vlastnej rady; naše číslo je v texte, aby
 * sa dal pohyb spätne nájsť.
 */
export function buildPohodaCashXml(opts: {
  company: CompanyRow;
  pohyby: DokladRow[];
  nastavenia?: PohodaNastavenia;
}): string {
  const { company, pohyby, nastavenia } = opts;
  const ico = esc(company?.ico ?? "");
  const dataPackId = `FAKTERO_POKLADNA_${new Date().toISOString().replace(/[:.]/g, "-")}`;

  const entries = pohyby
    .map((p, idx) => {
      // `prijem` = príjmový doklad, čokoľvek iné je výdavok.
      const druh = String(p?.type ?? "") === "prijem" ? "receipt" : "expense";
      const suma = Math.abs(Number(p?.amount ?? 0));
      const popis = skrat(
        [p?.entry_number, p?.description, p?.category].filter(Boolean).join(" — "),
        240,
      );

      return `
  <dat:dataPackItem id="POK${idx + 1}" version="2.0">
    <vch:voucher version="2.0">
      <vch:voucherHeader>
        <vch:voucherType>${druh}</vch:voucherType>${
          nastavenia?.pokladna
            ? `\n        <vch:cashAccount><typ:ids>${esc(nastavenia.pokladna)}</typ:ids></vch:cashAccount>`
            : ""
        }
        <vch:date>${esc(p?.entry_date ?? "")}</vch:date>
        <vch:dateTax>${esc(p?.entry_date ?? "")}</vch:dateTax>${
          nastavenia?.predkontaciaPokladna
            ? `\n        <vch:accounting><typ:ids>${esc(nastavenia.predkontaciaPokladna)}</typ:ids></vch:accounting>`
            : ""
        }${el("vch:text", popis || "Pokladničný doklad", "        ")}${el(
          "vch:note",
          skrat(p?.note, 200),
          "        ",
        )}
      </vch:voucherHeader>
      <vch:voucherSummary>
        <vch:homeCurrency>
          <typ:priceNone>${fixed2(suma)}</typ:priceNone>
          <typ:round><typ:priceRound>0.00</typ:priceRound></typ:round>
        </vch:homeCurrency>
      </vch:voucherSummary>
    </vch:voucher>
  </dat:dataPackItem>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>
<dat:dataPack id="${dataPackId}" ico="${ico}" application="Faktero" version="2.0" note="Pokladňa z Faktero"
  xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd"
  xmlns:vch="http://www.stormware.cz/schema/version_2/voucher.xsd"
  xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">${entries}
</dat:dataPack>`;
}

/** Riadok rozpisu DPH tak, ako ho ukladá rozpoznávanie dokladov. */
type RozpisDph = { sadzba: number; zaklad: number; dph: number };

function rozpisDokladu(doklad: DokladRow): RozpisDph[] {
  const r = Array.isArray(doklad?.vat_breakdown) ? doklad.vat_breakdown : null;
  if (r?.length) {
    return (r as Record<string, unknown>[])
      .map((x) => ({
        sadzba: Number(x?.sadzba ?? 0),
        zaklad: Number(x?.zaklad ?? 0),
        dph: Number(x?.dph ?? 0),
      }))
      .filter((x) => x.zaklad || x.dph);
  }
  // Starší doklad má len jednu sadzbu v hlavičke.
  const zaklad = Number(doklad?.net_amount ?? 0);
  const dph = Number(doklad?.vat_amount ?? 0);
  if (!zaklad && !dph) return [];
  return [{ sadzba: Number(doklad?.vat_rate ?? 0), zaklad, dph }];
}

/**
 * Prijaté doklady (bločky, prijaté faktúry) ako `receivedInvoice`.
 *
 * Zapisuje sa **len súhrn po sadzbách, nie položky**. Doklad z bločku má
 * položky v cenách s daňou a býva ich aj dvadsať („Záloh plech"); do
 * účtovníctva z nich nie je nič, kým rozpis DPH — ktorý pri rozpoznávaní
 * ukladáme — je presne to, čo účtovník potrebuje, a sedí na halier.
 *
 * Číslo dokladu si Pohoda pridelí z vlastnej rady; číslo od dodávateľa ide do
 * variabilného symbolu, tak ako sa prijaté faktúry zadávajú ručne.
 */
export function buildPohodaExpensesXml(opts: {
  company: CompanyRow;
  doklady: DokladRow[];
  nastavenia?: PohodaNastavenia;
}): string {
  const { company, nastavenia } = opts;
  const domaca = domacaMenaFirmy(company);
  const doklady = opts.doklady.filter(
    (d) => (String(d?.currency ?? domaca).toUpperCase() || domaca) === domaca,
  );
  const ico = esc(company?.ico ?? "");
  const dataPackId = `FAKTERO_DOKLADY_${new Date().toISOString().replace(/[:.]/g, "-")}`;

  const entries = doklady
    .map((d, idx) => {
      const tab = sadzbyKuDnu(String(d?.issue_date ?? ""));
      const rozpis = rozpisDokladu(d);
      const zaSadzbu = (p: Priehradka) =>
        rozpis.filter((x) => priehradka(kodSadzby(x.sadzba, tab)) === p);
      const zaklad = (arr: RozpisDph[]) => arr.reduce((a, x) => a + x.zaklad, 0);
      const dan = (arr: RozpisDph[]) => arr.reduce((a, x) => a + x.dph, 0);

      const s0 = zaSadzbu("none");
      const s3 = zaSadzbu("third");
      const sLow = zaSadzbu("low");
      const sHigh = zaSadzbu("high");

      const zRozpisu =
        zaklad(s0) + zaklad(s3) + zaklad(sLow) + zaklad(sHigh) + dan(s3) + dan(sLow) + dan(sHigh);
      const celkom = Number(d?.total_amount ?? 0) || zRozpisu;
      const zaokruhlenie = Math.round((celkom - zRozpisu) * 100) / 100;

      // Variabilný symbol je číselný; z čísla dokladu sa berú len číslice.
      const symVar = String(d?.document_number ?? "")
        .replace(/\D/g, "")
        .slice(0, 20);
      const popis = skrat(
        [d?.supplier_name, d?.document_number ? `č. ${d.document_number}` : "", d?.category]
          .filter(Boolean)
          .join(" "),
        240,
      );

      const adresa = [
        el("typ:company", skrat(d?.supplier_name, 96), "            "),
        el("typ:ico", skrat(d?.supplier_ico, 15), "            "),
        el("typ:icDph", skrat(d?.supplier_ic_dph, 18), "            "),
      ].join("");

      return `
  <dat:dataPackItem id="DOK${idx + 1}" version="2.0">
    <inv:invoice version="2.0">
      <inv:invoiceHeader>
        <inv:invoiceType>receivedInvoice</inv:invoiceType>${el("inv:symVar", symVar, "        ")}
        <inv:date>${esc(d?.issue_date ?? "")}</inv:date>
        <inv:dateTax>${esc(d?.issue_date ?? "")}</inv:dateTax>${el(
          "inv:text",
          popis || "Prijatý doklad",
          "        ",
        )}${el("inv:note", skrat(d?.note, 200), "        ")}${
          nastavenia?.predkontaciaPrijata
            ? `\n        <inv:accounting><typ:ids>${esc(nastavenia.predkontaciaPrijata)}</typ:ids></inv:accounting>`
            : ""
        }${
          nastavenia?.clenenieDphPrijata
            ? `\n        <inv:classificationVAT><typ:ids>${esc(nastavenia.clenenieDphPrijata)}</typ:ids></inv:classificationVAT>`
            : ""
        }${
          adresa
            ? `
        <inv:partnerIdentity>
          <typ:address>${adresa}
          </typ:address>
        </inv:partnerIdentity>`
            : ""
        }
        <inv:paymentType><typ:paymentType>${
          FORMY_UHRADY[String(d?.payment_method ?? "")] ?? "draft"
        }</typ:paymentType></inv:paymentType>
      </inv:invoiceHeader>
      <inv:invoiceSummary>
        <inv:homeCurrency>${elSuma("typ:priceNone", zaklad(s0), "          ")}${elSuma(
          "typ:price3",
          zaklad(s3),
          "          ",
        )}${elSuma("typ:price3VAT", dan(s3), "          ")}${elSuma(
          "typ:priceLow",
          zaklad(sLow),
          "          ",
        )}${elSuma("typ:priceLowVAT", dan(sLow), "          ")}${elSuma(
          "typ:priceHigh",
          zaklad(sHigh),
          "          ",
        )}${elSuma("typ:priceHighVAT", dan(sHigh), "          ")}
          <typ:round><typ:priceRound>${fixed2(zaokruhlenie)}</typ:priceRound></typ:round>
        </inv:homeCurrency>
      </inv:invoiceSummary>
    </inv:invoice>
  </dat:dataPackItem>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>
<dat:dataPack id="${dataPackId}" ico="${ico}" application="Faktero" version="2.0" note="Prijaté doklady z Faktero"
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
  build(input: {
    company: CompanyRow;
    invoices: { invoice: InvoiceRow; items: ItemRow[] }[];
    /** Kódy z Pohody účtovníka; ostatné formáty ich ignorujú. */
    nastavenia?: PohodaNastavenia;
  }): {
    content: string;
    fileName: string;
    mime: string;
    /** Doklady, ktoré do súboru neprešli, aj s dôvodom. */
    preskocene?: string[];
  };
}

export const POHODA_XML: ExportStrategy = {
  format: "pohoda_xml",
  target_system: "pohoda",
  label: "Pohoda XML",
  encoding: "utf-8",
  mime: "application/xml",
  build({ company, invoices, nastavenia }) {
    const preskocene = invoices
      .map(({ invoice }) => pohodaPrekazka(invoice, company))
      .filter((d): d is string => !!d);
    // Prázdny balík schéma Pohody nepripúšťa a účtovníčke by prišiel súbor,
    // ktorý sa tvári ako export, ale nie je v ňom nič.
    if (preskocene.length === invoices.length) {
      throw new Error(`Do Pohody sa nedá vyviezť nič z vybraného: ${preskocene.join(", ")}`);
    }
    const content = buildPohodaInvoiceXml({ company, invoices, nastavenia });
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `pohoda-faktury-${stamp}.xml`;
    return { content, fileName, mime: "application/xml", preskocene };
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
