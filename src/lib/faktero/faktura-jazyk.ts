/**
 * Jazyk dokladu.
 *
 * Cudziu menu Faktero vedelo, ale PDF chodilo vždy po slovensky — odberateľ
 * v Rakúsku alebo Česku dostal doklad, ktorému nerozumie, a musel si ho dávať
 * prekladať. Prekladajú sa **popisky**, nie údaje: názvy položiek, poznámky a
 * adresy sú tak, ako ich firma napísala.
 *
 * Právne vety ostávajú s odkazom na slovenský zákon aj v cudzom jazyku —
 * paragraf je to, čo doklad robí platným, prekladá sa len jeho zmysel.
 */
export const JAZYKY_DOKLADU = [
  { kod: "sk", nazov: "Slovenčina" },
  { kod: "cs", nazov: "Čeština" },
  { kod: "en", nazov: "English" },
  { kod: "de", nazov: "Deutsch" },
  { kod: "hu", nazov: "Magyar" },
] as const;

export type JazykDokladu = (typeof JAZYKY_DOKLADU)[number]["kod"];

export const VYCHODZI_JAZYK: JazykDokladu = "sk";

export function jeJazykDokladu(v: unknown): v is JazykDokladu {
  return JAZYKY_DOKLADU.some((j) => j.kod === v);
}

/** Z čohokoľvek spraví podporovaný jazyk; neznáme ide na slovenčinu. */
export function jazykDokladu(v: unknown): JazykDokladu {
  return jeJazykDokladu(v) ? v : VYCHODZI_JAZYK;
}

type Popisky = {
  /** Skratka pred číslom dokladu — „č.", „No.", „Nr." */
  cislo: string;
  faktura: string;
  zalohovaFaktura: string;
  dokladKPlatbe: string;
  dobropis: string;
  cenovaPonuka: string;
  dodavatel: string;
  odberatel: string;
  ico: string;
  dic: string;
  icDph: string;
  datumVystavenia: string;
  datumDodania: string;
  datumSplatnosti: string;
  datumUhrady: string;
  variabilnySymbol: string;
  formaUhrady: string;
  polozka: string;
  mnozstvo: string;
  mj: string;
  cena: string;
  dph: string;
  celkom: string;
  medzisucet: string;
  zlava: string;
  spolu: string;
  zuctovanaZaloha: string;
  uhradene: string;
  spoluKUhrade: string;
  peciatkaPodpis: string;
  platobneUdaje: string;
  iban: string;
  swift: string;
  qrPlatba: string;
  poznamky: string;
  fakturaOnline: string;
  naskenujteKod: string;
  vystaveneCez: string;
  prenosEu: string;
  prenosVyvoz: string;
  prenosTuzemsko: string;
  /** Spôsoby úhrady — na doklade ich číta odberateľ, nie účtovník. */
  uhradaPrevod: string;
  uhradaKarta: string;
  uhradaHotovost: string;
};

const SK: Popisky = {
  mj: "MJ",
  uhradaPrevod: "Bankový prevod",
  uhradaKarta: "Karta",
  uhradaHotovost: "Hotovosť",
  cislo: "č.",
  faktura: "FAKTÚRA",
  zalohovaFaktura: "ZÁLOHOVÁ FAKTÚRA",
  dokladKPlatbe: "DAŇOVÝ DOKLAD K PRIJATEJ PLATBE",
  dobropis: "DOBROPIS",
  cenovaPonuka: "CENOVÁ PONUKA",
  dodavatel: "DODÁVATEĽ",
  odberatel: "ODBERATEĽ",
  ico: "IČO",
  dic: "DIČ",
  icDph: "IČ DPH",
  datumVystavenia: "Dátum vystavenia",
  datumDodania: "Dátum dodania",
  datumSplatnosti: "Dátum splatnosti",
  datumUhrady: "Dátum úhrady",
  variabilnySymbol: "Variabilný symbol",
  formaUhrady: "Forma úhrady",
  polozka: "POLOŽKA",
  mnozstvo: "MNOŽSTVO",
  cena: "CENA",
  dph: "DPH",
  celkom: "CELKOM",
  medzisucet: "Medzisúčet",
  zlava: "Zľava",
  spolu: "Spolu",
  zuctovanaZaloha: "Zúčtovaná záloha",
  uhradene: "UHRADENÉ",
  spoluKUhrade: "SPOLU K ÚHRADE",
  peciatkaPodpis: "Pečiatka a podpis",
  platobneUdaje: "PLATOBNÉ ÚDAJE",
  iban: "IBAN",
  swift: "SWIFT/BIC",
  qrPlatba: "QR PLATBA PREVODOM",
  poznamky: "POZNÁMKY",
  fakturaOnline: "FAKTÚRA ONLINE",
  naskenujteKod: "Naskenujte kód a faktúra sa otvorí v prehliadači.",
  vystaveneCez: "Vystavené cez Faktero — faktero.app",
  prenosEu:
    "Intrakomunitárne dodanie tovaru/služby oslobodené od DPH podľa §43 zákona č. 222/2004 Z. z. Daň je povinný priznať odberateľ.",
  prenosVyvoz:
    "Vývoz tovaru mimo územia EÚ oslobodený od DPH podľa §47 zákona č. 222/2004 Z. z.",
  prenosTuzemsko:
    "Prenesenie daňovej povinnosti podľa §69 ods. 12 zákona č. 222/2004 Z. z. o DPH. Daň je povinný priznať a odviesť odberateľ.",
};

