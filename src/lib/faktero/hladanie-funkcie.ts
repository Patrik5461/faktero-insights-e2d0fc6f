/*
  Hľadanie funkcií a nastavení v hlavičke (⌘K) — „schvaľovanie“, „logo“,
  „bankový účet“, „export pohoda“, „pozvať“ ukáže stránku, nastavenie alebo
  akciu, kam sa dá rovno skočiť. Beží v prehliadači, bez servera, od 1 znaku.

  Stránky sa nepíšu ručne: berú sa z katalógu hlasového ovládania
  (`hlas-stranky.ts` — názvy z menu, trasy z `hlas-trasy.gen.ts`), takže nová
  stránka sa nájde sama. Ručne je tu len to, čo z trás nevyčítať:
  - `SLOVA` — slová, ktorými ľudia funkciu hľadajú („IBAN“ → Bankové účty),
  - `KOTVY` — časti stránky s kotvou (Firma → Používatelia a pozvánky),
  - `AKCIE` — rýchle akcie (Nová faktúra, Nahrať doklad, Pozvať používateľa).
  Manuály (/pomoc/*) dodá `pomoc-nadpisy.gen.ts` (titulky a nadpisy sekcií).

  Čo človek vidieť nesmie, sa vyradí tým istým pravidlom ako menu
  (`vidiPolozku`: správcovské položky, krajina, oblasti vlastného prístupu).
*/
import {
  ACCOUNT_API_LINKS,
  ACCOUNT_SETTINGS_LINKS,
  NAV,
  QUICK_CREATE,
  vidiPolozku,
  type KontextMenu,
  type NavChild,
} from "@/components/faktero/nav";
import { katalogStranok, nazovZCesty } from "./hlas-stranky";
import { TRASY_ADMINA, TRASY_APLIKACIE } from "./hlas-trasy.gen";
import { normalizuj } from "./hladanie-text";
import { NADPISY_POMOCI } from "./pomoc-nadpisy.gen";

export type DruhFunkcie = "stranka" | "nastavenie" | "akcia" | "pomoc" | "admin";

export type OdkazFunkcie = { to: string; search?: Record<string, string>; hash?: string };

export type Funkcia = {
  kluc: string;
  druh: DruhFunkcie;
  /** Slovenský názov — kľúč pre `t()`. */
  nazov: string;
  /** Cesta v menu nad názvom („Nastavenia“, „Pomoc › Faktúry“) — kľúče pre `t()`. */
  cesta: string[];
  odkaz: OdkazFunkcie;
  /** Slová, ktorými sa funkcia hľadá (okrem názvu). */
  slova: string[];
  /** Skupina bočnej lišty (pre ikonu). */
  skupinaNav: string | null;
  companyAdminOnly?: boolean;
};

/** Koľko funkcií a koľko článkov pomoci sa ukáže. */
export const NA_FUNKCIE = 6;
export const NA_POMOC = 3;

/* ---------- Ručné doplnky ---------- */

/** Stránky, ktoré sa v hľadaní neukazujú — presmerovania a technické trasy. */
export const VYRADENE = new Set([
  "/onboarding",
  // Staré adresy, ktoré len presmerujú (záložky inej stránky).
  "/importy",
  "/uctovnictvo/konvertor",
  "/uctovnictvo/vypis-do-pohody",
  "/uctovnictvo/pravidla",
  "/uctovnictvo/na-kontrolu",
]);

/**
 * Slová, ktorými ľudia funkciu hľadajú. Kľúč = kľúč stránky (cesta, prípadne
 * s `?param=hodnota`), kotvy (`/firma#bankove-ucty`) alebo akcie (`akcia:…`).
 * Diakritika ani veľké písmená nehrajú rolu.
 */
