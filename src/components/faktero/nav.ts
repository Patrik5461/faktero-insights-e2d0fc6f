import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  Car,
  FileSpreadsheet,
  FileText,
  HardHat,
  IdCard,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Menu,
  Receipt,
  Route,
  Send,
  Users,
  Warehouse,
} from "lucide-react";
import { oblastPodlaCesty, vidiOblast } from "@/lib/faktero/opravnenia";
import type { ActiveProduct } from "@/lib/faktero/active-product";
import type { KrajinaDane } from "@/lib/faktero/vat-rates";
import { nedostupneAgendy } from "@/lib/faktero/agendy-krajiny";

/**
 * Obsah bočnej lišty.
 *
 * Nie je to súčasť `AppShell.tsx` preto, aby sa dal otestovať bez celého
 * rozhrania: v menu sa už dvakrát objavila položka, ktorá ticho nefungovala —
 * raz s parametrom napísaným do `to`, raz so skupinou, ktorej chýbal kľúč
 * v `INVOICING_KEYS`. Oboje odhalí test nad týmito dátami.
 */

export /** `companyAdminOnly`: skryté pre bežných členov firmy — server tie dáta owner/adminovi
 *  vydá a členovi nie, takže položka by im aj tak skončila chybou. */
type NavChild = {
  to: string;
  /** Parametre adresy. Musia ísť zvlášť — router ich z reťazca v `to` neprečíta. */
  search?: Record<string, string>;
  label: string;
  companyAdminOnly?: boolean;
};
export type NavGroup = {
  key: string;
  label: string;
  icon: LucideIcon;
  match: string[]; // route prefixes
  children: NavChild[];
  exact?: boolean;
};