const CS: Popisky = {
  ...SK,
  uhradaPrevod: "Bankovní převod",
  uhradaHotovost: "Hotovost",
  faktura: "FAKTURA",
  zalohovaFaktura: "ZÁLOHOVÁ FAKTURA",
  dokladKPlatbe: "DAŇOVÝ DOKLAD K PŘIJATÉ PLATBĚ",
  dobropis: "DOBROPIS",
  cenovaPonuka: "CENOVÁ NABÍDKA",
  dodavatel: "DODAVATEL",
  odberatel: "ODBĚRATEL",
  icDph: "DIČ (DPH)",
  datumVystavenia: "Datum vystavení",
  datumDodania: "Datum zdanitelného plnění",
  datumSplatnosti: "Datum splatnosti",
  datumUhrady: "Datum úhrady",
  variabilnySymbol: "Variabilní symbol",
  formaUhrady: "Forma úhrady",
  polozka: "POLOŽKA",
  mnozstvo: "MNOŽSTVÍ",
  cena: "CENA",
  celkom: "CELKEM",
  medzisucet: "Mezisoučet",
  zlava: "Sleva",
  spolu: "Celkem",
  zuctovanaZaloha: "Zúčtovaná záloha",
  uhradene: "UHRAZENO",
  spoluKUhrade: "CELKEM K ÚHRADĚ",
  peciatkaPodpis: "Razítko a podpis",
  platobneUdaje: "PLATEBNÍ ÚDAJE",
  qrPlatba: "QR PLATBA PŘEVODEM",
  poznamky: "POZNÁMKY",
  fakturaOnline: "FAKTURA ONLINE",
  naskenujteKod: "Naskenujte kód a faktura se otevře v prohlížeči.",
  prenosEu:
    "Intrakomunitární dodání zboží/služby osvobozené od DPH podle §43 slovenského zákona č. 222/2004 Z. z. Daň je povinen přiznat odběratel.",
  prenosVyvoz: "Vývoz zboží mimo území EU osvobozený od DPH podle §47 zákona č. 222/2004 Z. z.",
  prenosTuzemsko:
    "Přenesení daňové povinnosti podle §69 odst. 12 slovenského zákona č. 222/2004 Z. z. Daň je povinen přiznat a odvést odběratel.",
};

const EN: Popisky = {
  mj: "UNIT",
  uhradaPrevod: "Bank transfer",
  uhradaKarta: "Card",
  uhradaHotovost: "Cash",
  cislo: "No.",
  faktura: "INVOICE",
  zalohovaFaktura: "PROFORMA INVOICE",
  dokladKPlatbe: "TAX DOCUMENT FOR PAYMENT RECEIVED",
  dobropis: "CREDIT NOTE",
  cenovaPonuka: "QUOTATION",
  dodavatel: "SUPPLIER",
  odberatel: "CUSTOMER",
  ico: "Company ID",
  dic: "Tax ID",
  icDph: "VAT ID",
  datumVystavenia: "Issue date",
  datumDodania: "Date of supply",
  datumSplatnosti: "Due date",
  datumUhrady: "Payment date",
  variabilnySymbol: "Payment reference",
  formaUhrady: "Payment method",
  polozka: "ITEM",
  mnozstvo: "QUANTITY",
  cena: "PRICE",
  dph: "VAT",
  celkom: "TOTAL",
  medzisucet: "Subtotal",
  zlava: "Discount",
  spolu: "Total",
  zuctovanaZaloha: "Advance settled",
  uhradene: "PAID",
  spoluKUhrade: "TOTAL DUE",
  peciatkaPodpis: "Stamp and signature",
  platobneUdaje: "PAYMENT DETAILS",
  iban: "IBAN",
  swift: "SWIFT/BIC",
  qrPlatba: "QR BANK TRANSFER",
  poznamky: "NOTES",
  fakturaOnline: "INVOICE ONLINE",
  naskenujteKod: "Scan the code to open the invoice in your browser.",
  vystaveneCez: "Issued with Faktero — faktero.app",
  prenosEu:
    "Intra-Community supply of goods/services exempt from VAT under §43 of Slovak Act No. 222/2004 Coll. VAT is payable by the customer.",
  prenosVyvoz:
    "Export of goods outside the EU exempt from VAT under §47 of Slovak Act No. 222/2004 Coll.",
  prenosTuzemsko:
    "Reverse charge under §69(12) of Slovak Act No. 222/2004 Coll. VAT is to be reported and paid by the customer.",
};