export const SLOVA: Record<string, string[]> = {
  // Nastavenia
  "/firma": [
    "nastavenia firmy",
    "údaje firmy",
    "sídlo",
    "adresa",
    "IČO",
    "DIČ",
    "IČ DPH",
    "platiteľ DPH",
    "obchodný register",
    "kontakt firmy",
    "e-mail firmy",
    "účtovný program",
  ],
  "/firma#bankove-ucty": ["IBAN", "účet", "účty", "banka", "SWIFT", "BIC", "číslo účtu"],
  "/firma#upomienky": ["upomienka", "upomienky", "pripomienka", "splatnosť", "dlžník", "neuhradené"],
  "/firma#pouzivatelia": [
    "pozvať",
    "pozvánka",
    "pozvánky",
    "používateľ",
    "kolega",
    "účtovník",
    "účtovníčka",
    "rola",
    "role",
    "prístup",
    "práva",
    "tím",
  ],
  "/ciselne-rady": ["číslovanie", "rad", "prefix", "číslo faktúry", "formát čísla", "poradové číslo"],
  "/nastavenia/schvalovanie": ["schvaľovanie", "schválenie", "schvaľovať", "odsúhlasenie", "schvaľovateľ"],
  "/nastavenia/vzhlad-faktury": [
    "logo",
    "pečiatka",
    "podpis",
    "farba",
    "šablóna faktúry",
    "dizajn faktúry",
    "PDF",
    "pätička",
  ],
  "/nastavenia/email-sablony": ["e-mail", "email", "šablóna", "text e-mailu", "správa zákazníkovi"],
  "/nastavenia/odoslane-maily": ["odoslané", "e-maily", "história e-mailov", "doručenie"],
  "/nastavenia/poznamky": ["poznámka", "text na faktúre", "preddefinovaný text"],
  "/nastavenia/zalohy": ["záloha", "backup", "stiahnuť všetko", "archív"],
  "/nastavenia/eshop": ["e-shop", "eshop", "Shoptet", "WooCommerce", "Zásielkovňa", "doprava", "Packeta"],
  "/nastavenia/transeu": ["Trans.eu", "doprava", "preprava", "špedícia"],
  "/nastavenia/zabezpecenie": [
    "heslo",
    "zmena hesla",
    "dvojfaktor",
    "dvojfaktorové overenie",
    "2FA",
    "TOTP",
    "overovacia aplikácia",
    "bezpečnosť",
    "zrušiť účet",
  ],
  "/nastavenia/prihlasit-appku": ["mobil", "telefón", "aplikácia", "appka", "QR prihlásenie", "iPhone", "Android"],
  "/nastavenia": [
    "môj účet",
    "profil",
    "meno",
    "jazyk",
    "rozloženie",
    "kompaktné",
    "klasické",
    "denný súhrn",
    "upozornenia",
    "produkty",
  ],
  "/nastavenia/online-platby": ["platba kartou", "GoPay", "Stripe", "platobná brána", "online platba"],
  // API a prepojenia
  "/api-kluce": ["API", "kľúč", "token", "integrácia", "prepojenie"],
  "/api-dokumentacia": ["API", "dokumentácia", "vývojár", "REST"],
  "/webhooky": ["webhook", "notifikácia", "integrácia", "callback"],
  "/webhooky-logy": ["webhook", "logy", "doručenie"],
  "/pomoc/woocommerce": ["WooCommerce", "WordPress", "e-shop", "doplnok", "plugin"],
  // Fakturácia
  "/faktury?type=vydane": ["faktúry", "vystavené", "vydané", "odberateľské faktúry"],
  "/faktury/upomienky": ["upomienka", "upomienky", "pripomienka", "splatnosť", "dlžník"],
  "/faktury/parovanie": ["párovanie", "úhrady", "platby", "spárovať", "zaplatené"],
  "/faktury/skener": ["skener", "skenovať", "fotka", "rozpoznanie"],
  "/faktury?type=credit": ["dobropis", "opravná faktúra", "storno", "vrátenie"],
  "/faktury?status=draft": ["koncept", "rozpracované", "návrh"],
  "/zalohove": ["zálohová faktúra", "záloha", "proforma", "preddavok"],
  "/opakovane": ["pravidelná faktúra", "mesačná faktúra", "predplatné zákazníka", "automatická faktúra"],
  "/ponuky": ["ponuka", "cenová ponuka", "kalkulácia", "nabídka"],
  "/objednavky": ["objednávka", "prijatá objednávka"],
  "/prijate-faktury": ["dodávateľské faktúry", "náklady", "nákupné faktúry", "došlé faktúry"],
  "/prijate-faktury/samofaktura": ["samofakturácia", "faktúra za dodávateľa"],
  // eFaktúra
  "/efaktura": ["eFaktúra", "e-faktúra", "elektronická faktúra", "Peppol", "e-fakturácia 2027", "ePošták"],
  "/efaktura/odoslane": ["eFaktúra", "e-faktúra", "Peppol"],
  "/efaktura/prijate": ["eFaktúra", "e-faktúra", "Peppol"],
  "/efaktura/dorucenia": ["eFaktúra", "doručenka", "Peppol"],
  "/efaktura/kontrola": ["eFaktúra", "validácia", "overenie XML"],
  // Doklady
  "/nespracovane": ["nahraté doklady", "inbox", "na spracovanie", "doklady z e-mailu"],
  "/doklady": ["bloček", "pokladničný doklad", "eKasa", "účtenka"],
  "/doklady/mailom": ["e-mail", "preposlať", "adresa na doklady", "doklady mailom"],
  "/schvalovanie": ["schvaľovanie", "schválenie", "na schválenie", "odsúhlasenie"],
  "/ostatne-doklady": ["zmluva", "list", "exekúcia", "predpis", "iný doklad"],
  "/doklady/vyuctovania": ["vyúčtovanie", "výdavky", "cestovné", "náhrady"],
  "/kos": ["kôš", "zmazané", "obnoviť"],
  // Kontakty
  "/odberatelia": ["kontakty", "zákazník", "klient", "adresár", "odberateľ"],
  "/dodavatelia": ["kontakty", "dodávateľ", "adresár"],
  // Banka
  "/bankove-ucty": ["banka", "účet", "účty", "IBAN", "zostatok"],
  "/bankove-ucty/transakcie": ["pohyby", "platby", "transakcie", "banka", "úhrady"],
  "/bankove-ucty/vypisy": ["výpis", "výpisy", "camt", "bankový výpis"],
  "/bankove-ucty/pripojit": ["pripojiť banku", "Tatra banka", "SLSP", "VÚB", "ČSOB", "Fio", "Wise", "napojenie banky"],
  "/bankove-ucty/import": ["import výpisu", "nahrať výpis", "camt", "XML výpis"],
  "/bankove-ucty/notifikacie": ["notifikácie", "avízo", "e-mail z banky"],
  "/financovanie?druh=banka": ["úver", "kontokorent", "pôžička"],
  "/financovanie?druh=leasing": ["leasing", "lízing", "splátky"],
  // Účtovníctvo
  "/uctovnictvo/zauctovanie": ["automatické účtovanie", "autopilot", "zaúčtovanie", "pravidlá", "na kontrolu"],
  "/uctovnictvo/predkontacie": ["predkontácia", "predkontácie", "členenie DPH", "KV", "číselník", "účtovanie"],
  "/uctovnictvo/pohoda": ["Pohoda", "mostík", "most", "konektor", "prepojenie", "Stormware", "mServer"],
  "/uctovnictvo/pokladne": ["pokladňa", "pokladne", "číselník pokladní"],
  "/uctovnictvo/dph": ["DPH", "daň", "prehľad DPH"],
  "/uctovnictvo/vykazy": ["DPH priznanie", "kontrolný výkaz", "KV", "súhrnný výkaz", "SV", "XML pre finančnú správu"],
  "/uctovnictvo/oss": ["OSS", "EÚ", "spotrebiteľ", "VIES"],
  "/uctovnictvo/uzavierka": ["uzávierka", "uzamknutie", "zamknúť obdobie", "mesiac"],
  "/exporty": ["export", "Pohoda", "Omega", "Money", "ISDOC", "XML", "CSV", "pre účtovníka"],
  "/importy/novy": ["import", "prenos", "migrácia", "SuperFaktúra", "iDoklad", "Pohoda", "KROS", "Omega", "Money"],
  "/uctovnictvo/konvertory": ["konvertor", "prevod", "výpis do Pohody", "XML"],
  "/pokladna": ["pokladňa", "hotovosť", "eKasa", "príjmový doklad", "výdavkový doklad"],
  // Ostatné
  "/zakazky": ["zákazka", "projekt", "stavba"],
  "/zamestnanci": ["zamestnanec", "personalistika", "dochádzka", "HR"],
  "/vozovy-park": ["auto", "vozidlo", "flotila", "technický preukaz", "STK"],
  "/vozovy-park/palivove-karty": ["palivová karta", "tankovanie", "Shell", "OMV", "Slovnaft"],
  "/sklad": ["sklad", "zásoby", "inventár"],
  "/produkty": ["produkt", "služba", "tovar", "položka", "katalóg"],
  "/ceny": ["cenník", "zľava", "cena", "dohodnutá cena"],
  "/jazdy": ["kniha jázd", "jazda", "cesta", "km", "služobná cesta"],
  "/jazdy/vozidla": ["kniha jázd", "vozidlo", "tankovanie", "auto"],
  "/predplatne": ["predplatné", "plán", "tarifa", "platba za Faktero", "faktúra za Faktero", "cena Faktera", "zrušiť predplatné"],
  "/firmy": ["firmy", "pridať firmu", "nová firma", "prepnúť firmu", "viac firiem"],
  "/partner": [
    "partnerský program",
    "partner",
    "provízia",
    "provízie",
    "odporúčanie",
    "odkaz na odporúčanie",
    "účtovná kancelária",
    "účtovník",
  ],
  "/podpora": ["pomoc", "podpora", "nahlásiť chybu", "help desk", "otázka", "kontakt"],
  "/ai-asistent": ["AI", "asistent", "chat", "umelá inteligencia", "otázka"],
  "/diagnostika": ["diagnostika", "chyba", "test"],
  "/moje-ulohy": ["úlohy", "na mňa", "čaká", "schválenie"],
  "/dashboard": ["domov", "úvod", "nástenka", "prehľad"],
  // Akcie
  "akcia:nova-faktura": ["vystaviť faktúru", "nová faktúra", "fakturovať", "vytvoriť faktúru"],
  "akcia:rychla-faktura": ["rýchla faktúra", "vystaviť faktúru"],
  "akcia:nova-prijata": ["prijatá faktúra", "dodávateľská faktúra", "zadať faktúru", "náklad"],
  "akcia:nahrat-doklad": ["nahrať", "upload", "odfotiť", "bloček", "sken", "QR", "pridať doklad", "nový doklad"],
  "akcia:nova-ponuka": ["ponuka", "cenová ponuka", "kalkulácia"],
  "akcia:novy-kontakt": ["nový kontakt", "nový zákazník", "pridať odberateľa", "odberateľ", "klient"],
  "akcia:novy-dodavatel": ["nový kontakt", "pridať dodávateľa", "dodávateľ"],
  "akcia:novy-produkt": ["nový produkt", "pridať produkt", "služba", "tovar"],
  "akcia:export-pohoda": ["export", "Pohoda", "XML", "odovzdať účtovníkovi", "export pohoda"],
  "akcia:pozvat": ["pozvať", "pozvánka", "pridať používateľa", "účtovník", "kolega", "rola"],
};