export const NAV: NavGroup[] = [
  { key: "prehlad", label: "Prehľad", icon: LayoutDashboard, match: ["/dashboard"], children: [] },
  /* Čo čaká práve na mňa: schválenie, označenie v komentári, nespracované
     doklady. Hneď pod Prehľadom, s počtom — inak by sa o úlohe človek
     dozvedel len zo zvončeka. */
  {
    key: "moje-ulohy",
    label: "Moje úlohy",
    icon: ListChecks,
    match: ["/moje-ulohy"],
    children: [],
  },
  {
    key: "fakturacia",
    label: "Fakturácia",
    icon: FileText,
    match: [
      "/faktury",
      "/ponuky",
      "/opakovane",
      "/prijate-faktury",
      "/prijate-zalohove",
      "/zalohove",
      "/faktury/skener",
      "/objednavky",
    ],
    children: [
      /*
        Novú faktúru, rýchlu faktúru aj novú objednávku otvára tlačidlo na
        príslušnom zozname a rýchle „Vytvoriť“ v hlavičke. V menu ostávajú len
        agendy, nie akcie — inak tá istá vec visí na troch miestach.
      */
      { to: "/faktury", search: { type: "vydane" }, label: "Vydané faktúry" },
      { to: "/faktury", search: { type: "danove" }, label: "Daňové doklady" },
      { to: "/zalohove", label: "Zálohové faktúry" },
      { to: "/prijate-faktury", label: "Prijaté faktúry" },
      { to: "/prijate-zalohove", label: "Prijaté zálohové faktúry" },
      { to: "/ponuky", label: "Cenové ponuky" },
      { to: "/objednavky", label: "Objednávky" },
      { to: "/opakovane", label: "Opakované faktúry" },
      { to: "/faktury", search: { type: "credit" }, label: "Dobropisy" },
      { to: "/faktury", search: { status: "draft" }, label: "Koncepty" },
      { to: "/faktury/skener", label: "Skener dokladov" },
    ],
  },
  {
    key: "efaktura",
    label: "eFaktúra",
    /*
      Vlastná skupina: eFaktúra je samostatná agenda so svojím prehľadom,
      odoslanými, prijatými aj doručenkami — pod Dokladmi sa strácala medzi
      bločkami. Celá je len pre slovenské firmy (LEN_SK), takže českej firme
      sa vyprázdni a zo lišty vypadne.
    */
    icon: Send,
    match: ["/efaktura"],
    children: [
      { to: "/efaktura", label: "Prehľad eFaktúry" },
      { to: "/efaktura/odoslane", label: "Odoslané eFaktúry" },
      { to: "/efaktura/prijate", label: "Prijaté eFaktúry" },
      { to: "/efaktura/dorucenia", label: "Doručenia eFaktúr" },
      { to: "/efaktura/kontrola", label: "Kontrola e-faktúry" },
    ],
  },
  {
    key: "doklady",
    label: "Doklady",
    /*
      Ikona sa v jednom pohľade nesmie opakovať — inak sa lišta číta len podľa
      textu a v zúženom stave, kde ostanú samotné ikony, sa dve skupiny nedajú
      rozoznať vôbec. Doklady majú bloček, rovnako ako v mobilnej appke.
    */
    icon: Receipt,
    match: ["/doklady", "/ostatne-doklady", "/schvalovanie", "/nespracovane", "/kos"],
    /*
      Sekcie ako v Doklado: všetko nahraté a z e-mailu čaká najprv
      v Nespracovaných a po spracovaní sa presunie do Bločkov, Prijatých
      faktúr alebo Ostatných (iných) dokladov. Faktúry sú aj vo Fakturácii.
    */
    children: [
      { to: "/nespracovane", label: "Nespracované doklady" },
      { to: "/doklady", label: "Bločky" },
      { to: "/prijate-faktury", label: "Prijaté faktúry" },
      { to: "/faktury", label: "Vystavené faktúry" },
      { to: "/ostatne-doklady", label: "Iné doklady" },
      { to: "/doklady/vyuctovania", label: "Vyúčtovanie výdavkov" },
      { to: "/kos", label: "Kôš" },
      { to: "/schvalovanie", label: "Na schválenie" },
      { to: "/doklady/mailom", label: "Doklady e-mailom" },
      { to: "/doklady/novy", label: "Nový doklad (foto/QR/upload)" },
    ],
  },
  {
    key: "kontakty",
    label: "Kontakty",
    icon: Users,
    match: ["/odberatelia", "/dodavatelia"],
    children: [
      { to: "/odberatelia", label: "Odberatelia" },
      { to: "/odberatelia", search: { new: "1" }, label: "Nový odberateľ" },
      { to: "/dodavatelia", label: "Dodávatelia" },
      { to: "/dodavatelia", search: { new: "1" }, label: "Nový dodávateľ" },
    ],
  },
  {
    key: "zakazky",
    label: "Zákazky",
    icon: HardHat,
    match: ["/zakazky"],
    children: [
      { to: "/zakazky", label: "Prehľad zákaziek" },
      { to: "/zakazky/nova", label: "Nová zákazka" },
    ],
  },
  {
    /* Personalistika bez miezd. Samostatná položka, ktorú firma vidí, len keď
       má modul zapnutý — pozri `filterNav`. */
    key: "zamestnanci",
    label: "Zamestnanci",
    icon: IdCard,
    match: ["/zamestnanci"],
    children: [
      { to: "/zamestnanci", label: "Prehľad zamestnancov" },
      { to: "/zamestnanci/novy", label: "Nový zamestnanec" },
      { to: "/zamestnanci/sablony", label: "Šablóny dokumentov" },
      { to: "/zamestnanci/export", label: "Export dochádzky" },
    ],
  },
  {
    /* Vozidlá firmy s technickým preukazom, vlastníctvom a termínmi. Tie isté
       vozidlá ako v Knihe jázd, jazdy sa tu však neukazujú. */
    key: "vozovy-park",
    label: "Vozový park",
    icon: Car,
    match: ["/vozovy-park"],
    children: [
      { to: "/vozovy-park", label: "Prehľad vozidiel" },
      { to: "/vozovy-park/nove", label: "Nové vozidlo" },
    ],
  },
  {
    key: "sklad",
    label: "Sklad",
    icon: Warehouse,
    match: ["/sklad", "/produkty", "/ceny"],
    children: [
      { to: "/sklad", label: "Prehľad" },
      { to: "/produkty", label: "Produkty a služby" },
      { to: "/ceny", label: "Cenník a zľavy" },
      { to: "/ceny/akcie", label: "Cenové akcie" },
      { to: "/sklad/produkty", label: "Skladové položky" },
      { to: "/sklad/kategorie", label: "Kategórie" },
      { to: "/sklad/pohyby", label: "Pohyby" },
      { to: "/sklad/objednavky", label: "Objednávky u dodávateľov" },
      { to: "/sklad/minimum", label: "Pod minimom" },
      { to: "/sklad/inventura", label: "Inventúra" },
    ],
  },
  {
    key: "banka",
    label: "Banka",
    icon: Landmark,
    match: ["/bankove-ucty", "/financovanie"],
    children: [
      { to: "/bankove-ucty", label: "Bankové účty" },
      { to: "/bankove-ucty/transakcie", label: "Bankové transakcie" },
      { to: "/bankove-ucty/vypisy", label: "Bankové výpisy" },
      { to: "/financovanie", label: "Leasingy a úvery" },
      { to: "/financovanie/nova", label: "Nová zmluva o financovaní" },
      { to: "/bankove-ucty/pripojit", label: "Pripojiť banku" },
    ],
  },
  {
    key: "uctovnictvo",
    label: "Účtovníctvo",
    icon: FileSpreadsheet,
    match: ["/pokladna", "/exporty", "/importy", "/uctovnictvo"],
    children: [
      { to: "/pokladna", label: "Pokladňa" },
      { to: "/uctovnictvo/dph", label: "DPH prehľad" },
      { to: "/uctovnictvo/vykazy", label: "Výkazy k DPH (priznanie, KV, SV)" },
      { to: "/uctovnictvo/oss", label: "OSS — predaj do EÚ" },
      { to: "/uctovnictvo/uzavierka", label: "Uzávierka" },
      { to: "/exporty", label: "Účtovné exporty" },
      { to: "/exporty", search: { tab: "history" }, label: "História exportov" },
      /* Jedna položka na všetky programy — odkiaľ sa importuje, si človek
         vyberie na stránke, rovnako ako formát pri exportoch. */
      { to: "/importy/novy", label: "Účtovné importy" },
      { to: "/importy", label: "História importov" },
      { to: "/uctovnictvo/pohoda", label: "Prepojenie s Pohodou" },
      { to: "/uctovnictvo/vypis-do-pohody", label: "Bankový výpis do Pohody" },
      {
        to: "/uctovnictvo/vypis-do-pohody",
        search: { zdroj: "brana" },
        label: "Výpis z platobnej brány",
      },
      { to: "/uctovnictvo/konvertor", label: "Konvertor Excel → Pohoda" },
      { to: "/uctovnictvo/predkontacie", label: "Predkontácie a členenie DPH" },
      { to: "/uctovnictvo/na-kontrolu", label: "Zaúčtovanie na kontrolu" },
      { to: "/uctovnictvo/pravidla", label: "Pravidlá účtovania" },
    ],
  },
  {
    key: "logbook-prehlad",
    label: "Prehľad",
    icon: LayoutDashboard,
    match: ["/jazdy/prehlad"],
    children: [],
  },
  {
    key: "jazdy",
    label: "Jazdy",
    /* Jazda je trasa, vozidlo je auto. Dovtedy tu boli dve rovnaké autá pod
       sebou — tá istá chyba, akú mala Fakturácia s Dokladmi. */
    icon: Route,
    match: ["/jazdy", "/jazdy/nova", "/jazdy/export"],
    exact: true,
    children: [
      { to: "/jazdy", label: "Jazdy" },
      { to: "/jazdy/nova", label: "Nová jazda" },
      { to: "/jazdy/export", label: "Export" },
    ],
  },
  {
    key: "vozidla",
    label: "Vozidlá",
    icon: Car,
    match: ["/jazdy/vozidla"],
    children: [{ to: "/jazdy/vozidla", label: "Vozidlá a tankovanie" }],
  },
  {
    key: "integracie",
    label: "Integrácie",
    icon: ArrowRightLeft,
    match: ["/jazdy/integracie"],
    children: [
      { to: "/jazdy/integracie", label: "Prehľad integrácií" },
      { to: "/jazdy/integracie/commander", label: "Commander GPS" },
      { to: "/jazdy/integracie/tesla", label: "Tesla Fleet API" },
    ],
  },
  {
    key: "viac",
    label: "Viac",
    icon: Menu,
    match: ["/ai-asistent", "/firmy", "/predplatne", "/diagnostika", "/podpora"],
    children: [
      { to: "/podpora", label: "Pomoc a podpora" },
      { to: "/ai-asistent", label: "Faktero AI" },
      { to: "/firmy", label: "Správa firiem" },
      { to: "/predplatne", label: "Predplatné" },
      { to: "/diagnostika", label: "Diagnostika", companyAdminOnly: true },
    ],
  },
];

