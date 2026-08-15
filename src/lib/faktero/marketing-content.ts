import {
  FileText,
  Quote,
  Repeat,
  Download,
  Upload,
  Building2,
  Code2,
  Webhook,
  BookOpen,
  TerminalSquare,
  ShieldCheck,
  Globe2,
  Mail,
  FileSpreadsheet,
  Receipt,
  Plug,
  Boxes,
  MapPin,
  ScanLine,
  Smartphone,
  Landmark,
  Tags,
  HardHat,
  ClipboardList,
  Wallet,
  Calculator,
  type LucideIcon,
} from "lucide-react";

export type ContentBlock =
  | { type: "lead"; text: string }
  | { type: "section"; title: string; body: string }
  | { type: "bullets"; title?: string; items: string[] }
  | { type: "callout"; title: string; body: string };

export type DetailItem = {
  slug: string;
  label: string;
  summary: string;
  icon: LucideIcon;
  blocks: ContentBlock[];
};

export type HubContent = {
  hubSlug: string;
  hubTitle: string;
  hubDescription: string;
  hubLead: string;
  items: DetailItem[];
};

/* -------------------------------------------------------------------------- */
/* Funkcie                                                                    */
/* -------------------------------------------------------------------------- */

export const funkcie: HubContent = {
  hubSlug: "funkcie",
  hubTitle: "Funkcie Faktero",
  hubDescription:
    "Faktúry, ponuky, skener bločkov z eKasy, párovanie platieb z banky, cenník a zľavy, zákazky, sklad, pokladňa, DPH prehľad, kniha jázd a aplikácia do telefónu — v jednom systéme.",
  hubLead:
    "Všetko, čo potrebujete na fakturáciu a prevádzku modernej firmy — bez kompromisov, pripravené na eFaktúru 2027.",
  items: [
    {
      slug: "faktury",
      label: "Faktúry",
      summary: "Profesionálne PDF faktúry s QR platbou, IBAN a rozpisom DPH.",
      icon: FileText,
      blocks: [
        {
          type: "lead",
          text: "Vystavte faktúru za 30 sekúnd — s logom, QR kódom a kompletným rozpisom DPH.",
        },
        {
          type: "bullets",
          title: "Čo dostanete",
          items: [
            "PDF faktúry s logom firmy, IBAN, BIC a QR platbou (PAY by square)",
            "Automatické číselné rady pre faktúry, dobropisy a zálohové faktúry",
            "Viacero sadzieb DPH na jednej faktúre vrátane reverse-charge",
            "Odoslanie e-mailom z vašej adresy a sledovanie doručenia",
            "Označenie zaplatených faktúr a evidencia úhrad",
          ],
        },
        {
          type: "section",
          title: "Pre koho je to ideálne",
          body: "Pre živnostníkov, s.r.o. aj agentúry. Faktero zvládne jednorazové faktúry, mesačné fakturovanie aj komplexné projekty s viacerými položkami a sadzbami DPH.",
        },
      ],
    },
    {
      slug: "cenove-ponuky",
      label: "Cenové ponuky",
      summary: "Vystavte ponuku za minútu a premeňte ju na faktúru jedným klikom.",
      icon: Quote,
      blocks: [
        {
          type: "lead",
          text: "Profesionálne cenové ponuky, ktoré sa jedným klikom menia na ostrú faktúru.",
        },
        {
          type: "bullets",
          title: "Najdôležitejšie",
          items: [
            "Vlastné číselné rady ponúk",
            "Platnosť ponuky a stav (návrh, odoslaná, akceptovaná, zamietnutá)",
            "Konverzia ponuka → faktúra bez prepisovania položiek",
            "PDF export s logom a podmienkami",
          ],
        },
      ],
    },
    {
      slug: "opakovane-faktury",
      label: "Opakované faktúry",
      summary: "Mesačné a ročné šablóny, ktoré sa generujú a odosielajú automaticky.",
      icon: Repeat,
      blocks: [
        {
          type: "lead",
          text: "Nastavte šablónu raz a Faktero vystavuje faktúru sám — mesačne, štvrťročne alebo ročne.",
        },
        {
          type: "bullets",
          items: [
            "Mesačné, štvrťročné a ročné cykly",
            "Automatické generovanie aj odoslanie e-mailom",
            "Pauza, ukončenie a úprava šablóny kedykoľvek",
            "História všetkých vygenerovaných faktúr",
          ],
        },
      ],
    },
    {
      slug: "pohoda-export",
      label: "Prepojenie s Pohodou",
      summary: "Pohoda si doklady vezme sama a povie, aké čísla im pridelila.",
      icon: Download,
      blocks: [
        {
          type: "lead",
          text: "Podklady odídu mailom 5. v mesiaci, alebo si ich Pohoda stiahne sama každú noc. Účtovníčka pritom nič neinštaluje.",
        },
        {
          type: "bullets",
          items: [
            "Vydané aj zálohové faktúry, dobropisy, prijaté doklady a pokladňa",
            "Voliteľne adresár, skladové karty a zákazky — faktúra potom nesie zákazku",
            "Späť sa vracajú čísla, ktoré doklady dostali v Pohode",
            "Predkontácie a členenia DPH, takže sa doklad rovno zaúčtuje",
            "Odovzdaný doklad sa neposiela druhýkrát",
            "Funguje so všetkými radami Pohody",
          ],
        },
      ],
    },
    {
      slug: "import-superfaktura",
      label: "Import zo SuperFaktúry",
      summary: "Prejdite na Faktero bez straty histórie a číselných radov.",
      icon: Upload,
      blocks: [
        {
          type: "lead",
          text: "Migrácia zo SuperFaktúry trvá pár minút — históriu faktúr, odberateľov a číselné rady prenesieme za vás.",
        },
        {
          type: "bullets",
          items: [
            "Import faktúr, ponúk a odberateľov",
            "Zachovanie pôvodných čísel faktúr",
            "Hromadný import CSV / XML",
            "Sprievodca krok za krokom",
          ],
        },
      ],
    },
    {
      slug: "multi-company",
      label: "Multi-company",
      summary: "Spravujte viacero firiem z jedného účtu.",
      icon: Building2,
      blocks: [
        { type: "lead", text: "Jeden účet, viacero firiem. Prepínajte medzi nimi jedným klikom." },
        {
          type: "bullets",
          items: [
            "Oddelené číselné rady pre každú firmu",
            "Oddelené odberatelia, ponuky a faktúry",
            "Roly: vlastník, účtovník, spolupracovník",
            "Konsolidované prehľady cez všetky firmy",
          ],
        },
      ],
    },
    {
      slug: "skener-blockov",
      label: "Skener bločkov",
      summary: "Odfoťte QR kód z bločku a doklad sa načíta z Finančnej správy aj s položkami.",
      icon: ScanLine,
      blocks: [
        {
          type: "lead",
          text: "Bloček z obchodu nemusíte prepisovať ani odkladať do šuflíka. Naskenujte QR kód a Faktero si vypýta doklad priamo z eKasy — s dodávateľom, sumou, rozpisom DPH aj jednotlivými položkami.",
        },
        {
          type: "bullets",
          title: "Čo skener zvládne",
          items: [
            "QR kód z pokladničného dokladu — údaje idú priamo z Finančnej správy, nie z odhadu",
            "Položky z bločku vrátane rozpisu po sadzbách DPH",
            "Faktúru v PDF aj viacstranový doklad odfotený po stranách",
            "Doklad bez QR kódu prečíta z fotky",
            "Spôsob úhrady sa pýta hneď pri skenovaní — hotovosť uberá z pokladne",
          ],
        },
        {
          type: "section",
          title: "Prečo to má zmysel",
          body: "Prepisovanie bločkov je práca, ktorú nikto nechce robiť a preto sa odkladá — a na konci mesiaca chýbajú doklady k výdavkom. Naskenovaný bloček je v systéme za pár sekúnd aj s fotkou originálu.",
        },
      ],
    },
    {
      slug: "mobilna-aplikacia",
      label: "Faktero v telefóne",
      summary: "Vystavte faktúru, naskenujte bloček a odmerajte jazdu priamo z mobilu.",
      icon: Smartphone,
      blocks: [
        {
          type: "lead",
          text: "Aplikácia robí presne tri veci, ktoré sa robia mimo kancelárie: vystaví faktúru, zoberie doklad a odmeria jazdu. Nič viac — na malej obrazovke by zvyšok len prekážal.",
        },
        {
          type: "bullets",
          title: "Čo v telefóne funguje",
          items: [
            "Faktúra v troch krokoch — odberateľ, položky, splatnosť — s cenami z vášho cenníka",
            "Hotovú faktúru pošlete e-mailom alebo cez systémové menu (WhatsApp, Messenger, Súbory)",
            "Zopakovanie poslednej faktúry pre toho istého odberateľa jedným ťuknutím",
            "Skenovanie dokladov funguje aj bez signálu — doklad počká v telefóne a odošle sa sám",
            "Kniha jázd so štartom a stopom, kilometre odmeria telefón",
            "Odomknutie Face ID alebo odtlačkom",
          ],
        },
        {
          type: "callout",
          title: "Aplikácia je pred vydaním",
          body: "Verziu pre iPhone dokončujeme a čaká na schválenie v App Store. Ohlásime ju hneď, ako bude dostupná.",
        },
      ],
    },
    {
      slug: "bankove-parovanie",
      label: "Banka a párovanie úhrad",
      summary: "Faktero pozná pohyby na účte a samo označí zaplatené faktúry.",
      icon: Landmark,
      blocks: [
        {
          type: "lead",
          text: "Pripojte bankový účet a Faktero si každý deň stiahne pohyby. Isté zhody spáruje samo, sporné vám predloží na rozhodnutie — nikdy nehádže mince za vás.",
        },
        {
          type: "bullets",
          title: "Ako to pracuje",
          items: [
            "Priame napojenie na Tatra banku, pre ostatné banky import výpisu",
            "Párovanie podľa variabilného symbolu, sumy a názvu odberateľa",
            "Čiastočné úhrady sa odrátajú, faktúra ostane otvorená na zvyšok",
            "Nesprávne spárovanie sa dá vrátiť jedným klikom",
            "Bankové výpisy vo formáte camt.053 aj v PDF",
          ],
        },
        {
          type: "section",
          title: "Čo tým získate",
          body: "Odpadá porovnávanie výpisu s faktúrami. Prehľad neuhradených je vždy aktuálny, takže upomienka odíde tomu, kto naozaj nezaplatil.",
        },
      ],
    },
    {
      slug: "cennik-zlavy-akcie",
      label: "Cenník, zľavy a akcie",
      summary: "Dohodnuté ceny pre odberateľa, zľavy podľa skupín a časovo obmedzené akcie.",
      icon: Tags,
      blocks: [
        {
          type: "lead",
          text: "Každý odberateľ môže mať vlastnú cenu a Faktero ju na faktúru doplní samo — aj s vysvetlením, odkiaľ tá cena je.",
        },
        {
          type: "bullets",
          items: [
            "Individuálna cena pre odberateľa aj pre celú cenovú skupinu",
            "Množstevné ceny — iná cena od určitého počtu kusov",
            "Percentuálna zľava pre odberateľa alebo skupinu",
            "Cenové akcie s platnosťou od–do, na vybrané produkty alebo na celý sortiment",
            "Pri každej položke je vidieť, prečo je cena taká",
          ],
        },
        {
          type: "section",
          title: "Poradie je pevné",
          body: "Dohodnutá cena prebíja zľavu a akcia platí len vtedy, keď je pre odberateľa výhodnejšia. Vďaka tomu sa nestane, že by kampaň prepísala cenu dohodnutú v zmluve.",
        },
      ],
    },
    {
      slug: "zakazky",
      label: "Zákazky a ziskovosť",
      summary: "Faktúry, materiál zo skladu a jazdy na jednom mieste — a koľko na zákazke ostalo.",
      icon: HardHat,
      blocks: [
        {
          type: "lead",
          text: "Zákazka spojí výnosy a náklady jednej práce. Uvidíte, koľko ste vyfakturovali, koľko stál materiál a doprava, a čo z toho ostalo.",
        },
        {
          type: "bullets",
          items: [
            "Faktúry, skladové výdaje a jazdy priradené k jednej zákazke",
            "Materiál sa oceňuje váženou nákupnou cenou, nie predajnou",
            "Zálohová faktúra sa do výnosov nezapočíta dvakrát",
            "Prehľad otvorených a uzavretých zákaziek s maržou",
          ],
        },
      ],
    },
    {
      slug: "prijate-objednavky",
      label: "Prijaté objednávky",
      summary: "Od objednávky odberateľa po faktúru — aj po častiach.",
      icon: ClipboardList,
      blocks: [
        {
          type: "lead",
          text: "Objednávku prijmete, potvrdíte a vyfakturujete. Keď dodávate po častiach, do ďalšej faktúry ide vždy len to, čo ešte nebolo vyfakturované.",
        },
        {
          type: "bullets",
          items: [
            "Stav objednávky sa počíta z toho, čo je vyfakturované",
            "Čiastočná fakturácia bez ručného odpočítavania",
            "Rezervácia tovaru na sklade po potvrdení objednávky",
            "Objednávka vznikne aj z akceptovanej cenovej ponuky",
          ],
        },
      ],
    },
    {
      slug: "pokladna-a-ekasa",
      label: "Pokladňa a eKasa",
      summary: "Stav hotovosti z pokladničných dokladov aj z dokladov platených v hotovosti.",
      icon: Wallet,
      blocks: [
        {
          type: "lead",
          text: "Pokladňa vie, koľko máte v kase — počíta príjmové a výdavkové doklady spolu s naskenovanými bločkami, ktoré ste zaplatili hotovosťou.",
        },
        {
          type: "bullets",
          items: [
            "Príjmové a výdavkové pokladničné doklady s vlastným číselným radom",
            "Doklady zaplatené hotovosťou uberajú zo stavu automaticky",
            "Zostatok k začiatku aj ku koncu obdobia",
            "Bločky z eKasy s overenými údajmi z Finančnej správy",
          ],
        },
      ],
    },
    {
      slug: "dph-a-uzavierka",
      label: "DPH prehľad a uzávierka",
      summary: "Podklad pre priznanie a zámok na obdobie, ktoré už bolo podané.",
      icon: Calculator,
      blocks: [
        {
          type: "lead",
          text: "Prehľad DPH na výstupe aj na vstupe za mesiac alebo štvrťrok, s rozpisom po sadzbách a odvodom na úhradu. Na stiahnutie v CSV aj na tlač.",
        },
        {
          type: "bullets",
          items: [
            "Rozpis po sadzbách 23 / 19 / 5 / 0 % vrátane prenosu daňovej povinnosti",
            "Dobropis daň znižuje, zálohová faktúra do priznania nevstupuje",
            "DPH na vstupe z prijatých faktúr",
            "Uzamknutie obdobia — doklady s podaným priznaním sa už nedajú zmeniť ani zmazať",
          ],
        },
        {
          type: "section",
          title: "Informatívny prehľad",
          body: "Faktero nie je účtovný systém a priznanie za vás nepodá. Dáva podklad, ktorý si účtovníčka overí — a zámok, ktorý zabráni tomu, aby sa už podané čísla zmenili.",
        },
      ],
    },
    {
      slug: "importy",
      label: "Prechod z iného systému",
      summary:
        "Faktúry, odberateľov aj históriu prenesiete zo SuperFaktúry, Pohody, Money S3, Omegy, iDokladu aj KROSu.",
      icon: Upload,
      blocks: [
        {
          type: "lead",
          text: "Zmena fakturačného systému nemá znamenať stratu histórie. Faktero prevezme odberateľov aj vystavené faktúry a zachová vaše číselné rady.",
        },
        {
          type: "bullets",
          title: "Odkiaľ viete prejsť",
          items: [
            "SuperFaktúra — export vrátane ZIP so súbormi isdoc",
            "Pohoda a mPohoda",
            "Money S3",
            "Omega a KROS",
            "iDoklad",
            "Skladové karty z CSV alebo XLSX",
          ],
        },
        {
          type: "callout",
          title: "Import viete pustiť aj po častiach",
          body: "Najskôr len odberateľov, faktúry potom. Pred zápisom uvidíte, čo sa naimportuje, a rozpoznané stĺpce si viete opraviť.",
        },
      ],
    },
    {
      slug: "skladove-hospodarstvo",
      label: "Skladové hospodárstvo",
      summary: "Príjemky, výdajky, viacero skladov a priame prepojenie s faktúrami.",
      icon: Boxes,
      blocks: [
        {
          type: "lead",
          text: "Evidujte skladové zásoby, pohyby a viacero skladov — priamo prepojené s faktúrami.",
        },
        {
          type: "bullets",
          items: [
            "Vedenie skladových kariet a viacero skladov",
            "Príjemky, výdajky a inventúry",
            "Automatický skladový pohyb pri vystavení faktúry",
            "Dobropisy a reverzie skladových pohybov",
            "Reálny stav skladu v reálnom čase",
          ],
        },
      ],
    },
    {
      slug: "kniha-jazd-commander-gps",
      label: "Kniha jázd + Commander GPS",
      summary: "Jazdy a tankovania z Commander GPS sa sťahujú automaticky do knihy jázd.",
      icon: MapPin,
      blocks: [
        {
          type: "lead",
          text: "Prepojte Faktero s Commander GPS a jazdy aj tankovania sa budú zapisovať samé.",
        },
        {
          type: "bullets",
          items: [
            "Automatický import jázd z Commander GPS",
            "Evidencia tankovaní a nákladov na vozidlá",
            "Prehľad kilometrov a spotreby",
            "Priama väzba na nákladové faktúry a DPH",
            "Podpora viacerých vozidiel a vodičov",
          ],
        },
        {
          type: "section",
          title: "Ako si prepojiť Commander GPS",
          body: "Prepojenie nastavíte raz a Faktero si potom sťahuje jazdy automaticky na pozadí.",
        },
        {
          type: "bullets",
          title: "Postup krok za krokom",
          items: [
            "1. V Commander GPS otvorte Nastavenia → API a vygenerujte API kľúč (token) pre vašu firmu.",
            "2. Skopírujte API kľúč a ID klienta (Customer ID) z Commander GPS.",
            "3. V Faktero prejdite do Nastavenia → Integrácie → Commander GPS.",
            "4. Vložte API kľúč a Customer ID a kliknite na Pripojiť.",
            "5. Vyberte vozidlá, ktoré chcete synchronizovať do knihy jázd.",
            "6. Zvoľte počiatočný dátum importu (napr. od začiatku aktuálneho roka).",
            "7. Uložte — prvá synchronizácia prebehne hneď, ďalšie automaticky každú noc.",
          ],
        },
        {
          type: "section",
          title: "Ako to funguje",
          body: "Faktero sa každú noc spojí s Commander GPS cez zabezpečené API, stiahne nové jazdy a tankovania a priradí ich k vozidlám a vodičom v knihe jázd. Duplicity sa filtrujú podľa ID jazdy z Commandera, takže opakovaná synchronizácia nikdy nevytvorí duplicitný záznam. Tankovania sa automaticky napárujú na nákladové faktúry za palivo (ak ich evidujete) a kilometre sa premietnu do mesačného prehľadu spotreby a do podkladov pre cestovné náhrady.",
        },
        {
          type: "bullets",
          title: "Čo uvidíte v Nastavenia → Integrácie → Commander GPS",
          items: [
            "Stav prepojenia (Pripojené / Odpojené / Chyba autentifikácie)",
            "Dátum a čas poslednej úspešnej synchronizácie",
            "Počet importovaných jázd a tankovaní za posledných 30 dní",
            "Zoznam vozidiel z Commandera s prepínačom Synchronizovať áno/nie",
            "Mapovanie vozidiel Commander → vozidlá vo Faktere",
            "Mapovanie vodičov Commander → používatelia vo Faktere",
            "Počiatočný dátum importu jázd",
            "Tlačidlo Synchronizovať teraz pre manuálne spustenie",
            "História synchronizácií s počtom záznamov a prípadnými chybami",
            "Tlačidlo Odpojiť integráciu (zruší token, dáta v knihe jázd zostávajú)",
          ],
        },
        {
          type: "callout",
          title: "Bezpečnosť",
          body: "API kľúč Commander GPS je uložený šifrovane a používa sa výhradne na čítanie jázd a tankovaní vašej firmy. Kedykoľvek ho môžete v Commanderi zneplatniť alebo integráciu vo Faktere odpojiť jedným klikom.",
        },
      ],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* API / pre vývojárov                                                        */
/* -------------------------------------------------------------------------- */

export const vyvojari: HubContent = {
  hubSlug: "vyvojari",
  hubTitle: "API a pre vývojárov",
  hubDescription:
    "REST API, webhooky, dokumentácia a playground — automatizujte fakturáciu vašej platformy.",
  hubLead:
    "Faktero je API-first. Vystavujte faktúry, párujte platby a spravujte odberateľov priamo z vašej aplikácie.",
  items: [
    {
      slug: "rest",
      label: "REST API",
      summary: "JSON REST API s test / live režimom a idempotenciou cez external_id.",
      icon: Code2,
      blocks: [
        {
          type: "lead",
          text: "Plné REST API pre faktúry, ponuky, odberateľov a opakované faktúry.",
        },
        {
          type: "bullets",
          items: [
            "Bearer token autentifikácia (sk_test_ / sk_live_)",
            "Idempotency-Key cez Idempotency-Key header alebo external_id",
            "Konzistentné chybové kódy a stránkovanie",
            "Rate limit 100 req / min na kľúč",
          ],
        },
        {
          type: "callout",
          title: "Endpoint POST /api/v1/invoices",
          body: "Vytvorí faktúru, voliteľne odošle PDF e-mailom a vráti URL na stiahnutie.",
        },
      ],
    },
    {
      slug: "webhooky",
      label: "Webhooky",
      summary: "Real-time eventy o faktúrach, platbách a chybách.",
      icon: Webhook,
      blocks: [
        { type: "lead", text: "Reagujte na zmeny v reálnom čase — bez polling-u." },
        {
          type: "bullets",
          items: [
            "Eventy: invoice.created, invoice.paid, invoice.overdue, quote.accepted",
            "HMAC-SHA256 podpis pre overenie pôvodu",
            "Automatické opakované doručenie pri zlyhaní",
            "Log doručení s payloadom a odpoveďou",
          ],
        },
      ],
    },
    {
      slug: "dokumentacia",
      label: "Dokumentácia",
      summary: "Príručka v slovenčine s príkladmi v cURL, Node.js a PHP.",
      icon: BookOpen,
      blocks: [
        { type: "lead", text: "Kompletná dokumentácia API s príkladmi pre najčastejšie scenáre." },
        {
          type: "bullets",
          items: [
            "Autentifikácia, chyby, stránkovanie",
            "Príklady v cURL, Node.js, PHP a Pythone",
            "Recepty: opakované faktúry, dobropisy, párovanie platieb",
            "Changelog a verziovanie API",
          ],
        },
      ],
    },
    {
      slug: "playground",
      label: "Playground",
      summary: "Interaktívne vyskúšanie API priamo z prehliadača.",
      icon: TerminalSquare,
      blocks: [
        { type: "lead", text: "Otestujte volania API bez písania kódu — priamo v prehliadači." },
        {
          type: "bullets",
          items: [
            "Predvyplnené príklady pre každý endpoint",
            "Test režim s realistickými dátami",
            "Generovanie ukážkového kódu",
            "Histórie volaní a odpovedí",
          ],
        },
      ],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* eFaktúra                                                                   */
/* -------------------------------------------------------------------------- */

export const efakturacia: HubContent = {
  hubSlug: "efakturacia",
  hubTitle: "eFaktúra 2027",
  hubDescription:
    "Od 1.1.2027 bude eFaktúra povinná pre B2B transakcie na Slovensku. Faktero je pripravené včas.",
  hubLead:
    "Štrukturovaná elektronická faktúra (eFaktúra), Peppol sieť a Digitálny poštár — všetko, čo o tom potrebujete vedieť.",
  items: [
    {
      slug: "prehlad",
      label: "Prehľad eFaktúry",
      summary: "Čo je eFaktúra, koho sa týka a od kedy bude povinná.",
      icon: ShieldCheck,
      blocks: [
        {
          type: "lead",
          text: "eFaktúra je strojovo čitateľný formát faktúry (UBL 2.1 / Peppol BIS 3.0), ktorý od 1. januára 2027 nahradí klasické PDF v B2B a B2G transakciách na Slovensku.",
        },
        {
          type: "section",
          title: "Čo je vlastne eFaktúra?",
          body: "eFaktúra (elektronická faktúra) nie je PDF poslané emailom ani naskenovaný papier. Je to štruktúrovaný XML dokument podľa európskej normy EN 16931, ktorý dokáže automaticky spracovať účtovný softvér príjemcu — bez prepisovania, bez OCR, bez chýb. Faktúra obsahuje rovnaké informácie ako papierová (dodávateľ, odberateľ, položky, DPH, IBAN), ale v presne definovanej dátovej štruktúre.",
        },
        {
          type: "section",
          title: "Koho sa povinnosť týka?",
          body: "Od 1.1.2027 musí každý platiteľ DPH na Slovensku vystavovať a prijímať eFaktúry pre B2B transakcie (firma firme) a B2G (firma štátu). Povinnosť sa vzťahuje na všetkých podnikateľov bez ohľadu na veľkosť — od SZČO až po veľké korporácie. Faktúry pre koncových spotrebiteľov (B2C) ostávajú v pôvodnom režime.",
        },
        {
          type: "bullets",
          title: "Kľúčové fakty v kocke",
          items: [
            "Povinnosť B2B aj B2G od 1. januára 2027",
            "Štandard: UBL 2.1 / Peppol BIS 3.0 podľa EN 16931",
            "Doručenie cez Peppol sieť alebo Digitálny poštár Finančnej správy SR",
            "PDF už nebude stačiť na uplatnenie nákladu a odpočtu DPH",
            "Automatické párovanie s objednávkou a skladom",
            "Real-time reporting do Finančnej správy",
          ],
        },
        {
          type: "section",
          title: "Prečo to štát zavádza?",
          body: "Cieľom je zníženie DPH medzery (VAT gap), boj proti karuselovým podvodom a digitalizácia ekonomiky. EÚ smernica ViDA (VAT in the Digital Age) zavádza povinné eFaktúry naprieč celou Úniou. Slovensko je medzi prvými krajinami, ktoré štandard prijímajú — vďaka tomu budú slovenské firmy pripravené na cezhraničný obchod skôr.",
        },
        {
          type: "section",
          title: "Čo to znamená pre vašu firmu?",
          body: "Potrebujete softvér, ktorý vie vygenerovať validný XML podľa Peppol BIS 3.0, podpísať ho a odoslať cez akreditovaný Peppol Access Point alebo Digitálneho poštára. Rovnako musíte byť schopní eFaktúry prijímať, automaticky spracovať a archivovať 10 rokov v pôvodnom XML formáte. Excel a ručné PDF skončili.",
        },
        {
          type: "callout",
          title: "Faktero je ready včas",
          body: "Pracujeme na podpore Peppol BIS 3.0 a integrácii s Digitálnym poštárom tak, aby ste boli pripravení mesiace pred legislatívnym termínom. Vaše dáta migrujeme automaticky — nemusíte riešiť nič.",
        },
      ],
    },
    {
      slug: "peppol",
      label: "Peppol",
      summary: "Európska sieť pre doručovanie eFaktúr medzi firmami.",
      icon: Globe2,
      blocks: [
        {
          type: "lead",
          text: "Peppol (Pan-European Public Procurement OnLine) je celoeurópska sieť, cez ktorú si firmy a inštitúcie vymieňajú eFaktúry v štandarde Peppol BIS 3.0 — bezpečne, rýchlo a kompatibilne naprieč hranicami.",
        },
        {
          type: "section",
          title: "Ako Peppol funguje?",
          body: "Peppol funguje podobne ako emailová sieť, ale pre štruktúrované obchodné dokumenty. Každá firma má v sieti svoju jedinečnú adresu — Peppol ID (napríklad 9914:SK12345678 pre slovenský IČ DPH). Faktúru odošlete cez svojho Access Point providera, ten ju doručí Access Pointu príjemcu, a ten ju vloží do účtovného systému príjemcu. Celý prenos trvá sekundy a je end-to-end šifrovaný.",
        },
        {
          type: "section",
          title: "Štyrhranný model (4-corner model)",
          body: "Peppol využíva tzv. 4-corner model: odosielateľ (1) → odosielateľov Access Point (2) → príjemcov Access Point (3) → príjemca (4). Firmy si vyberú akreditovaného providera a neriešia technické detaily protokolu. Faktero plánuje vlastný Access Point, takže nebudete odkázaní na tretiu stranu.",
        },
        {
          type: "bullets",
          title: "Výhody Peppolu",
          items: [
            "Identifikácia firiem cez jednotné Peppol ID",
            "End-to-end doručenie cez akreditovaného Access Point providera",
            "Kompatibilné s eFaktúrou na Slovensku, v ČR aj v celej EÚ",
            "Bezpečný prenos s digitálnym podpisom a šifrovaním",
            "Potvrdenie doručenia (MLR — Message Level Response)",
            "Otvorený štandard — žiadny vendor lock-in",
          ],
        },
        {
          type: "section",
          title: "Peppol BIS 3.0 — čo to znamená?",
          body: "BIS (Business Interoperability Specification) je presná definícia, ako musí XML faktúra vyzerať. Verzia 3.0 vychádza z európskej normy EN 16931 a obsahuje národné rozšírenia (CIUS) pre konkrétne krajiny — Slovensko má vlastné rozšírenie s povinnými poľami pre DIČ, IČ DPH a špecifické sadzby DPH.",
        },
        {
          type: "callout",
          title: "Pre koho je Peppol?",
          body: "Najmä pre firmy, ktoré obchodujú s partnermi v EÚ alebo s veľkými korporáciami a štátnymi inštitúciami. V krajinách ako Belgicko, Nórsko alebo Nemecko je Peppol už štandardom — Slovensko sa pripája v roku 2027.",
        },
      ],
    },
    {
      slug: "digitalny-postar",
      label: "Digitálny poštár",
      summary: "Doručovateľ eFaktúr Finančnej správy SR.",
      icon: Mail,
      blocks: [
        {
          type: "lead",
          text: "Digitálny poštár je národný doručovací systém Finančnej správy SR, ktorý zabezpečí výmenu eFaktúr medzi slovenskými firmami — alternatíva k medzinárodnej sieti Peppol pre tuzemské B2B transakcie.",
        },
        {
          type: "section",
          title: "Čo je Digitálny poštár?",
          body: "Ide o štátom prevádzkovanú platformu, ktorá funguje ako centrálny hub pre slovenské eFaktúry. Každá vystavená faktúra prechádza cez Digitálneho poštára, ktorý ju validuje, archivuje a doručí príjemcovi. Finančná správa zároveň získava dáta pre svoj real-time monitoring DPH bez potreby samostatného Kontrolného výkazu.",
        },
        {
          type: "section",
          title: "Peppol vs. Digitálny poštár — čo si vybrať?",
          body: "Pre tuzemské B2B (slovenská firma → slovenská firma) môžete použiť oba kanály. Digitálny poštár je lacnejší a jednoduchší pre menšie firmy, Peppol je nutnosťou pre obchod s EÚ. Faktero podporí oba — vy si jednoducho zvolíte preferenciu a my smerujeme faktúru správnym kanálom automaticky podľa krajiny príjemcu.",
        },
        {
          type: "bullets",
          title: "Čo Digitálny poštár prinesie",
          items: [
            "Centrálne registrovaný príjem aj odoslanie eFaktúr",
            "Bezplatné základné použitie pre platiteľov DPH",
            "Štátna archivácia 10 rokov v zákonom požadovanom formáte",
            "Validácia XML voči slovenskému CIUS pred doručením",
            "Náhrada Kontrolného výkazu DPH (real-time reporting)",
            "API pre účtovné systémy ako Faktero",
          ],
        },
        {
          type: "section",
          title: "Kedy bude k dispozícii?",
          body: "Finančná správa SR plánuje pilotnú prevádzku v priebehu roku 2026 a plné spustenie k 1.1.2027 spolu s povinnosťou eFaktúry. Technické špecifikácie sú postupne zverejňované — Faktero pripraví integráciu hneď, ako budú finálne.",
        },
        {
          type: "callout",
          title: "Faktero pripraví integráciu",
          body: "Akonáhle Finančná správa zverejní finálne API, integrujeme Digitálneho poštára do Faktera. Vy nebudete musieť riešiť nič — len kliknete na 'Odoslať' a faktúra sa doručí správnym kanálom.",
        },
      ],
    },
  ],
};

/* duplicate placeholder removed — original items[] block ended above */

/* -------------------------------------------------------------------------- */
/* Účtovníci                                                                  */
/* -------------------------------------------------------------------------- */

export const uctovnici: HubContent = {
  hubSlug: "uctovnici",
  hubTitle: "Pre účtovníkov",
  hubDescription:
    "Pohoda export, mesačné podklady a integrácie — Faktero pripraví všetko, čo potrebujete.",
  hubLead:
    "Spolupracujte so svojimi klientmi efektívnejšie. Faktero generuje účtovné podklady jedným klikom.",
  items: [
    {
      slug: "pohoda-export",
      label: "Pohoda export",
      summary: "XML, ktoré sa naimportuje a rovno zaúčtuje.",
      icon: FileSpreadsheet,
      blocks: [
        {
          type: "lead",
          text: "Dátový balík pre XML import v Pohode — overený proti oficiálnej schéme Stormware, nie len „nejako poskladaný“.",
        },
        {
          type: "bullets",
          items: [
            "Zálohová faktúra ako zálohová, dobropis so zápornými sumami",
            "Sadzba DPH podľa dňa plnenia, nie podľa dneška",
            "Predkontácie a členenia DPH z vašej Pohody",
            "Prijaté doklady s rozpisom DPH po sadzbách a pokladňa",
          ],
        },
      ],
    },
    {
      slug: "pohoda-konektor",
      label: "Priame prepojenie s Pohodou",
      summary: "Pohoda si doklady stiahne sama každú noc — bez inštalácie.",
      icon: Plug,
      blocks: [
        {
          type: "lead",
          text: "Žiadne posielanie súborov. Raz denne si Pohoda vezme doklady, ktoré v nej ešte nie sú, a pošle späť správu o tom, ako import dopadol.",
        },
        {
          type: "bullets",
          items: [
            "Nič sa neinštaluje — priečinok a naplánovaná úloha Windows",
            "Neotvárajú sa žiadne porty, spojenie ide von",
            "Späť sa vracajú čísla dokladov z Pohody",
            "Odmietnutý doklad sa vráti do fronty aj s dôvodom",
            "Doklad sa nezaloží dvakrát, ani keď príde z dvoch strán",
            "Funguje so všetkými radami Pohody",
          ],
        },
      ],
    },
    {
      slug: "mesacne-podklady",
      label: "Mesačné podklady",
      summary: "Jedným klikom pripravíte balík faktúr, ponúk a nákladov za zvolený mesiac.",
      icon: Receipt,
      blocks: [
        {
          type: "lead",
          text: "Účtovník dostane podklady v štandardizovanej forme — bez prosby cez e-mail.",
        },
        {
          type: "bullets",
          items: [
            "ZIP balík: XML na import, súpisky v CSV, PDF faktúr a skeny dokladov",
            "Odoslanie mailom jedným klikom — alebo automaticky 5. v mesiaci",
            "Faktero vie, čo už odišlo, a druhýkrát to nepošle",
            "História: čo a kedy bolo odovzdané",
          ],
        },
      ],
    },
    {
      slug: "integracie",
      label: "Integrácie",
      summary: "Pripravujeme prepojenia s ďalšími účtovnými softvérmi.",
      icon: Plug,
      blocks: [
        {
          type: "lead",
          text: "Okrem Pohody pracujeme na integráciách s Money S3, Omega a iDoklad.",
        },
        {
          type: "bullets",
          items: [
            "Money S3 — pripravujeme",
            "Omega — pripravujeme",
            "iDoklad — pripravujeme",
            "Vlastné integrácie cez REST API",
          ],
        },
      ],
    },
  ],
};

export const HUBS: Record<string, HubContent> = {
  funkcie,
  vyvojari,
  efakturacia,
  uctovnici,
};

export function getHub(slug: string): HubContent | undefined {
  return HUBS[slug];
}

export function getItem(hub: HubContent, slug: string): DetailItem | undefined {
  return hub.items.find((i) => i.slug === slug);
}