/**
 * Časti stránok s kotvou — vyhľadajú sa ako samostatná funkcia. `id` musí
 * na stránke naozaj byť (firma.tsx, nastavenia.index.tsx).
 */
export const KOTVY: {
  kluc: string;
  to: string;
  hash: string;
  nazov: string;
  cesta: string[];
  companyAdminOnly?: boolean;
}[] = [
  {
    kluc: "/firma#bankove-ucty",
    to: "/firma",
    hash: "bankove-ucty",
    nazov: "Bankové účty firmy",
    cesta: ["Nastavenia", "Firma"],
  },
  {
    kluc: "/firma#upomienky",
    to: "/firma",
    hash: "upomienky",
    nazov: "Automatické upomienky po splatnosti",
    cesta: ["Nastavenia", "Firma"],
  },
  {
    kluc: "/firma#pouzivatelia",
    to: "/firma",
    hash: "pouzivatelia",
    nazov: "Používatelia a pozvánky",
    cesta: ["Nastavenia", "Firma"],
  },
  {
    kluc: "/nastavenia#rozlozenie",
    to: "/nastavenia",
    hash: "rozlozenie",
    nazov: "Rozloženie aplikácie",
    cesta: ["Nastavenia", "Nastavenia systému"],
  },
  {
    kluc: "/nastavenia#upozornenia",
    to: "/nastavenia",
    hash: "upozornenia",
    nazov: "E-mailové upozornenia",
    cesta: ["Nastavenia", "Nastavenia systému"],
  },
];
SLOVA["/nastavenia#rozlozenie"] = ["kompaktné", "klasické", "dizajn", "vzhľad aplikácie", "náhľad vľavo"];
SLOVA["/nastavenia#upozornenia"] = ["denný súhrn", "e-mail", "notifikácie", "upozornenie"];