/** API a Nastavenia sa presunuli z hlavnej lišty do menu pod avatarom. */
export const ACCOUNT_API_LINKS: NavChild[] = [
  { to: "/api-kluce", label: "API kľúče" },
  { to: "/api-dokumentacia", label: "API dokumentácia" },
  { to: "/api-playground", label: "API playground" },
  { to: "/webhooky", label: "Webhooky" },
  { to: "/webhooky-logy", label: "Webhook delivery logy" },
  { to: "/pomoc/woocommerce", label: "Doplnok pre WooCommerce" },
];

export const ACCOUNT_SETTINGS_LINKS: NavChild[] = [
  { to: "/firma", label: "Firma" },
  { to: "/ciselne-rady", label: "Číselné rady" },
  { to: "/nastavenia/schvalovanie", label: "Schvaľovanie dokladov" },
  { to: "/nastavenia/vzhlad-faktury", label: "Vzhľad faktúry" },
  { to: "/nastavenia/email-sablony", label: "E-mailové šablóny" },
  { to: "/nastavenia/poznamky", label: "Preddefinované poznámky" },
  { to: "/nastavenia/zalohy", label: "Zálohy dokladov" },
  { to: "/nastavenia/eshop", label: "E-shop a doprava" },
  { to: "/nastavenia/zabezpecenie", label: "Zabezpečenie účtu" },
  { to: "/nastavenia/prihlasit-appku", label: "Prihlásiť appku v telefóne" },
  { to: "/nastavenia", label: "Nastavenia systému" },
];

