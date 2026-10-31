import {
  Banknote,
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
  ShoppingCart,
  ArrowLeftRight,
  ListChecks,
  Send,
  Flag,
  FileCheck2,
  BarChart3,
  CheckCircle2,
  CreditCard,
  Truck,
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
  /** Manuál v Pomoci k tejto funkcii — na stránke sa ukáže tlačidlo „Manuál“. */
  manual?: string;
};

export type HubContent = {
  hubSlug: string;
  hubTitle: string;
  /** Krátky nadpis úvodu; ak chýba, nadpisom je `hubDescription`. */
  hubHeadline?: string;
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
  hubHeadline: "Fakturácia a chod firmy v jednom systéme",
  hubDescription:
    "Faktúry, ponuky, skener bločkov z eKasy, párovanie platieb z banky, faktúry z e-shopu na WooCommerce, hromadný príkaz na úhradu, cenník a zľavy, zákazky, sklad, pokladňa, DPH, kniha jázd a aplikácia do telefónu — v jednom systéme.",
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
            "Prílohy k faktúre aj ponuke — dodací list, zmluva, výkaz prác — odídu spolu s ňou v e-maile",
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
            "Voliteľne adresár, skladové karty, pohyby aj zákazky — faktúra potom nesie zákazku",
            "Späť sa vracajú čísla, ktoré doklady dostali v Pohode",
            "Číselník predkontácií a členení DPH sa načíta priamo z Pohody — pre faktúry, prijaté faktúry, bločky, pokladňu aj banku zvlášť",
            "Odovzdaný doklad sa neposiela druhýkrát",
            "Strediská, činnosti, číselné rady a zákazky z Pohody, účtovanie pomerom (aj DPH 50/50)",
            "Viacúrovňové schvaľovanie dokladov — do Pohody a na úhradu ide len schválené",
            "Funguje so všetkými radami Pohody",
          ],
        },
        {
          type: "callout",
          title: "Neúčtujete v Pohode?",
          body: "Zaúčtované vystavené faktúry, prijaté faktúry aj bločky pošle Faktero aj do KROS Omegy (rovno účtovné zápisy), Money S3, ABRA Flexi a MRP-K/S — s predkontáciou, členením DPH, strediskom a zákazkou. Pre Helios či Premier pripraví zaúčtovanú súpisku CSV.",
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
      label: "Viac firiem",
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
      slug: "doklady-mailom",
      label: "Doklady e-mailom",
      summary: "Prepošlete faktúru od dodávateľa a ona sa sama zaeviduje.",
      icon: Mail,
      blocks: [
        {
          type: "lead",
          text: "Každá firma dostane vlastnú adresu. Čo na ňu prepošlete, to sa prečíta a pripraví v Nespracovaných dokladoch — bez sťahovania, bez prihlasovania.",
        },
        {
          type: "bullets",
          title: "Čo sa z prílohy prečíta",
          items: [
            "Dodávateľ, IČO, IČ DPH a IBAN",
            "Číslo faktúry a variabilný symbol",
            "Dátum vystavenia a splatnosti",
            "Základ dane, DPH a suma celkom",
            "Samotné PDF ostáva priložené k dokladu",
          ],
        },
        {
          type: "callout",
          title: "Viac firiem, jedna adresa",
          body: "Rozdeľovač pošle každý doklad tej z vašich firiem, na ktorú je vystavený — podľa IČO, IČ DPH či DIČ odberateľa, keď chýbajú, podľa IBAN-u alebo názvu. Rovnako to funguje pri nahratí PDF do ktorejkoľvek firmy. Doklad, ktorý nesedí práve na jednu firmu, sa nezaradí naslepo — počká na ručné priradenie.",
        },
        {
          type: "callout",
          title: "Nič sa neschváli samo",
          body: "Doklad čaká v Nespracovaných dokladoch, kým si ho neprezriete — miesta, odkiaľ sa údaje vzali, sú v náhľade PDF vyznačené. Stroj pripraví podklad, rozhodnutie ostáva na človeku — a pri každom maile je v denníku vidieť, ako dopadol.",
        },
        {
          type: "section",
          title: "Keď adresa unikne",
          body: "Adresa sa dá kedykoľvek vypnúť alebo vymeniť za novú; stará vtedy prestane prijímať. Prijímanie sa dá obmedziť na povolených odosielateľov a mail bez prílohy nič nezaloží — ak nezapnete, aby sa uložil ako PDF s textom mailu.",
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
          title: "Kde ju stiahnete",
          body: "Appka je v App Store — Faktero aj samostatná Kniha jázd pre vodičov, ktorí faktúry nerobia. Pre Android si obe appky stiahnete z webu (faktero.sk/android) — kým nebudú v Google Play, inštalujú sa ako APK.",
        },
      ],
    },
    {
      slug: "eshop-woocommerce",
      label: "E-shop na WooCommerce",
      summary:
        "Z každej objednávky vznikne faktúra sama — so sumami na cent a s PDF pre zákazníka.",
      icon: ShoppingCart,
      blocks: [
        {
          type: "lead",
          text: "Hotový doplnok pre WordPress. Nahráte ho, vložíte API kľúč a odteraz sa faktúry z objednávok vystavujú vo Fakteri samy — bez prepisovania a bez programovania.",
        },
        {
          type: "bullets",
          title: "Čo doplnok robí",
          items: [
            "Faktúra vznikne, keď objednávka prejde do zvoleného stavu — napríklad po zaplatení kartou",
            "Položky, kupóny, doprava aj poplatky so sadzbami DPH presne podľa obchodu",
            "Zaplatená objednávka má faktúru hneď uhradenú, dobierka až po vybavení",
            "Odkaz na PDF v e-maile o objednávke, v účte zákazníka aj v administrácii",
            "Polia IČO, DIČ a IČ DPH v pokladni — klasickej aj z blokov",
            "Pri výpadku sa vystavenie samo zopakuje a faktúra nikdy nevznikne dvakrát",
          ],
        },
        {
          type: "section",
          title: "A potom aj platby",
          body: "Výpis zo Stripe, PayPalu či GoPay nahráte do Faktera (Účtovníctvo → Výpis z platobnej brány) a platby sa spárujú s faktúrami podľa čísla objednávky. Poplatky brány a výbery na účet pôjdu do účtovníctva zvlášť.",
        },
      ],
    },
    {
      slug: "platobne-brany",
      label: "Platby cez Stripe, PayPal a GoPay",
      summary:
        "Export z platobnej brány ako bankový výpis — platby, poplatky a výbery na účet zvlášť.",
      icon: ArrowLeftRight,
      blocks: [
        {
          type: "lead",
          text: "Kto predáva cez e-shop, má peniaze najprv na bráne a až potom na účte. Nahrajte export z brány a Faktero z neho spraví výpis, aký by poslala banka — bez prepisovania riadok po riadku.",
        },
        {
          type: "bullets",
          title: "Čo z exportu vznikne",
          items: [
            "Platby zákazníkov s variabilným symbolom z čísla objednávky",
            "Poplatky brány ako samostatné výdavky",
            "Výbery na bankový účet ako prevod medzi vlastnými účtami",
            "Platby sa spárujú s faktúrami — aj s tými, ktoré vystavil doplnok pre WooCommerce",
            "Pre účtovníčku dávka do Pohody alebo SEPA XML (camt.053)",
          ],
        },
        {
          type: "section",
          title: "Ktoré brány",
          body: "Stripe, PayPal, GoPay, Comgate, Barion, Mollie a Packeta — stačí CSV export z ich administrácie; ostatné brány cez všeobecnú šablónu. Nájdete to v Účtovníctvo → Výpis z platobnej brány.",
        },
      ],
    },
    {
      slug: "hromadny-prikaz",
      label: "Hromadný príkaz na úhradu",
      summary: "Prijaté faktúry zaplatíte naraz jedným súborom pre internetbanking.",
      icon: Send,
      blocks: [
        {
          type: "lead",
          text: "Označte prijaté faktúry a stiahnite SEPA XML. V internetbankingu ho nahráte ako hromadný príkaz — prijme ho každá slovenská aj česká banka.",
        },
        {
          type: "bullets",
          items: [
            "Variabilný, špecifický a konštantný symbol tak, ako ich dodávateľ uvidí vo výpise",
            "Platba hneď alebo každá faktúra až v deň splatnosti",
            "Výber účtu, z ktorého sa platí",
            "Faktúry bez IBAN-u, už zaplatené či v inej mene nepustí — a povie prečo",
            "Súbor overený proti oficiálnej schéme ISO 20022 aj pravidlám SEPA",
          ],
        },
      ],
    },
    {
      slug: "vyuctovanie-vydavkov",
      label: "Vyúčtovanie výdavkov",
      summary: "Výdavky, ktoré zaplatil zamestnanec, v jednom súhrne na podpis.",
      icon: Receipt,
      blocks: [
        {
          type: "lead",
          text: "Zamestnanec tankoval, nakúpil materiál či zaplatil hotel. Bločky a faktúry označíte, Faktero z nich spraví vyúčtovanie s výsledkom a PDF na podpis.",
        },
        {
          type: "bullets",
          items: [
            "Tri typy: vyúčtovanie poskytnutej zálohy, vlastných zdrojov zamestnanca a firemnej debetnej karty",
            "Výsledok jednou vetou — koľko firma doplatí alebo zamestnanec vráti",
            "Nové vyúčtovanie alebo pridanie do existujúceho priamo zo zoznamu bločkov a prijatých faktúr",
            "Účtovné nastavenia (predkontácia, členenie DPH, dátum) sa doplnia dokladom",
            "Bloček ide do Pohody ako interný doklad, nie z firemnej pokladne; faktúru zaplatenú zamestnancom hromadný príkaz vynechá",
          ],
        },
      ],
    },
    {
      slug: "vlastna-emailova-adresa",
      label: "Odosielanie z vašej adresy",
      summary: "Faktúry a upomienky z faktury@vasafirma.sk cez váš poštový server.",
      icon: Mail,
      blocks: [
        {
          type: "lead",
          text: "Odberateľ dostane faktúru z vašej firemnej adresy, nie z cudzej služby. Nastavíte to raz v údajoch firmy.",
        },
        {
          type: "bullets",
          items: [
            "Faktúry, upomienky, cenové ponuky, samofaktúry aj podklady pre účtovníka",
            "Gmail, Microsoft 365, WebSupport, Seznam či server vašej domény",
            "Zapne sa až po úspešnom skúšobnom maile; heslo je uložené zašifrované",
            "Keď váš server zlyhá, mail aj tak odíde a chyba sa ukáže v nastaveniach",
          ],
        },
      ],
    },
    {
      slug: "samofakturacia",
      label: "Samofakturácia",
      summary: "Faktúru za dodávateľa vyhotovíte vy, on ju jedným klikom odsúhlasí.",
      icon: ListChecks,
      blocks: [
        {
          type: "lead",
          text: "Výkup od drobných dodávateľov, provízie obchodných zástupcov, honoráre autorov — faktúru vyhotovíte za dodávateľa podľa § 72 ods. 4 zákona o DPH a on ju odsúhlasí cez odkaz v e-maile, bez registrácie.",
        },
        {
          type: "bullets",
          items: [
            "Dohoda o samofakturácii pri kontakte v adresári — bez platnej dohody faktúru vyhotoviť nedá",
            "Vlastný číselný rad SF, v hlavičke dodávateľ s jeho IČ DPH a sadzbami, veta „Vyhotovenie faktúry odberateľom“",
            "Dodávateľ dostane PDF a odkaz: Súhlasím, alebo vráti s poznámkou na opravu",
            "Odsúhlasená sa sama stane prijatou faktúrou — DPH na vstupe, kontrolný výkaz, úhrada z banky",
            "Neodsúhlasená do výkazov ani do príkazu na úhradu nepustí",
            "Prenesenie DPH (šrot, stavebné práce, dodávateľ z EÚ), cudzia mena s kurzom ECB, zľavy, zúčtovanie zálohy a dobropis",
            "Výkup tovaru jedným klikom na sklad, dodávateľ odsúhlasuje v slovenčine, češtine, angličtine, nemčine aj maďarčine",
          ],
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
            "Priame napojenie na Tatra banku, Revolut Business, Wise a Wallester, pre ostatné banky import výpisu",
            "Výpisy z platobných brán (Stripe, PayPal, GoPay, Comgate, Barion, Mollie, Packeta) ako ďalší účet",
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
            "Nezaplatené faktúry: oprava odpočtu po 101. dni (§ 53b) doplnená sama, opravný doklad pri nevymožiteľnej pohľadávke (§ 25a) jedným klikom",
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
      slug: "vozovy-park",
      label: "Vozový park",
      summary:
        "Technické preukazy, vlastníctvo, leasing, poistky a termíny STK všetkých vozidiel firmy.",
      icon: MapPin,
      blocks: [
        {
          type: "lead",
          text: "Všetky papiere k firemným autám na jednom mieste. Nahráte technický preukaz a údaje vozidla sa vyplnia samé.",
        },
        {
          type: "bullets",
          items: [
            "Údaje vozidla vyčítané z fotky technického preukazu",
            "Vlastníctvo: vlastné, leasing, úver, prenájom alebo súkromné auto",
            "Prepojenie so zmluvou o leasingu a splátkovým kalendárom",
            "Upozornenie na STK, emisnú kontrolu, PZP, havarijné poistenie a diaľničnú známku 30 dní vopred",
            "Tie isté vozidlá ako v Knihe jázd",
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
          body: "Prepojenie nastavíte raz a Faktero si potom sťahuje jazdy automaticky na pozadí. Netreba k tomu žiadny API kľúč — stačia prihlasovacie údaje, ktorými sa do Commandera hlásite.",
        },
        {
          type: "bullets",
          title: "Postup krok za krokom",
          items: [
            "1. Vo Faktere prejdite do Jazdy → Integrácie → Commander GPS.",
            "2. Vyplňte Commander username a Commander password. Uložia sa šifrovane a používajú sa iba na serveri.",
            "3. Zapnite Integrácia aktívna a Automaticky synchronizovať jazdy denne a uložte.",
            "4. Kliknite na Synchronizovať vozidlá — natiahnu sa vozidlá z Commandera.",
            "5. V tabuľke Prepojené vozidlá ku každému vozidlu z Commandera vyberte zodpovedajúce vozidlo vo Faktere. Neprepojené vozidlá sa pri importe preskočia.",
            "6. V časti Importovať jazdy zvoľte obdobie (dnes, týždeň, mesiac, posledných 30 dní alebo vlastný rozsah) a kliknite Synchronizovať jazdy.",
            "7. Ďalšie jazdy sa už sťahujú samy — každú noc okolo tretej ráno.",
          ],
        },
        {
          type: "section",
          title: "Ako to funguje",
          body: "Faktero sa v noci spojí s Commander GPS, stiahne jazdy za uplynulé obdobie a zapíše ich do knihy jázd k tomu vozidlu, na ktoré je vozidlo z Commandera prepojené. Duplicity sa filtrujú podľa ID jazdy z Commandera, takže opakovaná synchronizácia nikdy nevytvorí ten istý záznam dvakrát. Kilometre sa premietnu do prehľadu knihy jázd a — ak je jazda priradená na zákazku — aj do jej nákladov.",
        },
        {
          type: "bullets",
          title: "Čo uvidíte v Jazdy → Integrácie → Commander GPS",
          items: [
            "Stav prepojenia a poslednú chybu, ak nejaká nastala",
            "Dátum a čas poslednej úspešnej synchronizácie",
            "Tabuľku Prepojené vozidlá: vozidlo z Commandera, jeho EČV a výber vozidla vo Faktere",
            "Voľbu obdobia pre ručný import jázd vrátane vlastného rozsahu",
            "Tlačidlá Synchronizovať vozidlá a Synchronizovať jazdy pre okamžité spustenie",
            "Znovu importovať preskočené — druhý pokus o jazdy, ktoré sa pri importe preskočili",
            "Históriu synchronizácií s počtom načítaných, importovaných a preskočených jázd",
            "Tlačidlo Odpojiť (prihlasovacie údaje sa zmažú, jazdy v knihe jázd zostávajú)",
          ],
        },
        {
          type: "callout",
          title: "Bezpečnosť",
          body: "Prihlasovacie údaje do Commandera sú uložené šifrovane, nikdy sa nevracajú do prehliadača a používajú sa výhradne na čítanie jázd vašej firmy. Integráciu viete kedykoľvek odpojiť jedným klikom — jazdy, ktoré sa už stiahli, ostanú v knihe jázd.",
        },
      ],
    },
    {
      slug: "palivove-karty",
      label: "Palivové karty",
      summary:
        "Nákupy kartou Shell a Up Déjeuner: tankovania k vozidlám a mesačná faktúra ako prijatá faktúra s rozpisom.",
      icon: CreditCard,
      manual: "/pomoc/vozovy-park",
      blocks: [
        {
          type: "lead",
          text: "Tankovania z palivových kariet netreba prepisovať z bločkov. Faktero ich načíta z vydavateľa karty, priradí k vozidlám a z mesačnej faktúry urobí prijatú faktúru.",
        },
        {
          type: "bullets",
          items: [
            "Shell Card cez API Shellu: transakcie, tankovania s tachometrom a mesačné faktúry",
            "Up Déjeuner (Shell karta od Up): nahratie mesačného výpisu v CSV, XLSX alebo PDF",
            "Karta sa k vozidlu priradí podľa ŠPZ, inak ju priradíte raz ručne",
            "Tankovania idú rovno do knihy jázd a nákladov vozidla",
            "Bloček z pumpy s rovnakým dňom a sumou sa označí, aby sa náklad a DPH nezaúčtovali dvakrát",
            "Opakované načítanie ani nahratie toho istého výpisu nič nezdvojí",
          ],
        },
        {
          type: "callout",
          title: "Prístup k API",
          body: "Prístup k API Shell vydáva Shell na požiadanie (client ID a client secret). Up Déjeuner verejné API nemá, preto sa jeho výpis nahráva.",
        },
      ],
    },
    {
      slug: "gps-systemy",
      label: "GPS systémy v knihe jázd",
      summary:
        "Jazdy z GPS Dozoru, Webdispečinku, Webfleetu, Traccaru, Geotabu, Samsary či Wialonu sa zapisujú do knihy jázd samy.",
      icon: MapPin,
      manual: "/pomoc/jazdy",
      blocks: [
        {
          type: "lead",
          text: "Ak máte vo vozidlách GPS jednotku, kniha jázd sa vyplní z nej. Prepojenie nastavíte raz v Jazdy → Integrácie.",
        },
        {
          type: "bullets",
          items: [
            "GPS Dozor, Webdispečink, Webfleet, Traccar, Geotab, Samsara a Wialon (popri Commander GPS a Tesle)",
            "Vozidlá z GPS systému spárujete s vozidlami vo Fakteri alebo ich jedným klikom založíte",
            "Jazdy s adresami a nadväzujúcim tachometrom, opakovaná synchronizácia bez duplicít",
            "Súkromná jazda ostane súkromná aj po ďalšej synchronizácii",
            "Prihlasovacie údaje sú uložené šifrovane a používajú sa len na serveri",
          ],
        },
      ],
    },
    {
      slug: "transeu",
      label: "Trans.eu pre dopravcov",
      summary:
        "Prepravná objednávka z Trans.eu sa jedným klikom zmení na objednávku a faktúru a PDF faktúry sa pošle späť do Trans.eu.",
      icon: Truck,
      manual: "/pomoc/prepojenia",
      blocks: [
        {
          type: "lead",
          text: "Dopravca, ktorý berie zákazky na Trans.eu, ich nemusí prepisovať. Prijaté prepravné objednávky sa stiahnu do Faktera a faktúra k nim vznikne jedným klikom.",
        },
        {
          type: "bullets",
          items: [
            "Prihlásenie do Trans.eu cez Nastavenia → Trans.eu",
            "Prijatá objednávka so zákazníkom podľa IČ DPH, trasou a cenou",
            "Faktúra s návrhom režimu DPH pre prepravu (zákazník z EÚ s prenesením daňovej povinnosti)",
            "PDF faktúry sa pošle späť k objednávke v Trans.eu",
            "Tá istá objednávka nikdy nedostane druhú faktúru",
          ],
        },
      ],
    },
    {
      slug: "leasingy-a-uvery",
      label: "Leasingy a úvery",
      summary:
        "Splátkový kalendár s rozpadom na istinu, úrok a DPH — a platby si nájde v banke sám.",
      icon: Banknote,
      blocks: [
        {
          type: "lead",
          text: "Že vám odišla splátka, viete z výpisu. Účtovníčka potrebuje vedieť, koľko z nej bola istina, koľko úrok a koľko DPH — a to Faktero spočíta za vás.",
        },
        {
          type: "bullets",
          title: "Čo dostanete",
          items: [
            "Celý splátkový kalendár s istinou, úrokom, DPH a zostatkom istiny na každom riadku",
            "Načítanie zmluvy priamo z PDF — aj zmluva a splátkový kalendár v dvoch súboroch naraz",
            "Prevzatie kalendára zo zmluvy, keď je v dokumente uvedený; inak výpočet anuity",
            "Automatické párovanie odchádzajúcich platieb z banky so splátkami",
            "Súčet Zostáva splatiť za všetky aktívne zmluvy na jednom mieste",
          ],
        },
        {
          type: "section",
          title: "Prečo to sedí na cent",
          body: "Úrok sa počíta zo skutočného počtu dní v období (ACT/365), tak ako v slovenských bankách, a posledná splátka sa dorovnáva — súčet istín teda vyjde presne na financovanú sumu a v účtovníctve nezostane visieť rozdiel pár centov. Ak vaša zmluva počíta rovnakými mesiacmi, prepnete výpočet na 30/360.",
        },
        {
          type: "callout",
          title: "Radšej návrh než zlé priradenie",
          body: "Splátky sú každý mesiac rovnaké, takže sama suma na spárovanie nestačí — dva leasingy s podobnou splátkou by sa pomiešali. Automaticky sa páruje len platba s variabilným symbolom zmluvy alebo menom leasingovky a s presne sediacou sumou. Všetko ostatné dostanete ako návrh na jedno kliknutie.",
        },
      ],
    },
    {
      slug: "nemecko",
      label: "Firmy v Nemecku",
      summary:
        "Nemecká faktúra, ZUGFeRD a XRechnung, export do DATEV a prehľad UStVA pre firmy so sídlom v Nemecku.",
      icon: Flag,
      manual: "/pomoc/nemecko",
      blocks: [
        {
          type: "lead",
          text: "Pri založení firmy vyberiete krajinu Nemecko a Faktero sa prispôsobí: sadzby 19 % a 7 %, Steuernummer a USt-IdNr. namiesto DIČ a IČ DPH a doklady po nemecky.",
        },
        {
          type: "bullets",
          title: "Čo dostanete",
          items: [
            "Regelbesteuerung alebo Kleinunternehmer (§ 19 UStG) s upozornením, keď sa obrat blíži k hranici 25 000 € alebo 100 000 €",
            "Faktúra s náležitosťami podľa § 14 UStG a zákonnými vetami pre § 19, § 13b, dodanie do EÚ, vývoz a trojstranný obchod",
            "Registergericht, HRB a Geschäftsführer v päte faktúry",
            "Platobný QR kód GiroCode na faktúrach v eurách",
            "ZUGFeRD / Factur-X (EN 16931) vložené v PDF každej faktúry a XRechnung 3.0 na stiahnutie, s Leitweg-ID pre úrady",
            "E-mail s faktúrou a stránka faktúry pre odberateľa v jazyku dokladu",
            "Export zaúčtovaných dokladov do DATEV (Buchungsstapel, SKR03 alebo SKR04)",
            "Prehľad UStVA za mesiac alebo štvrťrok v CSV a PDF, so Soll- aj Ist-Versteuerung a termínom podania",
            "Zusammenfassende Meldung ako CSV pre BZStOnline-Portal",
            "Prepočet cudzej meny mesačným kurzom BMF podľa § 16 Abs. 6 UStG",
            "Rechnungskorrektur, upomienky s úrokmi podľa § 288 BGB a vety § 25a a § 14 Abs. 4 Nr. 9 UStG",
          ],
        },
        {
          type: "section",
          title: "Čo zatiaľ nie je",
          body: "Faktero UStVA ani ZM do ELSTER a BZSt neodosiela. Pokladňu (bez TSE), knihu jázd a mzdy zamestnancov pre nemecké firmy nemá. Nemecké banky sa zatiaľ pripojiť nedajú a e-faktúry sa neodosielajú cez Peppol — XML a PDF odošlete sami. Účty pre DATEV a prvé priznania odporúčame prejsť s daňovým poradcom.",
        },
      ],
    },
    {
      slug: "schvalovanie-dokladov",
      label: "Schvaľovanie dokladov",
      summary: "Kto čo schvaľuje, určíte vy — do účtovníctva a na úhradu ide len schválené.",
      icon: CheckCircle2,
      manual: "/pomoc/doklady",
      blocks: [
        {
          type: "lead",
          text: "Bločky, prijaté a vystavené faktúry, nespracované doklady aj vyúčtovania výdavkov môžu pred účtovníctvom prejsť schválením — jedným človekom alebo viacerými úrovňami.",
        },
        {
          type: "bullets",
          items: [
            "Schvaľovacie cesty podľa dodávateľa, sumy, predkontácie či druhu dokladu",
            "Schvaľovateľom môže byť aj manažér zákazky, na ktorej doklad je",
            "Povolenia pre každého zvlášť: schváliť, zrušiť schválenie, vrátiť na opravu, zamietnuť",
            "Suma, pod ktorou sa doklad schváli sám",
            "Vystavená faktúra môže odísť až po schválení — z webu, z appky aj cez API",
            "Do Pohody, do mesačného balíka a do príkazu na úhradu idú len schválené doklady",
            "Moje úlohy: na jednom mieste všetko, čo čaká práve na vás",
          ],
        },
      ],
    },
    {
      slug: "hromadne-akcie",
      label: "Hromadné akcie, stavy a štítky",
      summary: "Desiatky dokladov zaúčtujete, označíte a roztriedite naraz.",
      icon: ListChecks,
      manual: "/pomoc/doklady",
      blocks: [
        {
          type: "lead",
          text: "Označte doklady v zozname a Hromadná akcia im naraz nastaví, čo treba. Pod zoznamom pritom vidíte, koľko označené doklady stoja a čo z nich ešte čaká.",
        },
        {
          type: "bullets",
          items: [
            "Účtovná položka, typ platby, členenie DPH a KV, účtovná poznámka aj úhrada pre všetky označené",
            "Účtovná položka priamo v riadku zoznamu, s hľadaním",
            "Vlastné stavy dokladov („Čaká na doklad od klienta“) a štítky na triedenie",
            "Komentár pre kolegov, ktorý do účtovníctva nikdy neodíde",
            "Súčtová lišta: počet, suma s DPH aj bez, čo čaká na export a na úhradu",
            "Odovzdané a zamknuté doklady sa pri účtovných zmenách samy preskočia",
            "Preddefinované poznámky a e-mailové šablóny podľa typu dokladu a jazyka",
          ],
        },
      ],
    },
    {
      slug: "vynosy-a-naklady",
      label: "Výnosy a náklady",
      summary: "Koľko firma zarobila a minula, po mesiacoch a s bilanciou.",
      icon: BarChart3,
      manual: "/pomoc/faktury",
      blocks: [
        {
          type: "lead",
          text: "Na prehľade firmy je graf výnosov z vystavených faktúr a nákladov z prijatých faktúr a bločkov — aj s bilanciou za každý mesiac.",
        },
        {
          type: "bullets",
          items: [
            "Tento rok, minulý rok, posledných 12 mesiacov alebo vlastné obdobie",
            "Sumy s DPH aj bez DPH",
            "Uhradené zvlášť od očakávaného — neuhradené faktúry sú v stĺpci svetlejšie",
            "Zálohové faktúry sa nepočítajú, dobropisy odpočítavajú",
            "Doklady v cudzej mene prepočítané kurzom z dokladu",
          ],
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
    "REST API, webhooky, dokumentácia a skúšobné prostredie — automatizujte fakturáciu vašej platformy.",
  hubLead:
    "Faktero je API-first. Vystavujte faktúry, párujte platby a spravujte odberateľov priamo z vašej aplikácie.",
  items: [
    {
      slug: "rest",
      label: "REST API",
      summary: "JSON REST API s testovacím a ostrým režimom a idempotenciou cez external_id.",
      icon: Code2,
      blocks: [
        {
          type: "lead",
          text: "Plné REST API pre faktúry, ponuky, odberateľov a opakované faktúry.",
        },
        {
          type: "bullets",
          items: [
            "Bearer token autentifikácia (fk_test_ / fk_live_)",
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
      summary: "Udalosti v reálnom čase o faktúrach, platbách a chybách.",
      icon: Webhook,
      blocks: [
        { type: "lead", text: "Reagujte na zmeny v reálnom čase — bez neustáleho dopytovania." },
        {
          type: "bullets",
          items: [
            "Udalosti: invoice.created, invoice.paid, invoice.overdue, quote.accepted",
            "HMAC-SHA256 podpis pre overenie pôvodu",
            "Automatické opakované doručenie pri zlyhaní",
            "Záznam doručení s obsahom udalosti a odpoveďou",
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
      slug: "prijate-doklady-api",
      label: "API pre prijaté doklady",
      summary: "Prijaté faktúry a bločky so zaúčtovaním pre váš účtovný program.",
      icon: Code2,
      blocks: [
        {
          type: "lead",
          text: "Rovnaké dáta, aké si berie konektor Pohody, cez REST API: stiahnete doklady, doptáte sa na zmeny a odovzdané označíte.",
        },
        {
          type: "bullets",
          items: [
            "Prijaté faktúry a bločky s predkontáciou, členením DPH a KV",
            "Filter zmien od posledného stiahnutia, neodovzdaných a zaúčtovaných",
            "Detail s položkami a dočasným odkazom na sken",
            "Nahratie dokladu (PDF, fotka, XML) — Faktero ho prečíta a zaradí do Nespracovaných",
            "Pohyby na bankových účtoch",
          ],
        },
      ],
    },
    {
      slug: "playground",
      label: "Skúšobné prostredie",
      summary: "Interaktívne vyskúšanie API priamo z prehliadača.",
      icon: TerminalSquare,
      blocks: [
        { type: "lead", text: "Otestujte volania API bez písania kódu — priamo v prehliadači." },
        {
          type: "bullets",
          items: [
            "Predvyplnené príklady pre každý endpoint",
            "Testovací režim s realistickými dátami",
            "Generovanie ukážkového kódu",
            "História volaní a odpovedí",
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
    "Od 1.1.2027 bude eFaktúra povinná pre B2B transakcie na Slovensku. Vo Fakteri beží naostro už od októbra 2026.",
  hubLead:
    "Štrukturovaná elektronická faktúra (eFaktúra), Peppol sieť a Digitálny poštár — všetko, čo o tom potrebujete vedieť.",
  items: [
    {
      slug: "prehlad",
      label: "Prehľad eFaktúry",
      summary: "Čo je eFaktúra, koho sa týka a od kedy bude povinná.",
      icon: ShieldCheck,
      manual: "/pomoc/efaktura",
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
          body: "Od 1.1.2027 musí každý platiteľ DPH usadený na Slovensku vystavovať a prijímať eFaktúry pri tuzemských B2B transakciách (firma firme) a B2G (firma štátu). Rozhoduje registrácia na DPH, nie veľkosť firmy — týka sa to rovnako SZČO-platiteľa ako korporácie. Neplatiteľ DPH eFaktúry vystavovať nemusí, no prijať ich vedieť musí. Faktúry pre koncových spotrebiteľov (B2C) ostávajú v pôvodnom režime. Prechodné obdobie trvá do 30.6.2030; od 1.7.2030 sa podľa európskych pravidiel ViDA pridajú aj cezhraničné dodania v rámci EÚ.",
        },
        {
          type: "bullets",
          title: "Kľúčové fakty v kocke",
          items: [
            "Povinnosť B2B aj B2G od 1. januára 2027",
            "Štandard: UBL 2.1 / Peppol BIS 3.0 podľa EN 16931",
            "Doručenie cez sieť Peppol prostredníctvom digitálneho poštára — poskytovateľa doručovacej služby",
            "Dobropis ako CreditNote 381 s číslom pôvodnej faktúry (BT-25), samofaktúra cez Peppol",
            "PDF už nebude stačiť na uplatnenie nákladu a odpočtu DPH",
            "Hlásenie v reálnom čase do Finančnej správy",
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
          body: "Potrebujete softvér, ktorý vie vygenerovať validný XML podľa Peppol BIS 3.0, a digitálneho poštára — certifikovaného poskytovateľa doručovacej služby, ktorého si vyberiete na Portáli finančnej správy. Rovnako musíte byť schopní eFaktúry prijímať, spracovať a archivovať 10 rokov v pôvodnom XML formáte. Excel a ručné PDF skončili.",
        },
        {
          type: "callout",
          title: "eFaktúra vo Fakteri beží naostro",
          body: "Od 13. 10. 2026 Faktero eFaktúry odosiela aj prijíma cez sieť Peppol. Zapnete si ju na Portáli finančnej správy výberom Faktera ako poskytovateľa doručovacej služby — registráciu v sieti urobíme za vás. Za odoslanú eFaktúru neplatíte nič navyše.",
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
          body: "Peppol funguje podobne ako emailová sieť, ale pre štruktúrované obchodné dokumenty. Každá firma má v sieti svoju jedinečnú adresu — Peppol ID. Slovenská firma ho má zo schémy 0245 a svojho DIČ (napríklad 0245:2120123456). Faktúru odošlete cez svojho poskytovateľa, ten ju doručí poskytovateľovi príjemcu a ten ju vloží do účtovného systému príjemcu. Celý prenos trvá sekundy a je šifrovaný.",
        },
        {
          type: "section",
          title: "Štyrhranný model (4-corner model)",
          body: "Peppol využíva tzv. 4-corner model: odosielateľ (1) → odosielateľov Access Point (2) → príjemcov Access Point (3) → príjemca (4). Firmy si vyberú certifikovaného poskytovateľa a neriešia technické detaily protokolu. Faktero je napojené na certifikovaný prístupový bod — technickú stránku za vás rieši Faktero.",
        },
        {
          type: "bullets",
          title: "Výhody Peppolu",
          items: [
            "Identifikácia firiem cez jednotné Peppol ID",
            "Doručenie cez certifikovaného poskytovateľa (Access Point)",
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
      summary: "Kto vám doručuje eFaktúry a ako si ho vyberiete.",
      icon: Mail,
      manual: "/pomoc/efaktura",
      blocks: [
        {
          type: "lead",
          text: "Digitálny poštár je pomenovanie Finančnej správy SR pre certifikovaného poskytovateľa doručovacej služby — toho, kto vaše eFaktúry cez sieť Peppol odosiela a prijíma. Faktero je takým poskytovateľom.",
        },
        {
          type: "section",
          title: "Ako si digitálneho poštára vyberiete?",
          body: "Výber sa robí na Portáli finančnej správy v časti eFaktúra: zo zoznamu poskytovateľov zvolíte Faktero a potvrdíte. Finančná správa nám pošle údaje firmy a Faktero ju zaregistruje v sieti Peppol — zvyčajne do niekoľkých minút. Ak na portál prístup nemáte, urobí to za vás účtovník so splnomocnením; pozvánku mu pošlete priamo z Faktera.",
        },
        {
          type: "section",
          title: "Jeden poskytovateľ na firmu",
          body: "V sieti Peppol môže byť firma len u jedného poskytovateľa. Ak už máte iného, prechod do Faktera urobíme s migračným kódom, ktorý vám vydá súčasný poskytovateľ.",
        },
        {
          type: "bullets",
          title: "Čo Faktero ako digitálny poštár robí",
          items: [
            "Odosiela eFaktúry odberateľom cez sieť Peppol — s PDF faktúry aj prílohami",
            "Pred odoslaním overí, či je odberateľ v sieti Peppol",
            "Ukáže, kedy bola eFaktúra doručená",
            "Prijíma eFaktúry od dodávateľov a zaeviduje ich bez prepisovania",
            "Dobropisy, ťarchopisy aj samofaktúry posiela ako eFaktúru",
            "Bez poplatku za odoslanú eFaktúru",
          ],
        },
        {
          type: "callout",
          title: "Naostro od októbra 2026",
          body: "Faktero ako digitálny poštár beží naostro od 13. 10. 2026 — pred povinnosťou od 1. 1. 2027. Ako eFaktúru zapnúť, nájdete v Pomoci.",
        },
      ],
    },
    {
      slug: "kontrola-efaktury",
      label: "Kontrola e-faktúry",
      summary:
        "Skontrolujte XML e-faktúry podľa EN 16931 a Peppol BIS 3.0 — zadarmo, aj bez registrácie.",
      icon: FileCheck2,
      manual: "/pomoc/efaktura",
      blocks: [
        {
          type: "lead",
          text: "Máte XML e-faktúry od dodávateľa alebo z iného programu a neviete, či prejde? Nahrajte ho na stránke faktero.sk/nastroje/kontrola-efaktury a hneď uvidíte, čo je v ňom zle.",
        },
        {
          type: "bullets",
          items: [
            "Chyby a varovania podľa EN 16931, Peppol BIS 3.0 a slovenských pravidiel",
            "Pri každej chybe kód pravidla (napríklad BR-CO-15) a miesto v súbore",
            "Súbor sa kontroluje len vo vašom prehliadači, nikam sa neposiela",
            "Bez prihlásenia na verejnej stránke, vo Fakteri v eFaktúra → Kontrola XML",
          ],
        },
      ],
    },
    {
      slug: "nemecko-xrechnung-zugferd",
      label: "Nemecko: XRechnung a ZUGFeRD",
      summary: "E-faktúra pre firmy so sídlom v Nemecku — PDF s vloženým XML aj čisté XRechnung.",
      icon: Flag,
      manual: "/pomoc/nemecko",
      blocks: [
        {
          type: "lead",
          text: "V Nemecku musí od roku 2025 každá firma vedieť e-faktúru prijať a povinnosť ju vystavovať nabieha postupne do roku 2028. Pre firmu so sídlom v Nemecku vyrobí Faktero oba bežné formáty.",
        },
        {
          type: "bullets",
          items: [
            "ZUGFeRD / Factur-X (profil EN 16931): XML vložené do PDF každej faktúry, nič sa nezapína",
            "XRechnung 3.0 (UBL) na stiahnutie z detailu faktúry",
            "Leitweg-ID pri odberateľovi pre faktúry úradom",
            "Kontrola pred vydaním — keď niečo povinné chýba, Faktero povie čo",
          ],
        },
        {
          type: "section",
          title: "Odoslanie",
          body: "Faktero nemecké e-faktúry nevysiela cez Peppol ani na portály úradov. PDF so ZUGFeRD pošlete e-mailom ako doteraz, XRechnung odošlete alebo nahráte sami.",
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
  hubHeadline: "Účtovné podklady jedným klikom",
  hubDescription:
    "Pohoda export aj konektor, sedem formátov exportu vrátane DATEV, pravidlá účtovania, konvertor z Excelu, výpisy z platobných brán a mesačné podklady — Faktero pripraví všetko, čo potrebujete.",
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
            "Nastavenia exportu pre firmu: dátum zápisu a odpočtu DPH, text dokladu, interná poznámka, partner do adresára",
            "Zaokrúhlenie zvlášť kladné a záporné, s vlastnou predkontáciou a členením",
            "Partner bez IČO dostane stály náhradný identifikátor, takže sa v adresári Pohody nezdvojí",
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
            "Príjemky a výdajky, aby v Pohode sedeli aj stavy skladu",
            "Doklad sa nezaloží dvakrát, ani keď príde z dvoch strán",
            "Funguje so všetkými radami Pohody",
          ],
        },
      ],
    },
    {
      slug: "uctovne-exporty",
      label: "Osem účtovných exportov",
      summary:
        "Pohoda, Omega, Money S3, ABRA Flexi, MRP, DATEV, ISDOC a CSV — vyberiete program a stiahnete.",
      icon: Upload,
      blocks: [
        {
          type: "lead",
          text: "Faktúry za zvolené obdobie v tvare, aký čaká váš účtovný program. Formáty sú overené proti schémam výrobcov, nie len „nejako poskladané“.",
        },
        {
          type: "bullets",
          items: [
            "Pohoda XML a priame prepojenie, ktoré si doklady berie samo",
            "KROS Omega (TXT) a Money S3 (XML) vrátane faktúr v cudzej mene",
            "ISDOC pre české programy, ABRA Flexi XML a MRP-K/S XML",
            "DATEV Buchungsstapel pre klientov so sídlom v Nemecku — SKR03 alebo SKR04, menej bežné účty treba overiť s daňovým poradcom",
            "CSV súpiska pre Helios, Premier alebo Excel",
            "Zálohové faktúry, dobropisy a zľavy rozpočítané správne v každom formáte",
          ],
        },
      ],
    },
    {
      slug: "pravidla-uctovania",
      label: "Automatické účtovanie",
      summary:
        "Bloček, prijatá aj vystavená faktúra či pohyb v banke sa zaúčtuje sám — predkontácia, členenie DPH aj KV.",
      icon: ListChecks,
      blocks: [
        {
          type: "lead",
          text: "„Keď je dodávateľ Slovnaft, doplň predkontáciu PHM a kategóriu Palivo“. Pravidlo nastavíte raz a zaberie pri každom novom doklade.",
        },
        {
          type: "bullets",
          items: [
            "Pre bločky, prijaté aj vystavené faktúry a bankové pohyby",
            "Podmienky: partner, IČO, typ faktúry, spôsob úhrady, kto doklad nahral, predmet aj odosielateľ mailu, krajina dodávateľa a stály variabilný symbol; pri banke účet, smer, typ pohybu a VS",
            "Doplní predkontáciu a členenie DPH pre Pohodu, členenie KV, kategóriu, odpočet DPH a poznámku, pri bločku aj pokladňu a rozúčtovanie pomerom",
            "Pravidlo vytvoríte jedným klikom priamo z dokladu alebo z bankového pohybu",
            "Predlohy: pomenované zaúčtovanie (napr. „Nákup PHM – platba kartou“), ktoré pri doklade vyberiete jedným klikom",
            "Bankový pohyb bez dokladu (poplatok, mzda, odvod) pravidlo vybaví hneď, ako príde z banky",
            "Zaberie pri skene na webe aj v appke, pri doklade z e-mailu aj z importu",
            "Dopĺňa len prázdne políčka — čo vyplní človek, neprepíše",
            "Jedným klikom ho uplatníte aj na doklady, ktoré už vo Fakteri sú",
          ],
        },
      ],
    },
    {
      slug: "konvertor-excel-pohoda",
      label: "Konvertor z Excelu do Pohody",
      summary: "Doklady vyplnené v Exceli stiahnete ako dávku XML pre Pohodu.",
      icon: FileSpreadsheet,
      manual: "/pomoc/pohoda",
      blocks: [
        {
          type: "lead",
          text: "Klient vedie faktúry či bločky v tabuľke? Stiahnite šablónu, vyplňte ju v Exceli a nahrajte späť — Faktero z nej poskladá XML pre Pohodu s predkontáciami a nastaveniami firmy.",
        },
        {
          type: "bullets",
          items: [
            "Šablóny pre vydané faktúry, prijaté faktúry a bločky",
            "Riadky s rovnakým číslom dokladu sa spoja do jedného dokladu",
            "Do Faktera sa nič neukladá — XML sa len stiahne a naimportujete ho v Pohode",
          ],
        },
      ],
    },
    {
      slug: "rozdelovac-dokladov",
      label: "Jedna adresa pre všetkých klientov",
      summary: "Doklady z jedného mailu či nahratia sa samy rozdelia medzi firmy.",
      icon: Building2,
      manual: "/pomoc/doklady",
      blocks: [
        {
          type: "lead",
          text: "Účtovníčka s desiatkami klientov si nemusí pamätať adresu každej firmy. Doklady pošle na jednu osobnú adresu alebo ich nahrá v Správe firiem — a každý skončí v Nespracovaných tej firmy, na ktorú je vystavený.",
        },
        {
          type: "bullets",
          items: [
            "Firma podľa IČO, IČ DPH či DIČ odberateľa, až potom podľa IBAN-u alebo názvu",
            "Jeden mail môže rozdeliť faktúry aj medzi viac firiem",
            "Vyberá sa len z firiem, v ktorých smiete upravovať doklady",
            "Čo nesedí práve na jednu firmu, počká v Nepriradených dokladoch — nič sa nezaradí naslepo",
          ],
        },
      ],
    },
    {
      slug: "banka-bez-dokladu",
      label: "Banka bez zbytočného párovania",
      summary: "Poplatky, mzdy, odvody a transakčná daň vybavené raz a navždy.",
      icon: Landmark,
      manual: "/pomoc/banka",
      blocks: [
        {
          type: "lead",
          text: "Nie každý pohyb na účte má doklad. Faktero ich od nespárovaných oddelí, aby ste v zozname videli len to, čo naozaj treba doriešiť.",
        },
        {
          type: "bullets",
          items: [
            "Pohyb nemá doklad — poplatok, mzda či odvod aj s poznámkou",
            "Transakčnú daň Faktero spozná samo a vo výpise do Pohody dostane vlastnú predkontáciu",
            "Pravidlo z pohybu (IBAN, smer, VS) vybaví každý ďalší taký pohyb hneď po príchode",
            "Detail pohybu so všetkými spárovanými dokladmi a súčtom",
            "Odkedy sa pohyby sťahujú a párujú automaticky, nastavíte sami",
          ],
        },
      ],
    },
    {
      slug: "vypisy-platobnych-bran",
      label: "Výpisy z platobných brán",
      summary: "Export zo Stripe, PayPal, GoPay, Comgate či Barionu ako bankový výpis do Pohody.",
      icon: ArrowLeftRight,
      blocks: [
        {
          type: "lead",
          text: "Brána je pre účtovníctvo samostatný účet. Faktero z jej exportu spraví výpis, aký by poslala banka — a nikto ho už neprepisuje riadok po riadku.",
        },
        {
          type: "bullets",
          items: [
            "Každá platba zákazníka ako príjem s variabilným symbolom z čísla objednávky",
            "Poplatok brány ako samostatný výdaj s vlastnou predkontáciou",
            "Výber na bankový účet ako prevod medzi vlastnými účtami",
            "Do Pohody ako dávka dokladov alebo SEPA XML (camt.053)",
            "Ten istý export uložený vo Fakteri spáruje platby s faktúrami",
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
      summary: "Prepojenia s ďalšími účtovnými softvérmi.",
      icon: Plug,
      blocks: [
        {
          type: "lead",
          text: "Okrem Pohody vieme prevziať dáta z Money S3, Omegy, KROSu, iDokladu, SuperFaktúry aj Doklada, vystaviť faktúry z e-shopu a prečítať výpisy platobných brán — a čokoľvek ďalšie sa dá cez REST API.",
        },
        {
          type: "bullets",
          items: [
            "Money S3 (Seyfor) — XML dátový balík MoneyData",
            "Omega a KROS — CSV alebo XML, vrátane kódovania Windows-1250",
            "iDoklad — CSV alebo XLSX zo zoznamu faktúr",
            "SuperFaktúra — ZIP s ISDOC dokladmi",
            "Pohoda — export XML aj konektor a bankový výpis",
            "Doklado — prijaté doklady zo XML, CSV aj ZIP so skenmi",
            "Export do Pohody, Omegy, Money S3, ABRA Flexi, MRP, DATEV, ISDOC a CSV",
            "WooCommerce — doplnok, ktorý vystaví faktúru z každej objednávky",
            "Stripe, PayPal, GoPay, Comgate, Barion, Mollie, Packeta — výpisy z platobných brán",
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
