/**
 * Faktero Knowledge Base v1
 * Single source of truth for AI assistants (internal + public) describing
 * what modules Faktero currently supports. Update here when shipping new features.
 */

export type CapabilityModule = {
  key: string;
  name: string;
  summary: string;
  features: string[];
  routes?: string[];
};

export const FAKTERO_KB_VERSION = "Faktero Knowledge Base v1";

/** Features that are explicitly NOT supported yet. AI must say "Zatiaľ nie je dostupné". */
export const NOT_YET_SUPPORTED: string[] = [
  "Šarže a expirácie",
  "FIFO / LIFO oceňovanie",
  "Výroba / kusovníky",
  "Mzdy",
  "Plné podvojné účtovníctvo",
  "Peppol ostré odosielanie eFaktúr",
  "Dvojfaktorová autentifikácia (2FA)",
];

export const PRODUCT_CAPABILITIES: CapabilityModule[] = [
  {
    key: "invoicing",
    name: "Fakturácia",
    summary: "Vystavovanie faktúr, cenových ponúk a opakovaných faktúr s PDF a e-mailom.",
    features: [
      "Faktúry (vystavenie, úprava, storno, dobropisy)",
      "Cenové ponuky s konverziou na faktúru",
      "Opakované faktúry s automatickým vystavovaním",
      "Generovanie PDF",
      "Odosielanie faktúr e-mailom",
      "QR platby na faktúrach (PAY by square)",
    ],
    routes: ["/faktury", "/ponuky", "/opakovane"],
  },
  {
    key: "finstat",
    name: "FinStat / Register firiem",
    summary: "Automatické doplnenie údajov firmy podľa IČO alebo názvu.",
    features: [
      "Vyhľadanie firmy podľa IČO",
      "Vyhľadanie firmy podľa názvu",
      "Automatické doplnenie adresy, DIČ, IČ DPH",
    ],
  },
  {
    key: "subscription",
    name: "Predplatné",
    summary: "Skúšobná doba a platené plány so správou cez GoPay.",
    features: [
      "30 dní zdarma na pláne Premium, bez platobnej karty",
      "Plány Starter (9 €/mes), Premium (19 €/mes) a Enterprise (individuálne), ceny bez DPH",
      "GoPay billing pre opakované platby",
      "Automatické obnovovanie predplatného, zrušiteľné kedykoľvek",
      "Plány Kniha jázd (Mini, Pro) sa zatiaľ aktivujú na vyžiadanie, nie samoobslužne",
    ],
    routes: ["/predplatne", "/cennik"],
  },
  {
    key: "api",
    name: "API a webhooky",
    summary: "REST API a webhooky pre integrácie tretích strán.",
    features: [
      "Správa API kľúčov",
      "REST API pre faktúry, odberateľov, ponuky, sklad, jazdy a vozidlá",
      "Webhooky pre udalosti (vystavenie, úhrada, ...)",
      "Logy doručení webhookov",
    ],
    routes: ["/api-kluce", "/api-dokumentacia", "/webhooky"],
  },
  {
    key: "stock",
    name: "Sklad",
    summary: "Skladové hospodárstvo s automatickým odpočtom z faktúr.",
    features: [
      "Skladové karty / produkty",
      "Pohyby skladu",
      "Inventúra",
      "Príjem na sklad",
      "Výdaj zo skladu",
      "Automatický odpočet z faktúr",
      "Presuny medzi skladmi",
      "Dodacie listy",
      "Minimálne množstvá a upozornenia",
      "Kategórie a hodnota skladu (vážená nákupná cena)",
      "Rezervácie zásob na cenovej ponuke",
      "CSV export pohybov",
    ],
    routes: ["/sklad"],
  },
  {
    key: "trip-log",
    name: "Kniha jázd",
    summary: "Evidencia vozidiel, jázd a tankovaní s exportmi a mesačnými reportmi.",
    features: [
      "Evidencia vozidiel (ŠPZ, vodič, typ)",
      "Evidencia jázd (km, trvanie, priemerná rýchlosť)",
      "Tankovania (palivo, suma, km)",
      "Exporty (CSV, XLSX, PDF kniha jázd)",
      "Mesačné reporty",
      "Filter podľa vozidla",
      "Automatické rozpoznanie jazdy v mobilnej aplikácii",
      "Rozlíšenie služobnej a súkromnej jazdy",
      "Tesla Fleet API",
    ],
    routes: ["/jazdy", "/jazdy/prehlad", "/jazdy/vozidla", "/jazdy/export"],
  },
  {
    key: "commander",
    name: "Commander GPS",
    summary: "Natívna integrácia s Commander GPS pre automatický import jázd.",
    features: [
      "Prepojenie s Commander GPS účtom",
      "Synchronizácia vozidiel",
      "Import jázd do Knihy jázd",
      "Automatická denná synchronizácia",
      "Automatické vytváranie záznamov v Knihe jázd",
      "Detekcia duplicít",
    ],
    routes: ["/jazdy/integracie/commander"],
  },
  {
    key: "efaktura",
    name: "eFaktúra 2027",
    summary: "Pripravenosť na povinnú eFakturáciu (Peppol, EN16931).",
    features: [
      "Readiness dashboard",
      "EN16931 foundation (UBL)",
      "Peppol preparation",
      "XML generation",
      "Prijaté / odoslané eFaktúry",
      "Doručenia",
    ],
    routes: ["/efaktura"],
  },
  {
    key: "imports",
    name: "Importy",
    summary: "Migrácia dát z iných fakturačných systémov.",
    features: [
      "Import zo SuperFaktúry (ZIP s ISDOC)",
      "Import z Money S3, iDokladu, Omegy a KROSu",
      "Import z Pohody",
      "Automatická detekcia Excel / CSV / XML",
      "Mapovanie polí a kódovanie Windows-1250",
    ],
    routes: ["/importy"],
  },
  {
    key: "expenses",
    name: "Prijaté doklady a faktúry",
    summary: "Bločky, prijaté faktúry a ich párovanie s platbami.",
    features: [
      "Skenovanie pokladničných dokladov fotoaparátom",
      "Načítanie dokladu z eKasa QR kódu",
      "Príjem dokladov e-mailom na vlastnú adresu",
      "Prijaté faktúry s DPH a splatnosťou",
      "Párovanie dokladov s platbami z banky",
      "Prílohy k dokladom (PDF, foto)",
    ],
    routes: ["/doklady", "/doklady/novy", "/doklady/mailom", "/prijate-faktury"],
  },
  {
    key: "bank",
    name: "Banka a párovanie úhrad",
    summary: "Pohyby na účte, párovanie úhrad a bankové výpisy.",
    features: [
      "Priame napojenie na Tatra banku (Premium API)",
      "Wise cez API token",
      "Import výpisov pre ostatné banky",
      "Automatické párovanie podľa variabilného symbolu, sumy a protistrany",
      "Čiastočné úhrady",
      "Bankové zostatky (disponibilný zostatok, meny sa nesčítavajú)",
      "Vlastné výpisy camt.053 a PDF z natiahnutých transakcií",
    ],
    routes: [
      "/bankove-ucty",
      "/bankove-ucty/transakcie",
      "/bankove-ucty/vypisy",
      "/faktury/parovanie",
    ],
  },
  {
    key: "jobs",
    name: "Zákazky",
    summary: "Náklady a výnosy jednej zákazky na jednom mieste.",
    features: [
      "Faktúry, prijaté doklady a materiál zo skladu na zákazke",
      "Jazdy zvedené na zákazku",
      "Výnosy, náklady a marža",
      "Zálohová faktúra sa do výnosu nepočíta",
    ],
    routes: ["/zakazky"],
  },
  {
    key: "orders",
    name: "Objednávky",
    summary: "Prijaté objednávky od odberateľov a objednávky dodávateľom.",
    features: [
      "Prijaté objednávky s prevodom na faktúru",
      "Stav sa počíta z vyfakturovaného množstva; do faktúry ide len zvyšok",
      "Objednávky dodávateľom s príjmom na sklad",
    ],
    routes: ["/objednavky", "/sklad/objednavky"],
  },
  {
    key: "cash",
    name: "Pokladňa a eKasa",
    summary: "Pokladničná kniha a doklady z eKasy.",
    features: [
      "Pokladničná kniha (príjem, výdaj, zostatok)",
      "Doklady platené hotovosťou vstupujú do pokladne",
      "Načítanie bločku z eKasy podľa QR kódu",
    ],
    routes: ["/pokladna"],
  },
  {
    key: "accounting",
    name: "Účtovníctvo a uzávierka",
    summary: "DPH, uzamykanie období a odovzdanie účtovníčke.",
    features: [
      "Priznanie k DPH a kontrolný výkaz",
      "Sadzby DPH podľa krajiny firmy (SK 23/19/5/0, CZ 21/12/0)",
      "Uzamknutie účtovného obdobia",
      "Export do Pohody (XML) a konektor",
      "Bankový výpis do Pohody",
      "Mesačné podklady pre účtovníčku",
    ],
    routes: ["/uctovnictvo/dph", "/uctovnictvo/uzavierka", "/uctovnictvo/pohoda", "/exporty"],
  },
  {
    key: "financing",
    name: "Leasingy a úvery",
    summary: "Splátkový kalendár s rozpadom na istinu, úrok a DPH.",
    features: [
      "Leasing aj úver so splátkovým kalendárom",
      "Rozpad splátky na istinu, úrok a DPH",
      "Úrok podľa ACT/365 alebo 30/360",
      "Párovanie splátok s pohybmi na účte",
    ],
    routes: ["/financovanie"],
  },
  {
    key: "pricing",
    name: "Cenníky, zľavy a akcie",
    summary: "Ceny podľa odberateľa, množstva a akcií.",
    features: [
      "Dohodnutá cena pre odberateľa",
      "Zľava odberateľa",
      "Akciové ceny na obdobie",
      "Množstevné ceny",
      "Poradie: dohodnutá cena prebíja zľavu, akcia platí len keď je výhodnejšia",
    ],
    routes: ["/ceny", "/ceny/akcie"],
  },
  {
    key: "mobile",
    name: "Mobilná aplikácia",
    summary: "iPhone aplikácia na fakturáciu, doklady a knihu jázd. Pred vydaním v App Store.",
    features: [
      "Vystavenie a úprava faktúry v telefóne",
      "Skener dokladov a QR kódov",
      "Kniha jázd so štartom, stopom a automatickým rozpoznaním jazdy",
      "Banka a prijaté doklady",
      "Offline režim — čo sa nedá odoslať, počká v telefóne",
      "Odomknutie Face ID alebo odtlačkom",
      "Päť jazykov (SK, CZ, EN, DE, HU)",
    ],
  },
  {
    key: "team",
    name: "Firmy, role a prístupy",
    summary: "Viac firiem pod jedným účtom a pozvánky pre kolegov a účtovníčku.",
    features: [
      "Viac firiem pod jedným prihlásením",
      "Pozvánky e-mailom (odkaz platí 14 dní)",
      "Rola majiteľ a účtovník; účtovník nevidí banku ani kľúče",
      "Audit log (plán Premium a vyšší)",
      "Zrušenie účtu s 14-dňovým odkladom",
    ],
    routes: ["/firmy", "/firma", "/nastavenia"],
  },
  {
    key: "ai",
    name: "AI asistent",
    summary: "AI asistent pre rady k faktúram, neuhradeným pohľadávkam a workflow.",
    features: [
      "Konverzačný AI asistent s kontextom firmy",
      "Odporúčania (neuhradené, drafty, chýbajúce údaje)",
      "AI generovanie faktúr z popisu",
    ],
    routes: ["/ai-asistent"],
  },
];

/** Compact markdown string suitable for injecting into LLM system prompts. */
export function getProductCapabilitiesMarkdown(): string {
  const lines: string[] = [`# ${FAKTERO_KB_VERSION}`, ""];
  for (const m of PRODUCT_CAPABILITIES) {
    lines.push(`## ${m.name}`);
    lines.push(m.summary);
    for (const f of m.features) lines.push(`- ${f}`);
    if (m.routes?.length) lines.push(`Cesty: ${m.routes.join(", ")}`);
    lines.push("");
  }
  lines.push("## Zatiaľ NIE JE dostupné vo Faktere");
  lines.push(
    'Ak sa používateľ pýta na čokoľvek z tohto zoznamu, odpovedz presne: "Zatiaľ nie je dostupné vo Faktere." Nepredstieraj, že funkcia existuje, neuvádzaj plán alebo dátum, ak ho nevieš s istotou.',
  );
  for (const f of NOT_YET_SUPPORTED) lines.push(`- ${f}`);
  lines.push("");
  return lines.join("\n");
}

export function getProductCapabilities() {
  return {
    version: FAKTERO_KB_VERSION,
    modules: PRODUCT_CAPABILITIES,
    notYetSupported: NOT_YET_SUPPORTED,
  };
}
