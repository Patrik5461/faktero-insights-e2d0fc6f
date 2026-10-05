/*
  Texty pre dodávateľa — stránka na odsúhlasenie a e-mail s faktúrou.

  Dodávateľ zo zahraničia (alebo z Česka) dostane všetko v jazyku faktúry,
  nie po slovensky. Jazyk sa berie z `purchase_invoices.language` — ten istý,
  v ktorom je PDF.
*/

import type { JazykDokladu } from "./faktura-jazyk";

export type TextyDodavatela = {
  faktura: string;
  dobropis: string;
  naOdsuhlasenie: string;
  vyhotovenieOdberatelom: string;
  uvod: (odberatel: string) => string;
  opravuje: (cislo: string) => string;
  dodavatelVy: string;
  odberatel: string;
  ico: string;
  dic: string;
  icDph: string;
  neplatitel: string;
  vyhotovena: string;
  dodanie: string;
  splatnost: string;
  naUcet: string;
  vs: string;
  polozka: string;
  mnozstvo: string;
  cenaBezDph: string;
  dph: string;
  spoluBezDph: string;
  zaklad: string;
  spolu: string;
  prenesenie: string;
  stiahnutPdf: string;
  otazka: string;
  suhlasim: string;
  nesuhlasim: string;
  coNesedi: string;
  vratit: string;
  spat: string;
  odsuhlasene: string;
  vratene: string;
  vasaPoznamka: string;
  nacitavam: string;
  vyhotoveneCez: string;
  // e-mail
  predmet: (druh: string, cislo: string, odberatel: string) => string;
  pozdrav: string;
  mailTelo: (druh: string, cislo: string, suma: string, opravuje: string | null) => string;
  mailProsba: string;
  mailAkNesedi: string;
  mailOtvorit: string;
  mailOdkaz: string;
};

const SK: TextyDodavatela = {
  faktura: "Faktúra",
  dobropis: "Dobropis",
  naOdsuhlasenie: "na odsúhlasenie",
  vyhotovenieOdberatelom: "vyhotovenie faktúry odberateľom",
  uvod: (o) =>
    `${o} za Vás podľa dohody o samofakturácii vyhotovil faktúru. Je Vaša — za správnosť dane zodpovedáte Vy, preto ju prosím skontrolujte a odsúhlaste.`,
  opravuje: (c) => `Opravuje faktúru ${c}`,
  ico: "IČO",
  dic: "DIČ",
  icDph: "IČ DPH",
  dodavatelVy: "Dodávateľ (Vy)",
  odberatel: "Odberateľ",
  neplatitel: "Neplatiteľ DPH",
  vyhotovena: "Vyhotovená",
  dodanie: "Dodanie",
  splatnost: "Splatnosť",
  naUcet: "Na účet",
  vs: "VS",
  polozka: "Položka",
  mnozstvo: "Množstvo",
  cenaBezDph: "Cena bez DPH",
  dph: "DPH",
  spoluBezDph: "Spolu bez DPH",
  zaklad: "Základ",
  spolu: "Spolu",
  prenesenie: "Prenesenie daňovej povinnosti — daň odvedie odberateľ.",
  stiahnutPdf: "Stiahnuť PDF",
  otazka: "Súhlasíte s faktúrou?",
  suhlasim: "Súhlasím s faktúrou",
  nesuhlasim: "Nesúhlasím",
  coNesedi: "Čo na faktúre nesedí?",
  vratit: "Vrátiť na opravu",
  spat: "Späť",
  odsuhlasene:
    "Faktúru ste odsúhlasili. Odberateľ o tom vie — zaeviduje si ju ako prijatú a uhradí ju v splatnosti. Zaevidujte si ju aj Vy medzi vydané faktúry.",
  vratene: "Faktúru ste vrátili s poznámkou. Odberateľ ju opraví a pošle Vám novú na odsúhlasenie.",
  vasaPoznamka: "Vaša poznámka",
  nacitavam: "Načítavam faktúru…",
  vyhotoveneCez: "Vyhotovené cez",
  predmet: (d, c, o) => `${d} ${c} na odsúhlasenie — vyhotovil ${o}`,
  pozdrav: "Dobrý deň,",
  mailTelo: (d, c, s, op) =>
    `podľa dohody o samofakturácii sme za Vás vyhotovili ${d.toLowerCase()} ${c} na ${s}${op ? ` k faktúre ${op}` : ""}. Je v prílohe.`,
  mailProsba: "Faktúra je Vaša a za správnosť dane zodpovedáte Vy — preto Vás prosíme o odsúhlasenie.",
  mailAkNesedi: "Ak v nej niečo nesedí, na tej istej stránke ju vrátite s poznámkou a opravíme ju.",
  mailOtvorit: "Alebo si ju najprv pozrite:",
  mailOdkaz: "otvoriť faktúru online",
};