const DE: Popisky = {
  mj: "EINHEIT",
  uhradaPrevod: "Überweisung",
  uhradaKarta: "Karte",
  uhradaHotovost: "Bar",
  cislo: "Nr.",
  faktura: "RECHNUNG",
  zalohovaFaktura: "ANZAHLUNGSRECHNUNG",
  dokladKPlatbe: "STEUERBELEG ÜBER DIE ERHALTENE ZAHLUNG",
  dobropis: "GUTSCHRIFT",
  cenovaPonuka: "ANGEBOT",
  dodavatel: "LIEFERANT",
  odberatel: "KUNDE",
  ico: "Firmenbuchnummer",
  dic: "Steuernummer",
  icDph: "USt-IdNr.",
  datumVystavenia: "Rechnungsdatum",
  datumDodania: "Lieferdatum",
  datumSplatnosti: "Fällig am",
  datumUhrady: "Zahlungsdatum",
  variabilnySymbol: "Verwendungszweck",
  formaUhrady: "Zahlungsart",
  polozka: "POSITION",
  mnozstvo: "MENGE",
  cena: "PREIS",
  dph: "USt.",
  celkom: "GESAMT",
  medzisucet: "Zwischensumme",
  zlava: "Rabatt",
  spolu: "Summe",
  zuctovanaZaloha: "Verrechnete Anzahlung",
  uhradene: "BEZAHLT",
  spoluKUhrade: "ZAHLBETRAG",
  peciatkaPodpis: "Stempel und Unterschrift",
  platobneUdaje: "ZAHLUNGSDATEN",
  iban: "IBAN",
  swift: "SWIFT/BIC",
  qrPlatba: "QR-ÜBERWEISUNG",
  poznamky: "ANMERKUNGEN",
  fakturaOnline: "RECHNUNG ONLINE",
  naskenujteKod: "Scannen Sie den Code, die Rechnung öffnet sich im Browser.",
  vystaveneCez: "Erstellt mit Faktero — faktero.app",
  prenosEu:
    "Innergemeinschaftliche Lieferung/Leistung, steuerfrei nach §43 des slowakischen Gesetzes Nr. 222/2004 Slg. Die Steuer schuldet der Leistungsempfänger.",
  prenosVyvoz:
    "Ausfuhrlieferung in ein Drittland, steuerfrei nach §47 des slowakischen Gesetzes Nr. 222/2004 Slg.",
  prenosTuzemsko:
    "Übergang der Steuerschuld nach §69 Abs. 12 des slowakischen Gesetzes Nr. 222/2004 Slg. Die Steuer schuldet der Leistungsempfänger.",
};

const HU: Popisky = {
  ...EN,
  mj: "M.E.",
  uhradaPrevod: "Banki átutalás",
  uhradaKarta: "Kártya",
  uhradaHotovost: "Készpénz",
  cislo: "sz.",
  faktura: "SZÁMLA",
  zalohovaFaktura: "ELŐLEGSZÁMLA",
  dokladKPlatbe: "ADÓÜGYI BIZONYLAT A KAPOTT FIZETÉSRŐL",
  dobropis: "JÓVÁÍRÁS",
  cenovaPonuka: "ÁRAJÁNLAT",
  dodavatel: "SZÁLLÍTÓ",
  odberatel: "VEVŐ",
  ico: "Cégjegyzékszám",
  dic: "Adószám",
  icDph: "Közösségi adószám",
  datumVystavenia: "Kiállítás dátuma",
  datumDodania: "Teljesítés dátuma",
  datumSplatnosti: "Fizetési határidő",
  datumUhrady: "Fizetés dátuma",
  variabilnySymbol: "Közlemény",
  formaUhrady: "Fizetési mód",
  polozka: "TÉTEL",
  mnozstvo: "MENNYISÉG",
  cena: "ÁR",
  dph: "ÁFA",
  celkom: "ÖSSZESEN",
  medzisucet: "Részösszeg",
  zlava: "Kedvezmény",
  spolu: "Összesen",
  zuctovanaZaloha: "Beszámított előleg",
  uhradene: "KIFIZETVE",
  spoluKUhrade: "FIZETENDŐ",
  peciatkaPodpis: "Bélyegző és aláírás",
  platobneUdaje: "FIZETÉSI ADATOK",
  qrPlatba: "QR ÁTUTALÁS",
  poznamky: "MEGJEGYZÉSEK",
  fakturaOnline: "SZÁMLA ONLINE",
  naskenujteKod: "Olvassa be a kódot, a számla megnyílik a böngészőben.",
};

const SLOVNIKY: Record<JazykDokladu, Popisky> = { sk: SK, cs: CS, en: EN, de: DE, hu: HU };

export function popisky(jazyk: unknown): Popisky {
  return SLOVNIKY[jazykDokladu(jazyk)];
}

/**
 * Locale na formátovanie čísel.
 *
 * Nemec číta „1.234,56", Angličan „1,234.56" — s jedným formátom by si jeden
 * z nich prečítal sumu o tri rády vedľa.
 */
export function localeDokladu(jazyk: unknown): string {
  return { sk: "sk-SK", cs: "cs-CZ", en: "en-GB", de: "de-DE", hu: "hu-HU" }[jazykDokladu(jazyk)];
}
