import { krajinaDane, type KrajinaDane } from "./vat-rates";
import { pomenovanieDobropisuVObjekte } from "@/lib/i18n/dobropis-de";

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
  tarchopis: string;
  /**
   * Dodávateľ z iného štátu EÚ (samofaktúra) — slovenský § 43 sa naňho
   * nevzťahuje, odkazuje sa na smernicu: tovar čl. 138, služba čl. 196.
   */
  prenosEuTovarSmernica: string;
  prenosEuSluzbaSmernica: string;
  /** Opravný doklad musí uviesť číslo faktúry, ktorú opravuje (§ 71 ods. 2). */
  opravujeFakturu: string;
  /** Samofaktúra — znenie podľa čl. 226 bod 10a smernice 2006/112/ES v jazyku dokladu. */
  vyhotovenieOdberatelom: string;
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
  zakladDane: string;
  /** Súčet DPH pod rozpisom podľa sadzieb. */
  dphSpolu: string;
  /** Hlavička stĺpca v rozpise DPH. */
  sadzba: string;
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
  /** Skratka prenesenia daňovej povinnosti v stĺpci DPH („PDP“, „RC“). */
  pdp: string;
  /** Riadok dane v súčtoch pri prenesení („DPH (PDP)“, „USt. (Reverse-Charge)“). */
  dphPdp: string;
  /** Úvod vety, keď sa prenesenie týka len označených položiek. */
  polozkyPdp: string;
  /** Pred dátumom úhrady na zaplatenej faktúre („Uhradené 11. 10. 2026“). */
  uhradeneDna: string;
  /** Nadpis dokladu podľa § 25a (oprava základu pri nevymožiteľnej pohľadávke). */
  opravnyDoklad: string;
  /** Správa pre príjemcu v platobnom QR („Faktura 2026001“) — bez diakritiky kvôli bankám. */
  spravaQr: string;
  /** Spôsoby úhrady — na doklade ich číta odberateľ, nie účtovník. */
  uhradaPrevod: string;
  uhradaKarta: string;
  uhradaHotovost: string;
};