const CS: TextyDodavatela = {
  faktura: "Faktura",
  dobropis: "Dobropis",
  naOdsuhlasenie: "ke schválení",
  vyhotovenieOdberatelom: "vystaveno zákazníkem",
  uvod: (o) =>
    `${o} za Vás podle dohody o vystavování faktur zákazníkem (self-billing) vystavil fakturu. Je Vaše — za správnost daně odpovídáte Vy, proto ji prosím zkontrolujte a schvalte.`,
  opravuje: (c) => `Opravuje fakturu ${c}`,
  ico: "IČO",
  dic: "DIČ",
  icDph: "DIČ (DPH)",
  dodavatelVy: "Dodavatel (Vy)",
  odberatel: "Odběratel",
  neplatitel: "Neplátce DPH",
  vyhotovena: "Vystavena",
  dodanie: "Datum plnění",
  splatnost: "Splatnost",
  naUcet: "Na účet",
  vs: "VS",
  polozka: "Položka",
  mnozstvo: "Množství",
  cenaBezDph: "Cena bez DPH",
  dph: "DPH",
  spoluBezDph: "Celkem bez DPH",
  zaklad: "Základ",
  spolu: "Celkem",
  prenesenie: "Přenesení daňové povinnosti — daň odvede odběratel.",
  stiahnutPdf: "Stáhnout PDF",
  otazka: "Souhlasíte s fakturou?",
  suhlasim: "Souhlasím s fakturou",
  nesuhlasim: "Nesouhlasím",
  coNesedi: "Co na faktuře nesedí?",
  vratit: "Vrátit k opravě",
  spat: "Zpět",
  odsuhlasene:
    "Fakturu jste schválili. Odběratel o tom ví — zaeviduje si ji jako přijatou a uhradí ji ve splatnosti. Zaevidujte si ji i Vy mezi vydané faktury.",
  vratene: "Fakturu jste vrátili s poznámkou. Odběratel ji opraví a pošle Vám novou ke schválení.",
  vasaPoznamka: "Vaše poznámka",
  nacitavam: "Načítám fakturu…",
  vyhotoveneCez: "Vystaveno přes",
  predmet: (d, c, o) => `${d} ${c} ke schválení — vystavil ${o}`,
  pozdrav: "Dobrý den,",
  mailTelo: (d, c, s, op) =>
    `podle dohody o vystavování faktur zákazníkem jsme za Vás vystavili ${d.toLowerCase()} ${c} na ${s}${op ? ` k faktuře ${op}` : ""}. Je v příloze.`,
  mailProsba: "Faktura je Vaše a za správnost daně odpovídáte Vy — proto Vás prosíme o schválení.",
  mailAkNesedi: "Pokud v ní něco nesedí, na stejné stránce ji vrátíte s poznámkou a opravíme ji.",
  mailOtvorit: "Nebo si ji nejprve prohlédněte:",
  mailOdkaz: "otevřít fakturu online",
};