/**
 * Rýchle akcie. `nahradi` = kľúč stránky, ktorá je tá istá vec — v zozname
 * ostane len akcia, nie obe.
 */
export const AKCIE: {
  kluc: string;
  nazov: string;
  to: string;
  search?: Record<string, string>;
  hash?: string;
  nahradi?: string;
  companyAdminOnly?: boolean;
}[] = [
  { kluc: "akcia:nova-faktura", nazov: "Nová faktúra", to: "/faktury/nova", nahradi: "/faktury/nova" },
  { kluc: "akcia:rychla-faktura", nazov: "Rýchla faktúra", to: "/faktury/rychla", nahradi: "/faktury/rychla" },
  {
    kluc: "akcia:nova-prijata",
    nazov: "Nová prijatá faktúra",
    to: "/prijate-faktury/nova",
    nahradi: "/prijate-faktury/nova",
  },
  { kluc: "akcia:nahrat-doklad", nazov: "Nahrať doklad", to: "/doklady/novy", nahradi: "/doklady/novy" },
  { kluc: "akcia:nova-ponuka", nazov: "Nová cenová ponuka", to: "/ponuky/nova", nahradi: "/ponuky/nova" },
  {
    kluc: "akcia:novy-kontakt",
    nazov: "Nový odberateľ",
    to: "/odberatelia",
    search: { new: "1" },
    nahradi: "/odberatelia?new=1",
  },
  {
    kluc: "akcia:novy-dodavatel",
    nazov: "Nový dodávateľ",
    to: "/dodavatelia",
    search: { new: "1" },
    nahradi: "/dodavatelia?new=1",
  },
  {
    kluc: "akcia:novy-produkt",
    nazov: "Nový produkt",
    to: "/produkty",
    search: { new: "1" },
    nahradi: "/produkty?new=1",
  },
  { kluc: "akcia:export-pohoda", nazov: "Export do Pohody", to: "/exporty" },
  {
    kluc: "akcia:pozvat",
    nazov: "Pozvať používateľa",
    to: "/firma",
    hash: "pouzivatelia",
    // Pozývať smie len správca firmy (TeamSection je ostatným len na čítanie).
    companyAdminOnly: true,
  },
];