/**
 * Ktorá položka podmenu je práve otvorená. Rozhoduje aj podľa parametrov,
 * inak by na `/faktury?status=draft` svietili Faktúry aj Koncepty naraz.
 * Vracia kľúč položky, nie index — kľúče sú rovnaké ako pri vykresľovaní.
 */
export function activeChildKey(
  children: NavChild[],
  pathname: string,
  search: Record<string, unknown>,
): string | null {
  const hit = children.find(
    (c) =>
      c.to === pathname &&
      c.search &&
      Object.entries(c.search).every(([k, v]) => String(search[k] ?? "") === v),
  );
  if (hit) return hit.to + hit.label;
  const plain = children.find((c) => c.to === pathname && !c.search);
  return plain ? plain.to + plain.label : null;
}

export const QUICK_CREATE = [
  { to: "/faktury/nova", label: "Nová faktúra" },
  // Krátka cesta: odberateľ, suma, popis. Bez nej sa na ňu dalo dostať len
  // napísaním adresy, takže o nej nikto nevedel.
  { to: "/faktury/rychla", label: "Rýchla faktúra" },
  { to: "/ponuky/nova", label: "Nová cenová ponuka" },
  // Faktúra za dodávateľa (§ 72 ods. 4). Eviduje sa medzi prijatými, ale
  // vystavuje ju človek sám — hľadá ju preto pri vystavovaní, nie pri nákupoch.
  { to: "/prijate-faktury/samofaktura", label: "Nová samofaktúra" },
  { to: "/odberatelia", search: { new: "1" }, label: "Nový odberateľ" },
  { to: "/produkty", search: { new: "1" }, label: "Nový produkt" },
  { to: "/opakovane/nova", label: "Nová opakovaná faktúra" },
];

/** Kľúč, ktorý tu chýba, sa z lišty vytratí aj keď má skupina položky aj trasy —
 *  `filterNav` púšťa ďalej len to, čo je v jednej z týchto dvoch množín. */