const EN: TextyDodavatela = {
  faktura: "Invoice",
  dobropis: "Credit note",
  naOdsuhlasenie: "for approval",
  vyhotovenieOdberatelom: "self-billing",
  uvod: (o) =>
    `${o} has issued this invoice on your behalf under your self-billing agreement. It is your invoice and you are responsible for the VAT on it, so please review and approve it.`,
  opravuje: (c) => `Corrects invoice ${c}`,
  ico: "Company ID",
  dic: "Tax ID",
  icDph: "VAT ID",
  dodavatelVy: "Supplier (you)",
  odberatel: "Customer",
  neplatitel: "Not registered for VAT",
  vyhotovena: "Issued",
  dodanie: "Supply date",
  splatnost: "Due date",
  naUcet: "To account",
  vs: "Reference",
  polozka: "Item",
  mnozstvo: "Quantity",
  cenaBezDph: "Price excl. VAT",
  dph: "VAT",
  spoluBezDph: "Total excl. VAT",
  zaklad: "Net",
  spolu: "Total",
  prenesenie: "Reverse charge — VAT is accounted for by the customer.",
  stiahnutPdf: "Download PDF",
  otazka: "Do you approve this invoice?",
  suhlasim: "I approve the invoice",
  nesuhlasim: "I don't approve",
  coNesedi: "What is wrong with the invoice?",
  vratit: "Return for correction",
  spat: "Back",
  odsuhlasene:
    "You have approved the invoice. The customer has been notified and will pay it by the due date. Please record it among your issued invoices.",
  vratene: "You have returned the invoice with a note. The customer will correct it and send you a new one for approval.",
  vasaPoznamka: "Your note",
  nacitavam: "Loading invoice…",
  vyhotoveneCez: "Issued with",
  predmet: (d, c, o) => `${d} ${c} for approval — issued by ${o}`,
  pozdrav: "Hello,",
  mailTelo: (d, c, s, op) =>
    `under our self-billing agreement we have issued ${d.toLowerCase()} ${c} for ${s} on your behalf${op ? `, correcting invoice ${op}` : ""}. It is attached.`,
  mailProsba: "The invoice is yours and you are responsible for the VAT on it — please approve it.",
  mailAkNesedi: "If anything is wrong, you can return it with a note on the same page and we will correct it.",
  mailOtvorit: "Or review it first:",
  mailOdkaz: "open the invoice online",
};

const DE: TextyDodavatela = {
  faktura: "Rechnung",
  dobropis: "Stornorechnung",
  naOdsuhlasenie: "zur Freigabe",
  vyhotovenieOdberatelom: "Gutschrift",
  uvod: (o) =>
    `${o} hat diese Rechnung gemäß Ihrer Gutschriftvereinbarung in Ihrem Namen ausgestellt. Es ist Ihre Rechnung und Sie sind für die Umsatzsteuer verantwortlich — bitte prüfen und bestätigen Sie sie.`,
  opravuje: (c) => `Berichtigt Rechnung ${c}`,
  ico: "Firmennummer",
  dic: "Steuernummer",
  icDph: "USt-IdNr.",
  dodavatelVy: "Lieferant (Sie)",
  odberatel: "Kunde",
  neplatitel: "Nicht umsatzsteuerpflichtig",
  vyhotovena: "Ausgestellt",
  dodanie: "Leistungsdatum",
  splatnost: "Fällig",
  naUcet: "Auf Konto",
  vs: "Verwendungszweck",
  polozka: "Position",
  mnozstvo: "Menge",
  cenaBezDph: "Preis netto",
  dph: "USt.",
  spoluBezDph: "Summe netto",
  zaklad: "Netto",
  spolu: "Gesamt",
  prenesenie: "Steuerschuldnerschaft des Leistungsempfängers.",
  stiahnutPdf: "PDF herunterladen",
  otazka: "Bestätigen Sie die Rechnung?",
  suhlasim: "Rechnung bestätigen",
  nesuhlasim: "Nicht bestätigen",
  coNesedi: "Was stimmt an der Rechnung nicht?",
  vratit: "Zur Korrektur zurückgeben",
  spat: "Zurück",
  odsuhlasene:
    "Sie haben die Rechnung bestätigt. Der Kunde wurde benachrichtigt und zahlt sie fristgerecht. Bitte erfassen Sie sie auch bei Ihren Ausgangsrechnungen.",
  vratene:
    "Sie haben die Rechnung mit einer Anmerkung zurückgegeben. Der Kunde korrigiert sie und sendet Ihnen eine neue zur Freigabe.",
  vasaPoznamka: "Ihre Anmerkung",
  nacitavam: "Rechnung wird geladen…",
  vyhotoveneCez: "Erstellt mit",
  predmet: (d, c, o) => `${d} ${c} zur Freigabe — ausgestellt von ${o}`,
  pozdrav: "Guten Tag,",
  mailTelo: (d, c, s, op) =>
    `gemäß unserer Gutschriftvereinbarung haben wir in Ihrem Namen ${d} ${c} über ${s} ausgestellt${op ? ` (Berichtigung zu Rechnung ${op})` : ""}. Sie finden sie im Anhang.`,
  mailProsba: "Die Rechnung ist Ihre und Sie sind für die Umsatzsteuer verantwortlich — bitte bestätigen Sie sie.",
  mailAkNesedi: "Falls etwas nicht stimmt, geben Sie sie auf derselben Seite mit einer Anmerkung zurück und wir korrigieren sie.",
  mailOtvorit: "Oder sehen Sie sie zuerst an:",
  mailOdkaz: "Rechnung online öffnen",
};

