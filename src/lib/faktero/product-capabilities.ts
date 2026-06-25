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
  "Rezervácie skladu",
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
      "GoPay online platby (platobné odkazy)",
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
    summary: "Trial a platené plány so správou cez GoPay.",
    features: [
      "14-dňový trial bez platobnej karty",
      "GoPay billing pre opakované platby",
      "Automatické obnovovanie predplatného",
      "Plány Free / Pro / Enterprise",
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
      "Exporty (CSV, XLSX, PDF)",
      "Mesačné reporty",
      "Filter podľa vozidla",
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
      "Import zo SuperFaktúry",
      "Automatická detekcia Excel / CSV",
      "Mapovanie polí",
    ],
    routes: ["/importy"],
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
  lines.push("Ak sa používateľ pýta na čokoľvek z tohto zoznamu, odpovedz presne: \"Zatiaľ nie je dostupné vo Faktere.\" Nepredstieraj, že funkcia existuje, neuvádzaj plán alebo dátum, ak ho nevieš s istotou.");
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