export const INVOICING_KEYS = new Set([
  "prehlad",
  "moje-ulohy",
  "fakturacia",
  "efaktura",
  "doklady",
  "kontakty",
  "zakazky",
  "zamestnanci",
  "vozovy-park",
  "sklad",
  "banka",
  "uctovnictvo",
]);
export const LOGBOOK_KEYS = new Set(["logbook-prehlad", "jazdy", "vozidla", "integracie"]);

export type ProductMode = "invoicing" | "logbook" | "both";

/*
  Položky viazané na slovenský štát. eKasa je slovenská evidencia tržieb (v
  Česku EET zrušili) a eFaktúra ide cez slovenskú Peppol schému — českej firme
  by ani jedno nefungovalo. Ponúkať jej ich by bola pasca: klikla by a narazila.
*/
const LEN_SK = ["/pokladna", "/efaktura"];

// Agendy, ktoré nemecká firma nedostane — zdieľané s nástenkou, zvončekom a e-mailom.
export { NIE_PRE_DE, nedostupneAgendy, agendaPreKrajinu } from "@/lib/faktero/agendy-krajiny";

export function filterNav(
  view: ActiveProduct,
  isCompanyAdmin: boolean,
  krajina: KrajinaDane = "SK",
  modulZamestnanci = false,
  rola: string | null = null,
  opravnenia: unknown = null,
): NavGroup[] {
  const allowed = view === "invoicing" ? INVOICING_KEYS : LOGBOOK_KEYS;
  // "viac" je spoločné pre oba produkty a vždy ide na koniec lišty
  return (
    NAV.filter((g) => allowed.has(g.key) || g.key === "viac")
      // Zamestnanci majú všetky firmy (predvolene zapnuté); vypnúť sa dá cez companies.module_employees.
      .filter((g) => g.key !== "zamestnanci" || modulZamestnanci)
      .map((g) =>
        isCompanyAdmin ? g : { ...g, children: g.children.filter((c) => !c.companyAdminOnly) },
      )
      .map((g) =>
        krajina === "SK"
          ? g
          : {
              ...g,
              children: g.children
                .filter((c) => !LEN_SK.some((x) => String(c.to).startsWith(x)))
                // Česká firma podáva přiznání a kontrolní hlášení, nie KV a SV.
                .map((c) =>
                  c.to === "/uctovnictvo/vykazy"
                    ? { ...c, label: "Výkazy k DPH (přiznání, kontrolní hlášení)" }
                    : c,
                ),
            },
      )
      // Nemecká firma: bez pokladne, knihy jázd a zamestnancov (slovenské predpisy).
      .map((g) =>
        krajina === "DE"
          ? {
              ...g,
              children: g.children.filter((c) => !nedostupneAgendy(String(c.to), krajina)),
            }
          : g,
      )
      // Vlastný prístup: položky oblastí bez práva sa skryjú (databáza by aj tak nevydala nič).
      .map((g) =>
        rola === "custom"
          ? {
              ...g,
              children: g.children.filter((c) => {
                const o = oblastPodlaCesty(String(c.to));
                return !o || vidiOblast(rola, opravnenia, o);
              }),
            }
          : g,
      )
      // Skupina bez položiek zmizne — okrem Moje úlohy, ktoré sú samy odkazom.
      .filter((g) => g.children.length > 0 || g.key === "moje-ulohy")
  );
}

/**
 * Ktorý manuál patrí ku ktorej agende. Tlačidlo „Manuál" v hlavičke stránky
 * sa riadi najdlhšou zhodou, takže podstránka môže mať vlastný manuál
 * (`/faktury/parovanie` → banka) bez toho, aby rozbila rodiča.
 */
