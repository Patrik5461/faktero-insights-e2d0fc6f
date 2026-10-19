// Nemecký preklad manuálu v Pomoci (src/routes/pomoc.sklad.tsx). Kľúče vyrába pomoc-preklad.test.tsx.
export default {
  "Pomoc — Sklad — Faktero": "Nápověda — Sklad — Faktero",
  "Skladové karty, príjem a výdaj, vážená nákupná cena, rezervácie, prevody medzi skladmi, dodacie listy, inventúra, minimálne zásoby a automatický odpočet pri faktúre.":
    "Skladové karty, příjem a výdej, vážená nákupní cena, rezervace, převody mezi sklady, dodací listy, inventura, minimální zásoby a automatický odpis při faktuře.",
  "Kompletný manuál k skladu vo Faktere.": "Kompletní manuál ke skladu ve Fakteru.",
  "Sklad vo Faktere": "Sklad ve Fakteru",
  "Čo sklad vie, ako sa v ňom pracuje a kde sa najčastejšie robia chyby. Sklad je prepojený s faktúrami, zákazkami aj objednávkami — tovar sa odpisuje sám.":
    "Co sklad umí, jak se v něm pracuje a kde se nejčastěji dělají chyby. Sklad je propojený s fakturami, zakázkami i objednávkami — zboží se odepisuje samo.",
  "Čo sklad robí": "Co sklad dělá",
  "Sklad vo Faktere odpovedá na tri otázky: <0>čo mám</0>, <1>koľko to stálo</1> a <2>kam sa to podelo</2>. Nie je to samostatná evidencia vedľa fakturácie — je to tá istá evidencia. Keď vystavíte faktúru na skladovú položku, tovar sa odpíše sám.":
    "Sklad ve Fakteru odpovídá na tři otázky: <0>co mám</0>, <1>kolik to stálo</1> a <2>kam se to podělo</2>. Není to samostatná evidence vedle fakturace — je to tatáž evidence. Když vystavíte fakturu na skladovou položku, zboží se odepíše samo.",
  "Konkrétne sklad vie:": "Konkrétně sklad umí:",
  "viesť skladové karty so stavom, nákupnou a predajnou cenou,":
    "vést skladové karty se stavem, nákupní a prodejní cenou,",
  "evidovať príjem, výdaj, opravu a inventúrny rozdiel — každý pohyb s dátumom, cenou a poznámkou,":
    "evidovat příjem, výdej, opravu a inventurní rozdíl — každý pohyb s datem, cenou a poznámkou,",
  "počítať <0>váženú nákupnú cenu</0>, takže viete, akú maržu ste na predaji naozaj dosiahli,":
    "počítat <0>váženou nákupní cenu</0>, takže víte, jakou marži jste na prodeji skutečně dosáhli,",
  "odpisovať tovar automaticky pri odoslaní faktúry a vracať ho pri dobropise,":
    "odepisovat zboží automaticky při odeslání faktury a vracet ho při dobropisu,",
  "rezervovať tovar na ponuku alebo prijatú objednávku,":
    "rezervovat zboží na nabídku nebo přijatou objednávku,",
  "presúvať tovar medzi viacerými skladmi,": "přesouvat zboží mezi více sklady,",
  "vystavovať dodacie listy,": "vystavovat dodací listy,",
  "strážiť minimálne zásoby a pripraviť objednávku u dodávateľa,":
    "hlídat minimální zásoby a připravit objednávku u dodavatele,",
  "robiť inventúru a rozdiel zaúčtovať,": "dělat inventuru a rozdíl zaúčtovat,",
  "priradiť výdaj na zákazku, aby bolo vidieť skutočný náklad práce.":
    "přiřadit výdej k zakázce, aby byl vidět skutečný náklad práce.",
  "Skladové karty a sledovanie stavu": "Skladové karty a sledování stavu",
  "Kliknutím na ikonu dokumentu pri položke sa otvorí <0>skladová karta</0>: pohyby od začiatku, rezervácie, priemerná aj posledná nákupná cena a export pohybov do CSV.":
    "Kliknutím na ikonu dokumentu u položky se otevře <0>skladová karta</0>: pohyby od začátku, rezervace, průměrná i poslední nákupní cena a export pohybů do CSV.",
  "Karta vzniká v <0>Sklad → Skladové položky</0>. Má SKU, názov, mernú jednotku, nákupnú a predajnú cenu, prípadne čiarový kód, umiestnenie a fotku.":
    "Karta vzniká v <0>Sklad → Skladové položky</0>. Má SKU, název, měrnou jednotku, nákupní a prodejní cenu, případně čárový kód, umístění a fotku.",
  "Najdôležitejší prepínač je <0>Sledovať stav</0>. Iba pri zapnutom sledovaní pohyby menia množstvo a Faktero bráni tomu, aby stav klesol pod nulu. Služby a položky, ktoré na sklade nedržíte, nechajte bez sledovania — inak vám každá faktúra spadne na nedostatok zásoby.":
    "Nejdůležitější přepínač je <0>Sledovat stav</0>. Jen při zapnutém sledování pohyby mění množství a Faktero brání tomu, aby stav klesl pod nulu. Služby a položky, které skladem nedržíte, nechte bez sledování — jinak vám každá faktura spadne na nedostatku zásoby.",
  "Karta sa viaže na <0>produkt z katalógu</0> (<1>Produkty a služby</1>). Produkt je to, čo predávate a čo ide na faktúru — cena, merná jednotka, DPH. Karta je to isté z pohľadu skladu — SKU, nákupná cena, minimum, stav a pohyby. Služba má len produkt, tovar oboje.":
    "Karta se váže na <0>produkt z katalogu</0> (<1>Produkty a služby</1>). Produkt je to, co prodáváte a co jde na fakturu — cena, měrná jednotka, DPH. Karta je totéž z pohledu skladu — SKU, nákupní cena, minimum, stav a pohyby. Služba má jen produkt, zboží obojí.",
  "<0>Predajná cena je jedna.</0> Či ju zmeníte v katalógu alebo na karte, prepíše sa na oboch miestach. Iné ceny pre rôznych odberateľov alebo pri väčších množstvách sa nerobia druhou cenou na karte, ale v <1>cenníku a zľavách</1>.":
    "<0>Prodejní cena je jedna.</0> Ať ji změníte v katalogu, nebo na kartě, přepíše se na obou místech. Jiné ceny pro různé odběratele nebo při větších množstvích se nedělají druhou cenou na kartě, ale v <1>ceníku a slevách</1>.",
  "Tovar sa dá založiť z oboch strán: v katalógu zaškrtnutím <0>Sledovať sklad</0> (karta vznikne sama), alebo v Skladových položkách tlačidlom <1>Pridať tovar</1>, ktoré vytvorí naraz produkt aj kartu a vie hneď zapísať počiatočný stav.":
    "Zboží lze založit z obou stran: v katalogu zaškrtnutím <0>Sledovat sklad</0> (karta vznikne sama), nebo ve Skladových položkách tlačítkem <1>Přidat zboží</1>, které vytvoří najednou produkt i kartu a umí hned zapsat počáteční stav.",
  "Kartu, ktorú už nepoužívate, <0>archivujte</0>, nemažte. Mazanie by odstrihlo históriu pohybov, ktoré patria k starým faktúram.":
    "Kartu, kterou už nepoužíváte, <0>archivujte</0>, nemažte. Mazání by odstřihlo historii pohybů, které patří ke starým fakturám.",
  "Príjem, výdaj a oprava": "Příjem, výdej a oprava",
  "Pohyby nájdete v <0>Sklad → Pohyby</0>, nový sa zadáva cez <1>Príjem</1> a <2>Výdaj</2>. Rýchlejšie je to zo samotnej položky: v zozname skladových položiek má každý riadok tlačidlo <3>Naskladniť</3> a to isté nájdete v jej karte spolu s tlačidlom <4>Vydať</4>. Položka aj nákupná cena sú potom vopred vyplnené.":
    "Pohyby najdete v <0>Sklad → Pohyby</0>, nový se zadává přes <1>Příjem</1> a <2>Výdej</2>. Rychlejší je to ze samotné položky: v seznamu skladových položek má každý řádek tlačítko <3>Naskladnit</3> a totéž najdete v její kartě spolu s tlačítkem <4>Vydat</4>. Položka i nákupní cena jsou pak předvyplněné.",
  "<0>Stav na sklade sa nikde nezadáva ako číslo.</0> Je to súčet pohybov — inak by sa rozišiel s hodnotou skladu a chýbal by riadok, ktorý ho zmenil. Prvý stav zapíšete pri zakladaní tovaru (pole <1>Počiatočný stav</1>), potom ho meníte príjmom a výdajom a rozdiel oproti skutočnosti zrovnáte <2>inventúrou</2>.":
    "<0>Stav skladu se nikde nezadává jako číslo.</0> Je to součet pohybů — jinak by se rozešel s hodnotou skladu a chyběl by řádek, který ho změnil. První stav zapíšete při zakládání zboží (pole <1>Počáteční stav</1>), potom ho měníte příjmem a výdejem a rozdíl oproti skutečnosti srovnáte <2>inventurou</2>.",
  "<0>Príjem</0> — nákup tovaru. Zadajte množstvo a <1>nákupnú cenu za jednotku</1>. Bez nej sa nedá spočítať vážená cena a marža na faktúre bude nepravdivá.":
    "<0>Příjem</0> — nákup zboží. Zadejte množství a <1>nákupní cenu za jednotku</1>. Bez ní nelze spočítat váženou cenu a marže na faktuře bude nepravdivá.",
  "<0>Výdaj</0> — predaj mimo faktúry, spotreba na zákazke, škoda. Znižuje stav.":
    "<0>Výdej</0> — prodej mimo fakturu, spotřeba na zakázce, škoda. Snižuje stav.",
  "<0>Oprava</0> — ručná úprava so znamienkom, keď sa niečo zaevidovalo zle.":
    "<0>Oprava</0> — ruční úprava se znaménkem, když se něco zaevidovalo špatně.",
  "<0>Faktúra</0> a <1>dobropis</1> — tieto vytvára Faktero samo, ručne sa nezadávajú.":
    "<0>Faktura</0> a <1>dobropis</1> — ty vytváří Faktero samo, ručně se nezadávají.",
  "Pri výdaji môžete vybrať <0>zákazku</0>. Tovar sa potom objaví v jej nákladoch a vo vyhodnotení marže.":
    "Při výdeji můžete vybrat <0>zakázku</0>. Zboží se pak objeví v jejích nákladech a ve vyhodnocení marže.",
  "Vážená nákupná cena": "Vážená nákupní cena",
  "Faktero oceňuje sklad <0>váženým priemerom</0>. Keď kúpite 10 kusov po 4 € a neskôr 10 kusov po 6 €, karta má 20 kusov v priemernej cene 5 €. Každý ďalší výdaj berie túto priemernú cenu.":
    "Faktero oceňuje sklad <0>váženým průměrem</0>. Když koupíte 10 kusů po 4 € a později 10 kusů po 6 €, karta má 20 kusů v průměrné ceně 5 €. Každý další výdej bere tuto průměrnou cenu.",
  "Priemer sa prepočítava pri každom príjme, takže hodnota skladu v <0>Sklad → Hodnota</0> zodpovedá tomu, čo ste za tovar naozaj zaplatili — nie poslednej cene ani cenníkovej.":
    "Průměr se přepočítává při každém příjmu, takže hodnota skladu v <0>Sklad → Hodnota</0> odpovídá tomu, co jste za zboží skutečně zaplatili — ne poslední ceně ani ceníkové.",
  "<0>Pozor na pohyby bez ceny.</0> Ak sa pri starších pohyboch nákupná cena nevyplnila, ostanú bez ocenenia a v hodnote skladu chýbajú. Vyriešite to opravným pohybom alebo inventúrou s cenou.":
    "<0>Pozor na pohyby bez ceny.</0> Pokud se u starších pohybů nákupní cena nevyplnila, zůstanou bez ocenění a v hodnotě skladu chybí. Vyřešíte to opravným pohybem nebo inventurou s cenou.",
  "Automatický odpočet pri faktúre": "Automatický odpis při faktuře",
  "Keď na faktúru vyberiete položku, ktorá má skladovú kartu, a faktúra prejde do stavu <0>Odoslaná</0> alebo <1>Uhradená</1>, Faktero vytvorí pohyb typu <2>faktúra</2> a stav skladu sa zníži.":
    "Když na fakturu vyberete položku, která má skladovou kartu, a faktura přejde do stavu <0>Odeslaná</0> nebo <1>Uhrazená</1>, Faktero vytvoří pohyb typu <2>faktura</2> a stav skladu se sníží.",
  "Pri <0>dobropise</0> sa vytvorí opačný pohyb a tovar sa vráti na sklad — vrátane zákazky, na ktorú bol pôvodne vydaný.":
    "Při <0>dobropisu</0> se vytvoří opačný pohyb a zboží se vrátí na sklad — včetně zakázky, na kterou bylo původně vydáno.",
  "Kým je faktúra <0>koncept</0>, sklad sa nehýbe. Až odoslanie je moment, keď tovar odišiel.":
    "Dokud je faktura <0>koncept</0>, sklad se nehýbe. Teprve odeslání je okamžik, kdy zboží odešlo.",
  "Skladové položky odoslanej faktúry sa už nedajú meniť. Keby sa dali, stav skladu by prestal zodpovedať dokladom.":
    "Skladové položky odeslané faktury už nelze měnit. Kdyby to šlo, stav skladu by přestal odpovídat dokladům.",
  Rezervácie: "Rezervace",
  "Rezervácia drží tovar pre konkrétny doklad, aby ho medzitým niekto nepredal. Vzniká z <0>cenovej ponuky</0> alebo z <1>prijatej objednávky</1>, keď na nej zapnete <2>rezervovať tovar</2>.":
    "Rezervace drží zboží pro konkrétní doklad, aby ho mezitím někdo neprodal. Vzniká z <0>cenové nabídky</0> nebo z <1>přijaté objednávky</1>, když na ní zapnete <2>rezervovat zboží</2>.",
  "Rezervovaný kus stále leží na sklade, ale <0>dostupné množstvo</0> je o neho nižšie. Práve dostupné množstvo vidíte pri výbere položky na faktúru.":
    "Rezervovaný kus stále leží na skladě, ale <0>dostupné množství</0> je o něj nižší. Právě dostupné množství vidíte při výběru položky na fakturu.",
  "Rezervácia sa uvoľní, keď sa doklad vybaví, zruší alebo (pri ponuke) uplynie jej platnosť.":
    "Rezervace se uvolní, když se doklad vyřídí, zruší nebo (u nabídky) uplyne její platnost.",
  "Viac skladov a prevody": "Více skladů a převody",
  "Firma môže mať viac skladov — predajňu, dielňu, auto technika. Nastavujú sa v <0>Sklad → Nastavenia</0>.":
    "Firma může mít více skladů — prodejnu, dílnu, auto technika. Nastavují se v <0>Sklad → Nastavení</0>.",
  "Presun tovaru medzi nimi robte cez <0>Sklad → Presuny</0>, nie dvojicou výdaj + príjem. Prevod zachová ocenenie a v histórii je vidieť, že tovar firmu neopustil.":
    "Přesun zboží mezi nimi dělejte přes <0>Sklad → Přesuny</0>, ne dvojicí výdej + příjem. Převod zachová ocenění a v historii je vidět, že zboží firmu neopustilo.",
  "Dodacie listy": "Dodací listy",
  "Dodací list v <0>Sklad → Dodacie listy</0> je doklad o fyzickom odovzdaní tovaru. Používa sa vtedy, keď tovar odchádza skôr, než sa fakturuje — napríklad na stavbu.":
    "Dodací list v <0>Sklad → Dodací listy</0> je doklad o fyzickém předání zboží. Používá se tehdy, když zboží odchází dřív, než se fakturuje — například na stavbu.",
  "Dá sa vytlačiť ako PDF a odovzdať s tovarom.": "Lze ho vytisknout jako PDF a předat se zbožím.",
  "Minimálne zásoby a objednávky u dodávateľov": "Minimální zásoby a objednávky u dodavatelů",
  "Na karte nastavte <0>minimálny stav</0> a prípadne <1>optimálny stav</1>. Zoznam toho, čo je pod limitom, nájdete v <2>Sklad → Pod minimom</2>; upozornenie sa objaví aj na nástenke.":
    "Na kartě nastavte <0>minimální stav</0> a případně <1>optimální stav</1>. Seznam toho, co je pod limitem, najdete v <2>Sklad → Pod minimem</2>; upozornění se objeví i na nástěnce.",
  "Odtiaľ sa dá rovno pripraviť <0>objednávka u dodávateľa</0>. Faktero navrhne množstvo tak, aby ste sa dostali na optimálny stav. Príjem tovaru sa potom zapíše priamo na objednávku a tá si sama drží prehľad, čo z nej ešte neprišlo.":
    "Odtud lze rovnou připravit <0>objednávku u dodavatele</0>. Faktero navrhne množství tak, abyste se dostali na optimální stav. Příjem zboží se pak zapíše přímo na objednávku a ta si sama drží přehled, co z ní ještě nepřišlo.",
  "Inventúra porovná fyzický stav so stavom v systéme a rozdiel zaúčtuje.":
    "Inventura porovná fyzický stav se stavem v systému a rozdíl zaúčtuje.",
  "V <0>Sklad → Inventúra</0> založte novú inventúru.":
    "V <0>Sklad → Inventura</0> založte novou inventuru.",
  "Vyplňte spočítané množstvá pre každú kartu.": "Vyplňte spočítaná množství pro každou kartu.",
  "Po uzavretí Faktero vytvorí pohyby typu <0>inventúra</0> s rozdielom.":
    "Po uzavření Faktero vytvoří pohyby typu <0>inventura</0> s rozdílem.",
  "Inventúrny rozdiel <0>nevstupuje do nákladov zákazky</0> — je to oprava evidencie, nie spotreba materiálu.":
    "Inventurní rozdíl <0>nevstupuje do nákladů zakázky</0> — je to oprava evidence, ne spotřeba materiálu.",
  "Kategórie, import a export": "Kategorie, import a export",
  "Karty sa dajú triediť do <0>kategórií</0>. Pri väčšom sklade je to jediný spôsob, ako sa v ňom vyznať.":
    "Karty lze třídit do <0>kategorií</0>. U většího skladu je to jediný způsob, jak se v něm vyznat.",
  "Celý sklad naraz založíte cez <0>Sklad → Import</0> z CSV.":
    "Celý sklad najednou založíte přes <0>Sklad → Import</0> z CSV.",
  "Opačným smerom je <0>Export skladu CSV</0> v zozname skladových položiek. Súbor obsahuje SKU, názov, aktuálny a minimálny stav, nákupnú a predajnú cenu a hodnotu skladu. Je v UTF-8 so stredníkom ako oddeľovačom, takže sa otvorí v Exceli.":
    "Opačným směrem je <0>Export skladu CSV</0> v seznamu skladových položek. Soubor obsahuje SKU, název, aktuální a minimální stav, nákupní a prodejní cenu a hodnotu skladu. Je v UTF-8 se středníkem jako oddělovačem, takže se otevře v Excelu.",
  "Na čo si dať pozor": "Na co si dát pozor",
  "<0>Karta bez sledovania stavu</0> sa nikdy neodpíše. Ak vám stav „nič nerobí“, skontrolujte najprv tento prepínač.":
    "<0>Karta bez sledování stavu</0> se nikdy neodepíše. Pokud vám stav „nic nedělá“, zkontrolujte nejprve tento přepínač.",
  "<0>Príjem bez nákupnej ceny</0> pokazí váženú cenu aj maržu. Cenu doplňte hneď, spätne sa dohľadáva ťažko.":
    "<0>Příjem bez nákupní ceny</0> pokazí váženou cenu i marži. Cenu doplňte hned, zpětně se dohledává těžko.",
  "<0>Koncept faktúry sklad nehýbe.</0> Ak tovar odišiel, faktúru odošlite.":
    "<0>Koncept faktury se skladem nehýbe.</0> Pokud zboží odešlo, fakturu odešlete.",
  "<0>Presun medzi skladmi nerobte výdajom a príjmom</0> — pokazíte tým ocenenie aj históriu.":
    "<0>Přesun mezi sklady nedělejte výdejem a příjmem</0> — pokazíte tím ocenění i historii.",
  "<0>Uzamknuté obdobie</0> ( <1>uzávierka</1>) nepustí zmeny do starých dokladov. Ak sa pohyb nedá uložiť spätne, býva to práve toto.":
    "<0>Uzamčené období</0> ( <1>uzávěrka</1>) nepustí změny do starých dokladů. Pokud pohyb nelze uložit zpětně, bývá to právě tohle.",
  "Skladové karty do Pohody": "Skladové karty do Pohody",
  "Ak účtovníčka vedie sklad v Pohode, karty jej vieme posielať priamo — zapína sa to vo <0>Účtovníctvo → Prepojenie s Pohodou</0> a treba k tomu vyplniť členenie skladu.":
    "Pokud účetní vede sklad v Pohodě, karty jí umíme posílat přímo — zapíná se to v <0>Účetnictví → Propojení s Pohodou</0> a je k tomu třeba vyplnit členění skladu.",
  "Posiela sa <0>číselník zásob, nie stav skladu</0>. Množstvá v Pohode vznikajú príjemkami a výdajkami, takže dosadené číslo by sa s dokladmi rozišlo. Viac v <1>manuáli k Pohode</1>.":
    "Posílá se <0>číselník zásob, ne stav skladu</0>. Množství v Pohodě vznikají příjemkami a výdejkami, takže dosazené číslo by se s doklady rozešlo. Více v <1>manuálu k Pohodě</1>.",
} satisfies Record<string, string>;