/* ---------- Katalóg ---------- */

const SEKCIA_NASTAVENIA = "Nastavenia";
const SEKCIA_API = "API a prepojenia";

function klucOdkazu(to: string, search?: Record<string, string>): string {
  const q = search ? new URLSearchParams(search).toString() : "";
  return q ? `${to}?${q}` : to;
}

/** Skupina lišty, do ktorej cesta patrí (pre ikonu a cestu v menu). */
function skupinaPreCestu(to: string): { key: string; label: string } | null {
  for (const g of NAV) {
    if (g.children.some((c) => c.to === to)) return { key: g.key, label: g.label };
  }
  for (const g of NAV) {
    if (g.match.some((m) => to === m || to.startsWith(m + "/"))) return { key: g.key, label: g.label };
  }
  return null;
}

/** Správcovské položky menu (`companyAdminOnly`) podľa kľúča. */
function spravcovskeKluce(): Set<string> {
  const out = new Set<string>();
  const vsetky: NavChild[] = [
    ...NAV.flatMap((g) => g.children),
    ...ACCOUNT_SETTINGS_LINKS,
    ...ACCOUNT_API_LINKS,
    ...(QUICK_CREATE as NavChild[]),
  ];
  for (const c of vsetky) if (c.companyAdminOnly) out.add(klucOdkazu(c.to, c.search));
  return out;
}