const SK: Popisky = {
  mj: "MJ",
  pdp: "PDP",
  dphPdp: "DPH (PDP)",
  polozkyPdp: "Položky označené PDP:",
  uhradeneDna: "Uhradené",
  opravnyDoklad: "OPRAVNÝ DOKLAD",
  spravaQr: "Faktura",
  uhradaPrevod: "Bankový prevod",
  uhradaKarta: "Karta",
  uhradaHotovost: "Hotovosť",
  cislo: "č.",
  faktura: "FAKTÚRA",
  zalohovaFaktura: "ZÁLOHOVÁ FAKTÚRA",
  dokladKPlatbe: "DAŇOVÝ DOKLAD K PRIJATEJ PLATBE",
  dobropis: "DOBROPIS",
  tarchopis: "ŤARCHOPIS",
  prenosEuTovarSmernica: "Oslobodené dodanie tovaru do iného členského štátu – čl. 138 smernice 2006/112/ES. Daň platí odberateľ.",
  prenosEuSluzbaSmernica: "Prenesenie daňovej povinnosti – čl. 196 smernice 2006/112/ES. Daň platí odberateľ.",
  opravujeFakturu: "Opravuje faktúru č.",
  vyhotovenieOdberatelom: "Vyhotovenie faktúry odberateľom",
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
  zakladDane: "Základ dane",
  dphSpolu: "DPH spolu",
  sadzba: "Sadzba",
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
  dphPdp: "DPH (PDP)",
  polozkyPdp: "Položky označené PDP:",
  uhradeneDna: "Uhrazeno",
  opravnyDoklad: "OPRAVNÝ DAŇOVÝ DOKLAD",
  uhradaPrevod: "Bankovní převod",
  uhradaHotovost: "Hotovost",
  faktura: "FAKTURA",
  zalohovaFaktura: "ZÁLOHOVÁ FAKTURA",
  dokladKPlatbe: "DAŇOVÝ DOKLAD K PŘIJATÉ PLATBĚ",
  dobropis: "DOBROPIS",
  tarchopis: "VRUBOPIS",
  prenosEuTovarSmernica: "Osvobozené dodání zboží do jiného členského státu – čl. 138 směrnice 2006/112/ES. Daň odvede zákazník.",
  prenosEuSluzbaSmernica: "Přenesení daňové povinnosti – čl. 196 směrnice 2006/112/ES. Daň odvede zákazník.",
  opravujeFakturu: "Opravuje fakturu č.",
  vyhotovenieOdberatelom: "Vystaveno zákazníkem",
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
  zakladDane: "Základ daně",
  dphSpolu: "DPH celkem",
  sadzba: "Sazba",
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
  pdp: "RC",
  dphPdp: "VAT (reverse charge)",
  polozkyPdp: "Items marked RC:",
  uhradeneDna: "Paid on",
  opravnyDoklad: "CORRECTIVE TAX DOCUMENT",
  spravaQr: "Invoice",
  uhradaPrevod: "Bank transfer",
  uhradaKarta: "Card",
  uhradaHotovost: "Cash",
  cislo: "No.",
  faktura: "INVOICE",
  zalohovaFaktura: "PROFORMA INVOICE",
  dokladKPlatbe: "TAX DOCUMENT FOR PAYMENT RECEIVED",
  dobropis: "CREDIT NOTE",
  tarchopis: "DEBIT NOTE",
  prenosEuTovarSmernica: "Exempt intra-Community supply of goods – Article 138 of Directive 2006/112/EC. VAT is due from the customer.",
  prenosEuSluzbaSmernica: "Reverse charge – Article 196 of Directive 2006/112/EC. VAT is due from the customer.",
  opravujeFakturu: "Corrects invoice No.",
  vyhotovenieOdberatelom: "Self-billing",
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
  zakladDane: "Taxable amount",
  dphSpolu: "VAT total",
  sadzba: "Rate",
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
  pdp: "RC",
  dphPdp: "USt. (Reverse-Charge)",
  polozkyPdp: "Mit RC gekennzeichnete Positionen:",
  uhradeneDna: "Bezahlt am",
  opravnyDoklad: "BERICHTIGUNGSBELEG",
  spravaQr: "Rechnung",
  uhradaPrevod: "Überweisung",
  uhradaKarta: "Karte",
  uhradaHotovost: "Bar",
  cislo: "Nr.",
  faktura: "RECHNUNG",
  zalohovaFaktura: "ANZAHLUNGSRECHNUNG",
  dokladKPlatbe: "STEUERBELEG ÜBER DIE ERHALTENE ZAHLUNG",
  dobropis: "RECHNUNGSKORREKTUR",
  tarchopis: "LASTSCHRIFT",
  prenosEuTovarSmernica: "Steuerfreie innergemeinschaftliche Lieferung – Art. 138 Richtlinie 2006/112/EG. Die Steuer schuldet der Leistungsempfänger.",
  prenosEuSluzbaSmernica: "Steuerschuldnerschaft des Leistungsempfängers – Art. 196 Richtlinie 2006/112/EG.",
  opravujeFakturu: "Berichtigt Rechnung Nr.",
  vyhotovenieOdberatelom: "Gutschrift",
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
  zakladDane: "Nettobetrag",
  dphSpolu: "USt. gesamt",
  sadzba: "Satz",
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
  pdp: "FAD",
  dphPdp: "ÁFA (fordított adózás)",
  polozkyPdp: "A FAD jelölésű tételek:",
  uhradeneDna: "Kifizetve:",
  opravnyDoklad: "HELYESBÍTŐ BIZONYLAT",
  spravaQr: "Szamla",
  uhradaPrevod: "Banki átutalás",
  uhradaKarta: "Kártya",
  uhradaHotovost: "Készpénz",
  cislo: "sz.",
  faktura: "SZÁMLA",
  zalohovaFaktura: "ELŐLEGSZÁMLA",
  dokladKPlatbe: "ADÓÜGYI BIZONYLAT A KAPOTT FIZETÉSRŐL",
  dobropis: "JÓVÁÍRÁS",
  tarchopis: "TERHELÉSI ÉRTESÍTŐ",
  prenosEuTovarSmernica: "Adómentes Közösségen belüli termékértékesítés – 2006/112/EK irányelv 138. cikk. Az adót a vevő fizeti.",
  prenosEuSluzbaSmernica: "Fordított adózás – 2006/112/EK irányelv 196. cikk. Az adót a vevő fizeti.",
  opravujeFakturu: "Helyesbíti a számlát, sz.",
  vyhotovenieOdberatelom: "Önszámlázás",
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
  zakladDane: "Adóalap",
  dphSpolu: "ÁFA összesen",
  sadzba: "Kulcs",
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

/**
 * Popisky dokladu v jazyku. `krajina` = daňová krajina vystavujúcej firmy:
 * nemecký nadpis dobropisu „RECHNUNGSKORREKTUR“ platí len pre firmu z Nemecka,
 * slovenská či česká firma má na nemeckom doklade „GUTSCHRIFT“
 * (`dobropis-de.ts`). Bez krajiny ostáva nemecké názvoslovie.
 */
export function popisky(jazyk: unknown, krajina?: KrajinaDane | null): Popisky {
  return pomenovanieDobropisuVObjekte(SLOVNIKY[jazykDokladu(jazyk)], krajina);
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

/**
 * Zákonné vety k preneseniu a oslobodeniu, keď faktúru vystavuje **česká**
 * firma. Slovník vyššie cituje slovenský zákon 222/2004 — českej firme platí
 * zákon č. 235/2004 Sb.: tuzemské prenesenie § 92a, dodanie tovaru do EÚ § 64,
 * služba s miestom plnenia v inom štáte § 9 odst. 1 a vývoz § 66. Pri
 * prenesení musí na doklade byť „daň odvede zákazník“ (§ 29 odst. 2).
 */
export type VetyPreneseniaCz = { euTovar: string; euSluzba: string; vyvoz: string; tuzemsko: string };

const VETY_CZ: Record<JazykDokladu, VetyPreneseniaCz> = {
  cs: {
    euTovar: "Dodání zboží do jiného členského státu osvobozené od daně podle § 64 zákona č. 235/2004 Sb., o DPH.",
    euSluzba:
      "Poskytnutí služby s místem plnění v jiném členském státě podle § 9 odst. 1 zákona č. 235/2004 Sb., o DPH. Daň odvede zákazník.",
    vyvoz: "Vývoz zboží osvobozený od daně podle § 66 zákona č. 235/2004 Sb., o DPH.",
    tuzemsko: "Přenesení daňové povinnosti podle § 92a zákona č. 235/2004 Sb., o DPH. Daň odvede zákazník.",
  },
  sk: {
    euTovar: "Dodanie tovaru do iného členského štátu oslobodené od dane podľa § 64 českého zákona č. 235/2004 Sb. o DPH.",
    euSluzba:
      "Služba s miestom plnenia v inom členskom štáte podľa § 9 ods. 1 českého zákona č. 235/2004 Sb. o DPH. Daň odvedie zákazník.",
    vyvoz: "Vývoz tovaru oslobodený od dane podľa § 66 českého zákona č. 235/2004 Sb. o DPH.",
    tuzemsko: "Prenesenie daňovej povinnosti podľa § 92a českého zákona č. 235/2004 Sb. o DPH. Daň odvedie zákazník.",
  },
  en: {
    euTovar: "Exempt intra-Community supply of goods under Section 64 of Czech VAT Act No. 235/2004 Coll.",
    euSluzba:
      "Supply of services with place of supply in another Member State under Section 9(1) of Czech VAT Act No. 235/2004 Coll. Reverse charge — VAT to be paid by the customer.",
    vyvoz: "Export of goods exempt from VAT under Section 66 of Czech VAT Act No. 235/2004 Coll.",
    tuzemsko: "Reverse charge under Section 92a of Czech VAT Act No. 235/2004 Coll. VAT to be paid by the customer.",
  },
  de: {
    euTovar: "Steuerfreie innergemeinschaftliche Lieferung nach § 64 des tschechischen Gesetzes Nr. 235/2004 Slg. über die MwSt.",
    euSluzba:
      "Leistung mit Leistungsort in einem anderen Mitgliedstaat nach § 9 Abs. 1 des tschechischen Gesetzes Nr. 235/2004 Slg. Die Steuer schuldet der Leistungsempfänger.",
    vyvoz: "Steuerfreie Ausfuhrlieferung nach § 66 des tschechischen Gesetzes Nr. 235/2004 Slg. über die MwSt.",
    tuzemsko:
      "Übergang der Steuerschuld nach § 92a des tschechischen Gesetzes Nr. 235/2004 Slg. Die Steuer schuldet der Leistungsempfänger.",
  },
  hu: {
    euTovar: "Adómentes Közösségen belüli termékértékesítés a 235/2004. sz. cseh áfatörvény 64. §-a alapján.",
    euSluzba:
      "Szolgáltatás, amelynek teljesítési helye másik tagállam, a 235/2004. sz. cseh áfatörvény 9. § (1) bekezdése alapján. Az adót a vevő fizeti.",
    vyvoz: "Adómentes termékexport a 235/2004. sz. cseh áfatörvény 66. §-a alapján.",
    tuzemsko: "Fordított adózás a 235/2004. sz. cseh áfatörvény 92a. §-a alapján. Az adót a vevő fizeti.",
  },
};

export function vetyPreneseniaCz(jazyk: unknown): VetyPreneseniaCz {
  return VETY_CZ[jazykDokladu(jazyk)];
}

/**
 * Zákonné vety, keď faktúru vystavuje **nemecká** firma (UStG).
 *
 * - `kleinunternehmer` — § 19 UStG, faktúra bez dane;
 * - `tuzemsko` — tuzemské prenesenie (Reverse-Charge, § 13b UStG);
 * - `euTovar` — oslobodené intrakomunitárne dodanie tovaru (§ 4 Nr. 1b
 *   v spojení s § 6a UStG), na doklade musí byť aj USt-IdNr. odberateľa;
 * - `euSluzba` — služba podnikateľovi z EÚ s miestom plnenia u neho
 *   (§ 3a Abs. 2 UStG), daň platí odberateľ (§ 14a Abs. 1 UStG);
 * - `vyvoz` — vývoz mimo EÚ (§ 4 Nr. 1a v spojení s § 6 UStG).
 *
 * Znenie je nemecké aj na doklade v inom jazyku okrem angličtiny: nemecký
 * Finanzamt číta nemecký text a § 14a UStG vyžaduje práve tieto formulácie.
 */
export type VetyDe = {
  kleinunternehmer: string;
  /** § 25b UStG — prostredná osoba v trojstrannom obchode, daň platí posledný odberateľ. */
  trojstranny: string;
  tuzemsko: string;
  euTovar: string;
  euSluzba: string;
  vyvoz: string;
};

const VETY_DE_DE: VetyDe = {
  kleinunternehmer: "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.",
  trojstranny:
    "Innergemeinschaftliches Dreiecksgeschäft gemäß § 25b UStG. Die Steuer schuldet der letzte Abnehmer.",
  tuzemsko: "Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG).",
  euTovar: "Steuerfreie innergemeinschaftliche Lieferung gemäß § 4 Nr. 1b UStG.",
  euSluzba: "Nicht im Inland steuerbare Leistung – Steuerschuldnerschaft des Leistungsempfängers.",
  vyvoz: "Steuerfreie Ausfuhrlieferung gemäß § 4 Nr. 1a UStG.",
};

/* Angličtina s nemeckým znením v zátvorke — zákonná formulácia nesmie chýbať. */
const VETY_DE_EN: VetyDe = {
  kleinunternehmer:
    "No VAT is charged under the small business scheme (Gemäß § 19 UStG wird keine Umsatzsteuer berechnet).",
  trojstranny:
    "Intra-Community triangular transaction – VAT is due from the final customer (Innergemeinschaftliches Dreiecksgeschäft gemäß § 25b UStG. Die Steuer schuldet der letzte Abnehmer).",
  tuzemsko: "Reverse charge – VAT liability of the recipient (Steuerschuldnerschaft des Leistungsempfängers, § 13b UStG).",
  euTovar: "Tax-exempt intra-Community supply of goods (Steuerfreie innergemeinschaftliche Lieferung gemäß § 4 Nr. 1b UStG).",
  euSluzba:
    "Reverse charge – service not taxable in Germany (Nicht im Inland steuerbare Leistung – Steuerschuldnerschaft des Leistungsempfängers).",
  vyvoz: "Tax-exempt export delivery (Steuerfreie Ausfuhrlieferung gemäß § 4 Nr. 1a UStG).",
};

export function vetyDe(jazyk: unknown = "de"): VetyDe {
  return jazykDokladu(jazyk) === "en" ? VETY_DE_EN : VETY_DE_DE;
}

/**
 * Veta k preneseniu / oslobodeniu na doklade nemeckej firmy podľa situácie,
 * ktorú rozlišuje faktúra (`reverse_charge_type` + `eu_plnenie`). Trojstranný
 * obchod má vlastnú vetu podľa § 25b Abs. 4 UStG — bez nej by daň za
 * posledného odberateľa neprešla. Bez prenesenia `null`.
 */
export function vetaPreneseniaDe(
  typ: string | null | undefined,
  euPlnenie: string | null | undefined,
  jazyk: unknown = "de",
): string | null {
  const v = vetyDe(jazyk);
  if (typ === "eu_b2b")
    return euPlnenie === "sluzba" ? v.euSluzba : euPlnenie === "trojstranny" ? v.trojstranny : v.euTovar;
  if (typ === "export") return v.vyvoz;
  if (typ === "domestic_69") return v.tuzemsko;
  return null;
}

/**
 * Predvolený jazyk dokladu podľa krajiny firmy, keď ho nedá faktúra ani
 * odberateľ. Nemecká firma fakturuje po nemecky; ostatné ostávajú pri
 * slovenčine, ako doteraz.
 */
export function predvolenyJazykFirmy(country: string | null | undefined): JazykDokladu {
  return krajinaDane(country) === "DE" ? "de" : VYCHODZI_JAZYK;
}

/**
 * Dátum na doklade — deň, mesiac, rok (nie „2026-10-11“). Po slovensky,
 * česky a maďarsky „11. 10. 2026“, po nemecky „11.10.2026“, po anglicky
 * „11/10/2026“. Prázdny alebo nečitateľný dátum vráti, ako prišiel.
 */
export function datumNaDoklade(v: unknown, jazyk: unknown = "sk"): string {
  const s = String(v ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s || "—";
  const [, r, mes, d] = m;
  const j = jazykDokladu(jazyk);
  if (j === "de") return `${d}.${mes}.${r}`;
  if (j === "en") return `${d}/${mes}/${r}`;
  return `${Number(d)}. ${Number(mes)}. ${r}`;
}