export const MANUALY: { prefix: string; to: string }[] = [
  { prefix: "/nastavenia", to: "/pomoc/nastavenia" },
  { prefix: "/firma", to: "/pomoc/nastavenia" },
  // Párovanie platieb je bližšie k banke než k vystavovaniu faktúr.
  { prefix: "/faktury/parovanie", to: "/pomoc/banka" },
  { prefix: "/faktury", to: "/pomoc/faktury" },
  { prefix: "/zalohove", to: "/pomoc/faktury" },
  { prefix: "/ponuky", to: "/pomoc/ponuky" },
  { prefix: "/objednavky", to: "/pomoc/objednavky" },
  { prefix: "/opakovane", to: "/pomoc/opakovane" },
  { prefix: "/prijate-faktury", to: "/pomoc/prijate-faktury" },
  { prefix: "/doklady", to: "/pomoc/doklady" },
  // Moje úlohy sú opísané pri schvaľovaní v manuáli dokladov.
  { prefix: "/moje-ulohy", to: "/pomoc/doklady" },
  { prefix: "/ostatne-doklady", to: "/pomoc/doklady" },
  { prefix: "/pokladna", to: "/pomoc/pokladna" },
  { prefix: "/efaktura", to: "/pomoc/efaktura" },
  { prefix: "/odberatelia", to: "/pomoc/odberatelia" },
  { prefix: "/zakazky", to: "/pomoc/zakazky" },
  { prefix: "/vozovy-park", to: "/pomoc/vozovy-park" },
  { prefix: "/sklad", to: "/pomoc/sklad" },
  { prefix: "/sklad/objednavky", to: "/pomoc/objednavky-dodavatel" },
  { prefix: "/produkty", to: "/pomoc/sklad" },
  { prefix: "/ceny", to: "/pomoc/ceny" },
  { prefix: "/uctovnictvo/vykazy", to: "/pomoc/vykazy-dph" },
  { prefix: "/uctovnictvo/oss", to: "/pomoc/oss" },
  { prefix: "/nastavenia/zabezpecenie", to: "/pomoc/zabezpecenie" },
  { prefix: "/nastavenia/zalohy", to: "/pomoc/zabezpecenie" },
  { prefix: "/nastavenia/prihlasit-appku", to: "/pomoc/apka" },
  { prefix: "/nastavenia/poznamky", to: "/pomoc/doklady" },
  { prefix: "/zamestnanci", to: "/pomoc/zamestnanci" },
  { prefix: "/uctovnictvo/dph", to: "/pomoc/dph" },
  { prefix: "/uctovnictvo/uzavierka", to: "/pomoc/uzavierka" },
  { prefix: "/uctovnictvo/pohoda", to: "/pomoc/pohoda" },
  { prefix: "/uctovnictvo/vypis-do-pohody", to: "/pomoc/pohoda" },
  { prefix: "/uctovnictvo/konvertor", to: "/pomoc/pohoda" },
  { prefix: "/uctovnictvo/pravidla", to: "/pomoc/automaticke-zauctovanie" },
  { prefix: "/uctovnictvo/na-kontrolu", to: "/pomoc/automaticke-zauctovanie" },
  { prefix: "/uctovnictvo/predkontacie", to: "/pomoc/pohoda" },
  { prefix: "/podpora", to: "/pomoc/podpora" },
  { prefix: "/exporty", to: "/pomoc/exporty" },
  { prefix: "/importy", to: "/pomoc/exporty" },
  { prefix: "/bankove-ucty", to: "/pomoc/banka" },
  { prefix: "/financovanie", to: "/pomoc/financovanie" },
  { prefix: "/jazdy", to: "/pomoc/jazdy" },
  { prefix: "/firmy", to: "/pomoc/role" },
  { prefix: "/api-kluce", to: "/pomoc/api" },
  { prefix: "/api-dokumentacia", to: "/pomoc/api" },
  { prefix: "/api-playground", to: "/pomoc/api" },
  { prefix: "/webhooky", to: "/pomoc/api" },
  // Zhoda je na presnú cestu alebo `predpona/`; `/webhooky-logy` preto pod
  // `/webhooky` nespadá a bez vlastného riadku by ostalo bez manuálu.
  { prefix: "/webhooky-logy", to: "/pomoc/api" },
  { prefix: "/predplatne", to: "/pomoc/predplatne" },
  { prefix: "/ai-asistent", to: "/pomoc/ai-asistent" },
];

export function manualPre(pathname: string): string | null {
  let najdlhsi: { prefix: string; to: string } | null = null;
  for (const m of MANUALY) {
    if (pathname === m.prefix || pathname.startsWith(m.prefix + "/")) {
      if (!najdlhsi || m.prefix.length > najdlhsi.prefix.length) najdlhsi = m;
    }
  }
  return najdlhsi?.to ?? null;
}