/** Administrácia, ktorú `NAZVY_MIMO_MENU` nepomenúva (meno by bolo z adresy). */
const NAZVY_ADMIN: Record<string, string> = {
  "/admin/podpora/manualy": "Manuály podpory",
  "/admin/podpora/telegram-skupina": "Telegram skupina podpory",
};

function nazovAdmin(to: string, nazov: string): string {
  const n = NAZVY_ADMIN[to] ?? nazov.replace(/^Administrácia — /, "");
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** Celý katalóg — stránky, kotvy, akcie, admin a pomoc. Filtruje `funkciePreKontext`. */
export function katalogFunkcii(): Funkcia[] {
  const existuje = new Set<string>([...TRASY_APLIKACIE, ...TRASY_ADMINA]);
  const spravca = spravcovskeKluce();
  const nahradene = new Set(AKCIE.map((a) => a.nahradi).filter(Boolean));
  const out: Funkcia[] = [];

  const stranky = katalogStranok();
  for (const s of stranky) {
    if (s.detail || VYRADENE.has(s.to) || nahradene.has(s.kluc)) continue;
    if (s.admin) {
      out.push({
        kluc: s.kluc,
        druh: "admin",
        nazov: nazovAdmin(s.to, s.nazov),
        cesta: ["Administrácia"],
        odkaz: { to: s.to },
        slova: ["admin", "administrácia"],
        skupinaNav: null,
      });
      continue;
    }
    const nastavenie = s.sekcia === SEKCIA_NASTAVENIA || s.sekcia === SEKCIA_API ||
      s.to.startsWith("/nastavenia");
    // Meno len z adresy („financovanie › nova“), keď tú istú stránku menu
    // pozná pod ľudským menom s parametrom (Nový leasing, Nový úver).
    if (s.nazov === nazovZCesty(s.to) && stranky.some((x) => x !== s && x.to === s.to)) continue;
    const skup = skupinaPreCestu(s.to);
    const sekcia = s.to.startsWith("/jazdy")
      ? "Kniha jázd"
      : s.sekcia === "Vytvoriť"
        ? (skup?.label ?? null)
        : (s.sekcia ?? (nastavenie ? SEKCIA_NASTAVENIA : (skup?.label ?? null)));
    out.push({
      kluc: s.kluc,
      druh:
        s.sekcia === "Vytvoriť" || /^Nov[áýéo] /.test(s.nazov)
          ? "akcia"
          : nastavenie
            ? "nastavenie"
            : "stranka",
      nazov: s.nazov,
      // „Prehľad“ v sekcii „Prehľad“ by sa opakoval.
      cesta: sekcia && sekcia !== s.nazov ? [sekcia] : [],
      odkaz: { to: s.to, ...(s.search ? { search: s.search } : {}) },
      slova: SLOVA[s.kluc] ?? [],
      skupinaNav: nastavenie ? null : (skup?.key ?? null),
      ...(spravca.has(s.kluc) ? { companyAdminOnly: true } : {}),
    });
  }

  for (const k of KOTVY) {
    if (!existuje.has(k.to)) continue;
    out.push({
      kluc: k.kluc,
      druh: "nastavenie",
      nazov: k.nazov,
      cesta: k.cesta,
      odkaz: { to: k.to, hash: k.hash },
      slova: SLOVA[k.kluc] ?? [],
      skupinaNav: null,
      ...(k.companyAdminOnly ? { companyAdminOnly: true } : {}),
    });
  }

  for (const a of AKCIE) {
    if (!existuje.has(a.to)) continue;
    const skup = skupinaPreCestu(a.to);
    out.push({
      kluc: a.kluc,
      druh: "akcia",
      nazov: a.nazov,
      cesta: skup && skup.key !== "prehlad" ? [skup.label] : [SEKCIA_NASTAVENIA],
      odkaz: {
        to: a.to,
        ...(a.search ? { search: a.search } : {}),
        ...(a.hash ? { hash: a.hash } : {}),
      },
      slova: SLOVA[a.kluc] ?? [],
      skupinaNav: skup?.key ?? null,
      ...(a.companyAdminOnly || spravca.has(klucOdkazu(a.to, a.search))
        ? { companyAdminOnly: true }
        : {}),
    });
  }

  for (const c of NADPISY_POMOCI) {
    out.push({
      kluc: c.cesta,
      druh: "pomoc",
      nazov: c.titulok,
      cesta: ["Pomoc"],
      odkaz: { to: c.cesta },
      slova: ["manuál", "návod", "pomoc"],
      skupinaNav: null,
    });
    for (const s of c.sekcie) {
      out.push({
        kluc: `${c.cesta}#${s.id ?? s.nadpis}`,
        druh: "pomoc",
        nazov: s.nadpis,
        cesta: ["Pomoc", c.titulok],
        odkaz: { to: c.cesta, ...(s.id ? { hash: s.id } : {}) },
        slova: [],
        skupinaNav: null,
      });
    }
  }
  return out;
}

export type KontextFunkcii = KontextMenu & {
  /** Administrátor platformy (riadok v `platform_admins`) — vidí aj /admin. */
  adminPlatformy: boolean;
  /** Firma má zapnutý modul Zamestnanci. */
  modulZamestnanci: boolean;
  /** Používateľ má Knihu jázd (productMode „logbook“ alebo „both“). */
  knihaJazd: boolean;
};

let kes: Funkcia[] | null = null;

/** Funkcie, ktoré človek v aktívnej firme smie otvoriť — rovnaké pravidlá ako menu. */
export function funkciePreKontext(k: KontextFunkcii): Funkcia[] {
  kes ??= katalogFunkcii();
  return kes.filter((f) => {
    if (f.druh === "admin") return k.adminPlatformy;
    // Manuál pre nemecké firmy ostatným len zavadzia pri „upomienky“, „DPH“…
    if (f.druh === "pomoc") return !f.odkaz.to.startsWith("/pomoc/nemecko") || k.krajina === "DE";
    const to = f.odkaz.to;
    if (!k.modulZamestnanci && to.startsWith("/zamestnanci")) return false;
    if (!k.knihaJazd && to.startsWith("/jazdy")) return false;
    return vidiPolozku({ to, companyAdminOnly: f.companyAdminOnly }, k);
  });
}

/* ---------- Hľadanie ---------- */

function slovaTextu(s: string): string[] {
  return normalizuj(s).split(" ").filter(Boolean);
}

/** Rozdiel najviac o jedno písmeno (preklep) — Levenshtein ohraničený na 1. */
function preklep(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let rozdiel = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++rozdiel > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return rozdiel + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Ako dobre sa slovo dotazu zhoduje so slovom cieľa:
 * 3 = cieľ ním začína, alebo je to to isté slovo s inou koncovkou
 *     („faktura“ ~ „faktúry“, „upomienky“ ~ „upomienka“);
 * 2 = cieľ začína koreňom slova („pozvat“ ~ „pozvánky“);
 * 1 = preklep o jedno písmeno; 0 = nič.
 * Koreň a preklep až od 6 písmen — „novak“ (partner) nesmie nájsť „Nová faktúra“.
 */
function zhodaSlova(w: string, x: string): number {
  if (x.startsWith(w)) return 3;
  if (w.length >= 6) {
    const koren = w.slice(0, Math.max(5, w.length - 2));
    if (x.startsWith(koren)) return Math.abs(x.length - w.length) <= 2 ? 3 : 2;
    if (x.length >= 6 && (preklep(w, x) || preklep(w, x.slice(0, w.length)))) return 1;
  }
  return 0;
}

/** Najslabšia zo zhôd slov dotazu (každé slovo dotazu musí niekde sedieť). */
function zhodaVsetkych(dotaz: string[], ciel: string[]): number {
  let min = 3;
  for (const w of dotaz) {
    let naj = 0;
    for (const x of ciel) {
      naj = Math.max(naj, zhodaSlova(w, x));
      if (naj === 3) break;
    }
    if (!naj) return 0;
    min = Math.min(min, naj);
  }
  return min;
}

/**
 * Skóre funkcie pre dotaz (0 = nezhoduje sa). Poradie: presný názov >
 * názov začína dotazom > slová názvu > kľúčové slovo > zhoda koreňa > preklep.
 */
export function skoreFunkcie(f: Funkcia, dotaz: string, preloz?: (s: string) => string): number {
  const q = normalizuj(dotaz);
  if (!q) return 0;
  const w = q.split(" ");
  const nazvy = [f.nazov, ...(preloz ? [preloz(f.nazov)] : [])].map(normalizuj);
  let skore = 0;
  for (const n of nazvy) {
    if (n === q) skore = Math.max(skore, 100);
    else if (n.startsWith(q)) skore = Math.max(skore, 90);
    const zh = zhodaVsetkych(w, n.split(" "));
    if (zh === 3) skore = Math.max(skore, 80);
    else if (zh === 2) skore = Math.max(skore, 50);
    else if (zh === 1 && q.length >= 4) skore = Math.max(skore, 30);
  }
  if (skore >= 80) return skore;
  // Jeden znak hľadá len začiatky slov názvu — inak by „a“ našlo všetko.
  if (q.length < 2) return skore;
  const kw = f.slova.map(normalizuj);
  if (kw.includes(q)) skore = Math.max(skore, 70);
  else if (kw.some((k) => k.startsWith(q))) skore = Math.max(skore, 65);
  const vsetkySlova = [
    ...nazvy.flatMap((n) => n.split(" ")),
    ...kw.flatMap((k) => k.split(" ")),
    ...f.cesta.flatMap((c) => [...slovaTextu(c), ...(preloz ? slovaTextu(preloz(c)) : [])]),
  ];
  const zh = zhodaVsetkych(w, vsetkySlova);
  if (zh === 3) skore = Math.max(skore, 60);
  else if (zh === 2) skore = Math.max(skore, 45);
  return skore;
}

const PORADIE_DRUHU: Record<DruhFunkcie, number> = {
  akcia: 0,
  nastavenie: 0,
  stranka: 0,
  admin: 2,
  pomoc: 3,
};

export type VysledokFunkcii = { funkcie: Funkcia[]; pomoc: Funkcia[]; najlepsie: number };

/** Funkcie a články pomoci pre dotaz, zoradené podľa skóre. */
export function hladajFunkcie(
  funkcie: Funkcia[],
  dotaz: string,
  preloz?: (s: string) => string,
  max = { funkcie: NA_FUNKCIE, pomoc: NA_POMOC },
): VysledokFunkcii {
  const hodnotene = funkcie
    .map((f) => ({ f, s: skoreFunkcie(f, dotaz, preloz) }))
    .filter((x) => x.s > 0)
    .sort(
      (a, b) =>
        b.s - a.s ||
        PORADIE_DRUHU[a.f.druh] - PORADIE_DRUHU[b.f.druh] ||
        // Položka menu pred stránkou, ktorá v menu nie je; kratší názov skôr.
        Number(b.f.cesta.length > 0) - Number(a.f.cesta.length > 0) ||
        a.f.nazov.length - b.f.nazov.length,
    );
  const videne = new Set<string>();
  const unikatne = hodnotene.filter(({ f }) => {
    // Tá istá stránka pod dvoma menami (napr. z dvoch skupín menu) len raz.
    const k = `${f.druh === "pomoc" ? "p" : "f"}|${klucOdkazu(f.odkaz.to, f.odkaz.search)}#${f.odkaz.hash ?? ""}|${f.nazov}`;
    if (videne.has(k)) return false;
    videne.add(k);
    return true;
  });
  const fun = unikatne.filter((x) => x.f.druh !== "pomoc").slice(0, max.funkcie);
  const pom = unikatne.filter((x) => x.f.druh === "pomoc").slice(0, max.pomoc);
  return {
    funkcie: fun.map((x) => x.f),
    pomoc: pom.map((x) => x.f),
    najlepsie: fun[0]?.s ?? 0,
  };
}
