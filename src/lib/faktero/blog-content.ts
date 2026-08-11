import { FileCheck2, MoveRight, Package2, Plug, type LucideIcon } from "lucide-react";
import type { ContentBlock } from "./marketing-content";
import type { Odtien } from "@/components/faktero/BlogCover";

/**
 * Články blogu.
 *
 * Boli tu dovtedy len štyri karty s nadpismi a poznámkou „Čoskoro k
 * dispozícii" — návštevník klikol na Blog v menu a našiel prázdno. Obsah je
 * preto priamo v kóde: nepotrebuje redakčný systém a ide von s nasadením.
 *
 * Písané je to podľa toho, čo Faktero naozaj vie. Sľubovať v článku funkciu,
 * ktorá v produkte nie je, je najdrahší spôsob, ako stratiť zákazníka.
 */

export type BlogPost = {
  slug: string;
  title: string;
  /** Dátum vydania v ISO tvare — zoznam sa podľa neho radí. */
  date: string;
  excerpt: string;
  /** Odhad času čítania v minútach. */
  minuty: number;
  /** Obálka sa kreslí v kóde — pozri `BlogCover`. */
  ikona: LucideIcon;
  odtien: Odtien;
  blocks: ContentBlock[];
};

export const POSTS: BlogPost[] = [
  {
    slug: "efaktura-2027-co-potrebujete-vediet",
    title: "eFaktúra 2027: čo musíte stihnúť pred 1.1.2027",
    date: "2026-05-12",
    minuty: 6,
    ikona: FileCheck2,
    odtien: "zelena",
    excerpt:
      "Od januára 2027 budú firmy v SR povinné posielať B2B faktúry štruktúrovane. Vysvetľujeme Peppol, Digitálneho poštára a čo to znamená pre vaše procesy.",
    blocks: [
      {
        type: "lead",
        text: "Od 1. januára 2027 nebude PDF poslané e-mailom platnou faktúrou medzi firmami. Nahradí ho eFaktúra — štruktúrovaný XML dokument podľa európskej normy EN 16931, ktorý si účtovný softvér príjemcu prečíta sám. Do konca roka 2026 teda treba mať vyriešené tri veci: čím faktúry vystavíte, ako ich doručíte a kde ich desať rokov uložíte.",
      },
      {
        type: "section",
        title: "Čo sa presne mení",
        body: "Dnes je faktúra dokument pre človeka — vytlačí sa, prepíše alebo naskenuje. Od roku 2027 je to dátová správa pre stroj. Rovnaké údaje (dodávateľ, odberateľ, položky, sadzby DPH, IBAN) idú v presne definovanej štruktúre, takže odberateľ ich zaúčtuje bez prepisovania a bez OCR. PDF nezmizne, ale prestane byť tým, o čo sa opiera odpočet DPH.",
      },
      {
        type: "section",
        title: "Koho sa to týka",
        body: "Každého platiteľa DPH na Slovensku pri obchode s inou firmou (B2B) a so štátom (B2G) — od živnostníka po korporáciu. Faktúry pre koncových spotrebiteľov ostávajú v pôvodnom režime. Ak fakturujete čo i len jednej firme, týka sa to aj vás.",
      },
      {
        type: "bullets",
        title: "Čo treba stihnúť do konca roka 2026",
        items: [
          "Mať softvér, ktorý vygeneruje validný XML podľa Peppol BIS 3.0 — ručne sa to spraviť nedá",
          "Vyriešiť doručovanie: Peppol Access Point alebo Digitálny poštár Finančnej správy",
          "Vedieť eFaktúry aj prijímať a spracovať — povinnosť platí na oboch stranách",
          "Zabezpečiť archiváciu 10 rokov v pôvodnom XML, nie v PDF",
          "Skontrolovať údaje odberateľov: bez správneho IČ DPH sa faktúra nedoručí",
        ],
      },
      {
        type: "section",
        title: "Najčastejší omyl",
        body: "„Veď faktúry posielam e-mailom, tak som elektronický.“ Nie ste. Elektronická faktúra v zmysle normy nie je PDF v prílohe — je to štruktúrovaný záznam. Rozdiel je v tom, že PDF vie prečítať človek, kým eFaktúru vie spracovať softvér bez toho, aby sa jej ktokoľvek dotkol.",
      },
      {
        type: "section",
        title: "Čo spraviť teraz, keď je ešte čas",
        body: "Po prvé, upratať adresár odberateľov — hlavne IČ DPH a e-mailové adresy, lebo práve na nich doručovanie stojí. Po druhé, zistiť si u dodávateľa softvéru, či a kedy eFaktúru podporí; keď odpoveď nepríde do konca roka, je čas hľadať inde. Po tretie, vyskúšať si to nanečisto — prvá ostrá eFaktúra v januári 2027 nie je dobré miesto na učenie.",
      },
      {
        type: "callout",
        title: "Ako je na tom Faktero",
        body: "Faktero generuje štruktúrované XML podľa Peppol BIS 3.0, vie ho odoslať aj prijať a odoslané eFaktúry vrátane stavu doručenia eviduje. Nemusíte teda meniť softvér tesne pred termínom — stačí, keď sa v januári prepne režim.",
      },
    ],
  },
  {
    slug: "prechod-do-faktera-bez-straty-historie",
    title: "Ako prejsť do Faktera bez straty histórie",
    date: "2026-04-22",
    minuty: 5,
    ikona: MoveRight,
    odtien: "modra",
    excerpt:
      "Prenos odberateľov a faktúr z doterajšieho systému, zachovanie číselných radov a kontrola otvorených pohľadávok — krok za krokom.",
    blocks: [
      {
        type: "lead",
        text: "Najväčšia obava pri zmene fakturačného systému nie je cena ani ovládanie, ale história. Kam sa podejú faktúry z minulého roka, číselné rady a adresár, ktorý ste roky budovali? Odpoveď je, že nikam — dajú sa preniesť a trvá to približne štvrťhodinu.",
      },
      {
        type: "section",
        title: "Kedy má prechod zmysel",
        body: "Väčšina fakturačných programov robí to isté dobre — faktúru vystaví každý. Prechod má zmysel vtedy, keď vám niečo konkrétne chýba: napojenie na banku, sklad prepojený s faktúrami, kniha jázd alebo pripravenosť na eFaktúru 2027. Ak vám doterajší nástroj stačí, pokojne pri ňom ostaňte; toto je návod pre prípad, keď ste sa už rozhodli.",
      },
      {
        type: "bullets",
        title: "Odkiaľ vie Faktero prevziať dáta",
        items: [
          "SuperFaktúra — export agendy vrátane ZIP so súbormi isdoc",
          "Pohoda a mPohoda",
          "Money S3",
          "Omega a KROS",
          "iDoklad",
          "CSV alebo XLSX, keď váš systém nie je v zozname",
        ],
      },
      {
        type: "section",
        title: "Postup",
        body: "V starom systéme si vyexportujte agendu — odberateľov a vystavené faktúry. Vo Fakteri otvorte Účtovníctvo → Importy, vyberte svoj systém a nahrajte súbor. Faktero rozpozná stĺpce a ukáže, čo z nich prečítalo. Až potom sa rozhodujete, čo sa naozaj zapíše.",
      },
      {
        type: "section",
        title: "Prečo importovať po častiach",
        body: "Odporúčame začať odberateľmi. Skontrolujete si na nich, či sedia IČO, adresy a e-maily, a až potom pustíte faktúry — tie sa na hotový adresár naviažu. Keby ste išli naraz a niečo v adresári nesedelo, opravovali by ste to na dvoch miestach.",
      },
      {
        type: "bullets",
        title: "Čo sa prenesie",
        items: [
          "Odberatelia vrátane IČO, DIČ, IČ DPH a adries",
          "Vystavené faktúry s položkami, sadzbami DPH a dátumami",
          "Pôvodné čísla faktúr — číselný rad sa zachová, nezačína sa od jednotky",
          "Stav úhrady, takže otvorené pohľadávky ostanú otvorené",
        ],
      },
      {
        type: "section",
        title: "Kontrola, na ktorú sa zabúda",
        body: "Po importe porovnajte súčet otvorených pohľadávok s tým, čo ste mali v starom systéme. Ak sedí, prenieslo sa všetko podstatné. Ak nesedí, takmer vždy je za tým faktúra so stavom, ktorý starý systém volal inak — v prehľade faktúr ju nájdete podľa čísla za pár sekúnd.",
      },
      {
        type: "callout",
        title: "Starý systém nevypínajte hneď",
        body: "Nechajte si k nemu prístup do konca účtovného obdobia. Nie preto, že by import niečo stratil, ale preto, že je pokojnejšie mať kde overiť číslo, keď sa na niečo spýta účtovníčka.",
      },
    ],
  },
  {
    slug: "pohoda-export-bez-rucnej-prace",
    title: "Pohoda export bez ručného prepisovania",
    date: "2026-03-30",
    minuty: 4,
    ikona: Package2,
    odtien: "jantar",
    excerpt: "Ako odovzdať účtovníčke mesačný balík faktúr jediným klikom — XML, PDF a sumár DPH.",
    blocks: [
      {
        type: "lead",
        text: "Mesačné odovzdávanie podkladov účtovníčke je práca, ktorú nikto nepočíta, a pritom zožerie pol dňa. Faktúry sa sťahujú po jednej, prepisujú do tabuľky a posielajú v troch e-mailoch. Pritom celý balík sa dá pripraviť jedným označením a jedným kliknutím.",
      },
      {
        type: "section",
        title: "Ako to funguje",
        body: "V zozname faktúr označíte obdobie — napríklad všetky faktúry za minulý mesiac — a zvolíte export do Pohody. Vznikne jeden XML súbor, ktorý si Pohoda načíta ako dávku. Nič sa neprepisuje, takže nevznikajú preklepy v sumách ani v číslach faktúr.",
      },
      {
        type: "bullets",
        title: "Čo XML nesie",
        items: [
          "Hlavičku faktúry s číslom, dátumami a variabilným symbolom",
          "Odberateľa vrátane IČO, DIČ a IČ DPH",
          "Položky s množstvom, cenou a sadzbou DPH",
          "Rozlíšenie dobropisu a zálohovej faktúry, aby sa nezaúčtovali ako bežné plnenie",
        ],
      },
      {
        type: "section",
        title: "Celý balík naraz",
        body: "K XML sa hodia dve veci: PDF všetkých faktúr v jednom ZIP archíve a prehľad DPH za obdobie s rozpisom po sadzbách. Oboje je v Fakteri na jedno kliknutie, takže účtovníčka dostane jednu správu a nie sériu otázok, čo kde chýba.",
      },
      {
        type: "section",
        title: "Nepoužívate Pohodu?",
        body: "Rovnaký balík viete vyexportovať aj pre Omegu (TXT) a Money S3 (XML). Výber formátu je jedna položka v ponuke, zvyšok postupu je rovnaký.",
      },
      {
        type: "callout",
        title: "Keď je priznanie podané, zamknite obdobie",
        body: "Uzávierka v Fakteri zabráni tomu, aby sa doklady s už podaným priznaním dodatočne zmenili. Úhrady sa zapisovať dajú ďalej — zamknuté sú sumy, dátumy a položky.",
      },
    ],
  },
  {
    slug: "api-fakturacia-saas",
    title: "API fakturácia pre SaaS: idempotencia, webhooky a opakované faktúry",
    date: "2026-02-18",
    minuty: 7,
    ikona: Plug,
    odtien: "fialova",
    excerpt:
      "Architektúra automatizovanej fakturácie pre SaaS produkty na Slovensku — vzory, ktoré fungujú v produkcii.",
    blocks: [
      {
        type: "lead",
        text: "Keď fakturáciu spustíte z kódu, prestanú byť problémom preklepy a začnú byť problémom duplicity. Táto téma má tri praktické časti: ako nevystaviť tú istú faktúru dvakrát, ako sa dozvedieť o zaplatení a kedy si vystačíte bez API.",
      },
      {
        type: "section",
        title: "Test a live kľúč od začiatku",
        body: "Faktero rozlišuje testovací a ostrý kľúč a je to vidieť už z jeho tvaru. Vývoj a skúšanie robte testovacím; ostrý patrí len do produkcie. Kľúč sa posiela v hlavičke Authorization ako Bearer token a jeho hodnotu vidíte jediný raz — pri vytvorení.",
      },
      {
        type: "section",
        title: "Idempotencia cez external_id",
        body: "Každá požiadavka na vystavenie faktúry môže niesť vaše vlastné external_id — napríklad identifikátor predplatného alebo objednávky. Keď to isté external_id príde druhý raz, Faktero nevystaví novú faktúru, ale vráti tú pôvodnú. Vďaka tomu je bezpečné volanie zopakovať po timeoute alebo po páde procesu, čo je presne tá situácia, v ktorej duplicity vznikajú.",
      },
      {
        type: "bullets",
        title: "Čo si ustrážiť na svojej strane",
        items: [
          "external_id musí byť stabilné — nie náhodné pri každom pokuse",
          "Odpoveď si uložte aj s číslom faktúry, nech ho neskôr netreba dohľadávať",
          "Sieťovú chybu berte ako „neviem, či prešlo“, nie ako neúspech, a volanie zopakujte",
        ],
      },
      {
        type: "section",
        title: "Webhooky namiesto opakovaného dopytovania",
        body: "Stav faktúry nezisťujte v cykle. Faktero pošle na váš endpoint udalosť, keď faktúra vznikne, keď je odoslaná, keď je zaplatená a keď je stornovaná. Doručenia sa evidujú aj s HTTP odpoveďou vašej strany, takže sa dá dohľadať, čo prešlo a čo nie.",
      },
      {
        type: "section",
        title: "Kedy API vôbec nepotrebujete",
        body: "Ak fakturujete každý mesiac tú istú sumu tým istým zákazníkom, opakované faktúry to vyriešia bez jediného riadku kódu — šablóna sa vystaví a odošle sama. API má zmysel vtedy, keď suma alebo položky závisia od toho, čo sa udialo vo vašom produkte.",
      },
      {
        type: "callout",
        title: "Vyskúšajte to bez písania kódu",
        body: "V sekcii API Playground viete zavolať koncové body priamo z prehliadača a hneď vidieť odpoveď aj záznam v logu volaní. Je to najrýchlejší spôsob, ako si overiť tvar dát pred tým, než sa do toho pustíte.",
      },
    ],
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}

/** Najnovšie navrchu — zoznam nemá byť v poradí, v akom vznikal súbor. */
export function postsByDate(): BlogPost[] {
  return [...POSTS].sort((a, b) => b.date.localeCompare(a.date));
}