const HU: TextyDodavatela = {
  faktura: "Számla",
  dobropis: "Helyesbítő számla",
  naOdsuhlasenie: "jóváhagyásra",
  vyhotovenieOdberatelom: "önszámlázás",
  uvod: (o) =>
    `${o} az önszámlázási megállapodás alapján az Ön nevében kiállította ezt a számlát. A számla az Öné, az adóért Ön felel — kérjük, ellenőrizze és hagyja jóvá.`,
  opravuje: (c) => `Helyesbíti a(z) ${c} számlát`,
  ico: "Cégjegyzékszám",
  dic: "Adószám",
  icDph: "Közösségi adószám",
  dodavatelVy: "Szállító (Ön)",
  odberatel: "Vevő",
  neplatitel: "Nem ÁFA-alany",
  vyhotovena: "Kiállítva",
  dodanie: "Teljesítés",
  splatnost: "Esedékes",
  naUcet: "Számlára",
  vs: "Közlemény",
  polozka: "Tétel",
  mnozstvo: "Mennyiség",
  cenaBezDph: "Nettó ár",
  dph: "ÁFA",
  spoluBezDph: "Nettó összesen",
  zaklad: "Nettó",
  spolu: "Összesen",
  prenesenie: "Fordított adózás — az adót a vevő fizeti meg.",
  stiahnutPdf: "PDF letöltése",
  otazka: "Jóváhagyja a számlát?",
  suhlasim: "Jóváhagyom a számlát",
  nesuhlasim: "Nem hagyom jóvá",
  coNesedi: "Mi nem stimmel a számlán?",
  vratit: "Visszaküldés javításra",
  spat: "Vissza",
  odsuhlasene:
    "Jóváhagyta a számlát. A vevő értesítést kapott, és határidőben kifizeti. Kérjük, rögzítse a kiállított számlái között.",
  vratene: "Megjegyzéssel visszaküldte a számlát. A vevő kijavítja, és újat küld jóváhagyásra.",
  vasaPoznamka: "Az Ön megjegyzése",
  nacitavam: "Számla betöltése…",
  vyhotoveneCez: "Kiállítva:",
  predmet: (d, c, o) => `${d} ${c} jóváhagyásra — kiállította: ${o}`,
  pozdrav: "Jó napot!",
  mailTelo: (d, c, s, op) =>
    `Az önszámlázási megállapodás alapján az Ön nevében kiállítottuk a(z) ${c} ${d.toLowerCase()} (${s})${op ? `, amely a(z) ${op} számlát helyesbíti` : ""}. Mellékelve találja.`,
  mailProsba: "A számla az Öné, az adóért Ön felel — kérjük, hagyja jóvá.",
  mailAkNesedi: "Ha valami nem stimmel, ugyanazon az oldalon megjegyzéssel visszaküldheti, és kijavítjuk.",
  mailOtvorit: "Vagy előbb nézze meg:",
  mailOdkaz: "számla megnyitása online",
};

const SLOVNIKY: Record<JazykDokladu, TextyDodavatela> = { sk: SK, cs: CS, en: EN, de: DE, hu: HU };

export function textyDodavatela(jazyk: string | null | undefined): TextyDodavatela {
  return SLOVNIKY[(jazyk ?? "sk") as JazykDokladu] ?? SK;
}

/** Locale na sumy a dátumy v jazyku dodávateľa. */
export function localeDodavatela(jazyk: string | null | undefined): string {
  return (
    { sk: "sk-SK", cs: "cs-CZ", en: "en-GB", de: "de-DE", hu: "hu-HU" } as Record<string, string>
  )[jazyk ?? "sk"] ?? "sk-SK";
}
