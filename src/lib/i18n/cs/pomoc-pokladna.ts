// Český preklad manuálu v Pomoci (src/routes/pomoc.pokladna.tsx). Kľúče vyrába pomoc-preklad.test.tsx.
export default {
  "Pomoc — Pokladňa a doklady — Faktero": "Nápověda — Pokladna a doklady — Faktero",
  "Pokladňa vo Faktere: stav hotovosti, pokladničné doklady, bločky, spôsob platby a načítanie eKasa QR kódu.":
    "Pokladna ve Fakteru: stav hotovosti, pokladní doklady, účtenky, způsob platby a načtení QR kódu eKasa.",
  "Pomoc · Pokladňa": "Nápověda · Pokladna",
  "Pokladňa, doklady a eKasa": "Pokladna, doklady a eKasa",
  "Koľko máte v hotovosti, odkiaľ sa to číslo berie a ako z bločku dostať údaje bez prepisovania.":
    "Kolik máte v hotovosti, odkud se to číslo bere a jak z účtenky dostat údaje bez přepisování.",
  "Čo pokladňa robí": "Co pokladna dělá",
  "<0>Pokladňa</0> odpovedá na otázku, koľko máte v hotovosti a ako sa k tomu číslu prišlo. Stav skladá z <1>dvoch zdrojov</1>:":
    "<0>Pokladna</0> odpovídá na otázku, kolik máte v hotovosti a jak se k tomu číslu došlo. Stav skládá ze <1>dvou zdrojů</1>:",
  "<0>pokladničné doklady</0> — vklady, výbery, tržby, ktoré nemajú vlastný doklad,":
    "<0>pokladní doklady</0> — vklady, výběry, tržby, které nemají vlastní doklad,",
  "<0>doklady zaplatené hotovosťou</0> z evidencie výdavkov (bločky).":
    "<0>doklady zaplacené hotově</0> z evidence výdajů (účtenky).",
  "Doklad zaplatený <0>kartou alebo prevodom</0> je výdavok, ale hotovosť neuberá. Toto rozlíšenie je jadro celého výpočtu — bez neho by pokladňa ukazovala mínus.":
    "Doklad zaplacený <0>kartou nebo převodem</0> je výdaj, ale hotovost neubírá. Toto rozlišení je jádrem celého výpočtu — bez něj by pokladna ukazovala mínus.",
  "Spôsob platby na doklade": "Způsob platby na dokladu",
  "Pri každom doklade v <0>Doklady → Nový doklad</0> vyberte <1>Platené</1>: hotovosťou, kartou alebo prevodom.":
    "U každého dokladu v <0>Doklady → Nový doklad</0> vyberte <1>Placeno</1>: hotově, kartou nebo převodem.",
  "Ak spôsob nevyplníte, Faktero berie doklad ako hotovostný — to je pri bločkoch najčastejší prípad. Keď vám pokladňa vychádza nižšie, než by mala, prvé miesto, kam sa pozrieť, sú doklady zaplatené kartou označené ako hotovostné.":
    "Pokud způsob nevyplníte, Faktero bere doklad jako hotovostní — to je u účtenek nejčastější případ. Když vám pokladna vychází nižší, než by měla, první místo, kam se podívat, jsou doklady zaplacené kartou označené jako hotovostní.",
  "Priamo v pokladni pridávate príjmy a výdaje, ktoré nemajú vlastný doklad — vklad majiteľa, odvod tržby do banky, drobný nákup bez bločku.":
    "Přímo v pokladně přidáváte příjmy a výdaje, které nemají vlastní doklad — vklad majitele, odvod tržby do banky, drobný nákup bez účtenky.",
  "Číslujú sa v tvare <0>PD{rok}{poradie}</0>. Suma je vždy kladná, smer určuje druh pohybu.":
    "Číslují se ve tvaru <0>PD{rok}{poradie}</0>. Částka je vždy kladná, směr určuje druh pohybu.",
  "<0>Hotovostný bloček sa do pokladne neprepisuje.</0> Pokladňa ho číta priamo z evidencie dokladov. Jedna suma, jedno miesto na opravu, žiadna synchronizácia — keby ste bloček zapísali aj ako pokladničný doklad, hotovosť by odišla dvakrát.":
    "<0>Hotovostní účtenka se do pokladny nepřepisuje.</0> Pokladna ji čte přímo z evidence dokladů. Jedna částka, jedno místo pro opravu, žádná synchronizace — kdybyste účtenku zapsali i jako pokladní doklad, hotovost by odešla dvakrát.",
  "Priebeh a zostatok": "Průběh a zůstatek",
  "Tabuľka ukazuje pohyby vybraného mesiaca a pri každom <0>priebežný zostatok</0>. Nad ňou je zostatok na začiatku obdobia, aby stav sedel aj pri prezeraní starších mesiacov.":
    "Tabulka ukazuje pohyby vybraného měsíce a u každého <0>průběžný zůstatek</0>. Nad ní je zůstatek na začátku období, aby stav seděl i při prohlížení starších měsíců.",
  "V rámci jedného dňa idú <0>príjmy pred výdavkami</0>. Inak by sa mohlo stať, že bloček zoradený pred vklad ukáže v ten deň mínus, hoci v pokladni nikdy nechýbalo.":
    "V rámci jednoho dne jdou <0>příjmy před výdaji</0>. Jinak by se mohlo stát, že účtenka seřazená před vklad ukáže v ten den mínus, ačkoli v pokladně nikdy nic nechybělo.",
  "<0>Záporná pokladňa je vždy chyba v evidencii</0> — v hotovosti sa do mínusu ísť nedá. Faktero na ňu upozorní; hľadajte chýbajúci vklad alebo doklad označený zlým spôsobom platby.":
    "<0>Záporná pokladna je vždy chyba v evidenci</0> — v hotovosti se do mínusu jít nedá. Faktero na ni upozorní; hledejte chybějící vklad nebo doklad označený špatným způsobem platby.",
  "Načítanie bločku z eKasa QR kódu": "Načtení účtenky z QR kódu eKasa",
  "Každý bloček z eKasy má QR kód a v ňom identifikátor dokladu. Faktero ten identifikátor prečíta a doklad si vypýta priamo z Finančnej správy — teda z toho istého miesta, kde si doklad overuje aj ich vlastná aplikácia „Overenie pokladničného dokladu“. Späť príde predajca, IČO, dátum, sumy, sadzby DPH <0>aj jednotlivé položky</0>, presne tak, ako ich predajca odoslal. Nič sa nehádá z fotky.":
    "Každá účtenka z eKasy má QR kód a v něm identifikátor dokladu. Faktero ten identifikátor přečte a doklad si vyžádá přímo od Finanční správy SR — tedy ze stejného místa, kde si doklad ověřuje i její vlastní aplikace „Overenie pokladničného dokladu“. Zpět přijde prodejce, IČO, datum, částky, sazby DPH <0>i jednotlivé položky</0>, přesně tak, jak je prodejce odeslal. Nic se nehádá z fotky.",
  "Stačí bločok odfotiť v <0>Skeneri dokladov</0> alebo v <1>Doklady → Nový doklad</1>; QR kód sa hľadá aj na fotke, takže netreba mieriť zvlášť naň. Odfoťte doklad celý.":
    "Stačí účtenku vyfotit ve <0>Skeneru dokladů</0> nebo v <1>Doklady → Nový doklad</1>; QR kód se hledá i na fotce, takže není třeba mířit zvlášť na něj. Vyfoťte doklad celý.",
  "<0>Keď QR kód nie je alebo sa nedá prečítať</0> — pokrčený bloček, vyblednutá termopáska, zahraničný doklad — údaje sa prečítajú z fotky. To je odhad, nie úradný údaj, a Faktero to pri doklade aj napíše. Vtedy si skontrolujte hlavne dátum a sumu.":
    "<0>Když QR kód chybí nebo se nedá přečíst</0> — zmačkaná účtenka, vybledlá termopáska, zahraniční doklad — údaje se přečtou z fotky. To je odhad, ne úřední údaj, a Faktero to u dokladu i napíše. Pak si zkontrolujte hlavně datum a částku.",
  "Doklad sa vo Finančnej správe nemusí nájsť ani vtedy, keď ho predajca ešte neodoslal — pokladnica v režime offline ho posiela až dodatočne. Skúste to o pár hodín neskôr.":
    "Doklad se u Finanční správy SR nemusí najít ani tehdy, když ho prodejce ještě neodeslal — pokladna v režimu offline ho posílá až dodatečně. Zkuste to o pár hodin později.",
  "<0>Spôsob úhrady sa z bločku prečítať väčšinou nedá.</0> Pokladnica ho do eKasy posielať nemusí a väčšina ho neposiela — na doklade býva vytlačený, ale do údajov sa nedostane. Keď ho doklad nesie, Faktero ho predvolí; inak si po naskenovaní vyberiete hotovosť, kartu alebo prevod. Nie je to formalita: z pokladne uberá len doklad platený hotovosťou.":
    "<0>Způsob úhrady se z účtenky většinou přečíst nedá.</0> Pokladna ho do eKasy posílat nemusí a většina ho neposílá — na dokladu bývá vytištěný, ale do údajů se nedostane. Když ho doklad nese, Faktero ho předvolí; jinak si po naskenování vyberete hotovost, kartu nebo převod. Není to formalita: z pokladny ubírá jen doklad placený hotově.",
  "Položky sa ukladajú k dokladu tak, ako prišli, aj s rozpisom DPH po sadzbách. Bloček ich má často viac naraz — jedna sadzba by doklad popísala nesprávne.":
    "Položky se ukládají k dokladu tak, jak přišly, i s rozpisem DPH po sazbách. Účtenka jich má často více najednou — jedna sazba by doklad popsala nesprávně.",
  "Pokladňa a uzávierka": "Pokladna a uzávěrka",
  "Pokladničný doklad je daňový záznam ako faktúra, takže platí aj naň <0>uzamknutie období</0>. Po uzamknutí sa v ňom už nedá meniť dátum, suma ani popis.":
    "Pokladní doklad je daňový záznam jako faktura, takže i na něj platí <0>uzamčení období</0>. Po uzamčení se v něm už nedá měnit datum, částka ani popis.",
  "Pokladňa pre účtovníčku": "Pokladna pro účetní",
  "Pokladničné doklady sú súčasťou mesačných podkladov aj priameho prepojenia s Pohodou — idú ako príjmové a výdavkové doklady. Pozrite si <0>manuál k Pohode</0>.":
    "Pokladní doklady jsou součástí měsíčních podkladů i přímého propojení s Pohodou — jdou jako příjmové a výdajové doklady. Podívejte se do <0>manuálu k Pohodě</0>.",
  "Rozpis DPH sa k nim <0>nedopĺňa</0>: pohyb v pokladni sadzbu nemá a vymyslená by bola tichá chyba v priznaní. Doklady s DPH sú prijaté doklady a faktúry.":
    "Rozpis DPH se k nim <0>nedoplňuje</0>: pohyb v pokladně sazbu nemá a vymyšlená by byla tichou chybou v přiznání. Doklady s DPH jsou přijaté doklady a faktury.",
  "Zaokrúhľovanie na päť centov": "Zaokrouhlování na pět centů",
  "Pri platbe v hotovosti sa celková suma zaokrúhľuje na <0>päť centov</0> — tak to od 1. 7. 2022 ukladá zákon o cenách, lebo jedno- a dvojcentové mince sa už nevydávajú. Keď na faktúre vyberiete hotovosť, Faktero prepne zaokrúhlenie samo a rozdiel (najviac dva centy) je vidieť v súčtoch.":
    "Při platbě v hotovosti se celková částka zaokrouhluje na <0>pět centů</0> — tak to od 1. 7. 2022 ukládá slovenský zákon o cenách, protože jedno- a dvoucentové mince se už nevydávají. Když na faktuře vyberete hotovost, Faktero přepne zaokrouhlení samo a rozdíl (nejvýše dva centy) je vidět v součtech.",
  "Platba v hotovosti nad <0>5 000 €</0> je medzi podnikateľmi zakázaná (zákon č. 394/2012 Z. z.) — pri takej sume sa objaví upozornenie.":
    "Platba v hotovosti nad <0>5 000 €</0> je mezi podnikateli zakázaná (zákon č. 394/2012 Z. z.) — při takové částce se objeví upozornění.",
} satisfies Record<string, string>;
