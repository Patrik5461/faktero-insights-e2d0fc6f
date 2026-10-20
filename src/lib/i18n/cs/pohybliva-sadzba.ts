// Český preklad. Pohyblivá úroková sadzba pri financovaní: formulár zmluvy
// (FormularZmluvy), panel sadzby a vypočítaného úroku (SadzbaZmluvy), detail
// kontokorentu a úveru a sekcia „Pohyblivá úroková sadzba“ v manuáli /pomoc/financovanie.
export default {
  /* Formulár */
  "Úroková sadzba": "Úroková sazba",
  Pevná: "Pevná",
  Pohyblivá: "Pohyblivá",
  "Referenčný index": "Referenční index",
  "Marža % p. a.": "Marže % p. a.",
  "Prirážka banky k indexu — tak, ako je v zmluve (po prípadnom zvýhodnení).":
    "Přirážka banky k indexu — tak, jak je ve smlouvě (po případném zvýhodnění).",
  "Dolná hranica indexu %": "Spodní hranice indexu %",
  "bez hranice": "bez hranice",
  "Napr. 0, keď zmluva hovorí, že záporný index sa považuje za nulu. Prázdne = bez hranice.":
    "Např. 0, když smlouva říká, že záporný index se považuje za nulu. Prázdné = bez hranice.",
  "Sadzba sa mení": "Sazba se mění",
  polročne: "pololetně",
  ročne: "ročně",
  "Index sa určuje": "Index se určuje",
  "Počet pracovných dní": "Počet pracovních dnů",
  "pracovné dni pred začiatkom obdobia": "pracovní dny před začátkem období",
  "priemer za predchádzajúci mesiac": "průměr za předchozí měsíc",
  "Bežne „dva pracovné dni pred začiatkom obdobia fixácie“.":
    "Běžně „dva pracovní dny před začátkem období fixace“.",
  "Dnes: {index} {hodnota} % ({k}) + marža {marza} % = {sadzba} % p. a.":
    "Dnes: {index} {hodnota} % ({k}) + marže {marza} % = {sadzba} % p. a.",
  "priemer za {mesiac}": "průměr za {mesiac}",
  "k {datum}": "k {datum}",
  "Hodnota indexu sa načíta denne z ECB a ČNB; sadzba sa dopočíta pri uložení.":
    "Hodnota indexu se načítá denně z ECB a ČNB; sazba se dopočítá při uložení.",
  "EURIBOR je verejne zadarmo len ako mesačný priemer, takže vypočítaná sadzba je odhad — skutočnú určuje banka. Na detaile zmluvy sa dá za každé obdobie zadať ručne.":
    "EURIBOR je veřejně zdarma jen jako měsíční průměr, takže vypočtená sazba je odhad — skutečnou určuje banka. V detailu smlouvy ji lze za každé období zadat ručně.",
  "Zadajte maržu pohyblivej sadzby.": "Zadejte marži pohyblivé sazby.",
  "Pri úveroch s EURIBORom banky takmer vždy počítajú „rok s 360 dňami“ (ACT/360) — skontrolujte zmluvu.":
    "U úvěrů s EURIBOREM banky téměř vždy počítají „rok o 360 dnech“ (ACT/360) — zkontrolujte smlouvu.",
  "Rámec platí od": "Rámec platí od",
  "Deň podpisu alebo sprístupnenia rámca — od neho Faktero počíta úrok z čerpania.":
    "Den podpisu nebo zpřístupnění rámce — od něj Faktero počítá úrok z čerpání.",

  /* Detail zmluvy — sadzba a vypočítaný úrok */
  "Sadzbu sa nepodarilo načítať.": "Sazbu se nepodařilo načíst.",
  "Ručná sadzba zrušená, platí vypočítaná.": "Ruční sazba zrušena, platí vypočtená.",
  "Sadzba za obdobie uložená.": "Sazba za období uložena.",
  "Pevná sadzba {sadzba} p. a.": "Pevná sazba {sadzba} p. a.",
  "(za toto obdobie zadaná ručne)": "(za toto období zadaná ručně)",
  "Hodnota indexu {index} ešte nie je načítaná — sadzba sa dopočíta po najbližšom stiahnutí sadzieb (denne ráno).":
    "Hodnota indexu {index} ještě není načtena — sazba se dopočítá po nejbližším stažení sazeb (denně ráno).",
  "Aktuálna sadzba: {sadzba} p. a. (zadaná ručne za obdobie {od} – {do})":
    "Aktuální sazba: {sadzba} p. a. (zadaná ručně za období {od} – {do})",
  "Aktuálna sadzba: {index} {hodnota} ({k}) + marža {marza} = {sadzba} p. a.":
    "Aktuální sazba: {index} {hodnota} ({k}) + marže {marza} = {sadzba} p. a.",
  "Index je pod dolnou hranicou {floor}, počíta sa s hranicou.":
    "Index je pod spodní hranicí {floor}, počítá se s hranicí.",
  "Obdobie fixácie {od} – {do}, deň fixingu {fixing}.":
    "Období fixace {od} – {do}, den fixingu {fixing}.",
  "Odhad: EURIBOR je verejne zadarmo len ako mesačný priemer (ECB), zmluva ho však berie k dňu fixingu. Skutočný úrok určuje banka. Keď sadzbu poznáte (oznámenie banky, výpis), zadajte ju za obdobie ručne — prepíše vypočítanú.":
    "Odhad: EURIBOR je veřejně zdarma jen jako měsíční průměr (ECB), smlouva ho však bere ke dni fixingu. Skutečný úrok určuje banka. Když sazbu znáte (oznámení banky, výpis), zadejte ji za období ručně — přepíše vypočtenou.",
  "Predbežné: hodnota indexu k dňu fixingu ešte nie je zverejnená, použitá je posledná známa.":
    "Předběžné: hodnota indexu ke dni fixingu ještě není zveřejněna, použita je poslední známá.",
  "Vypočítaný úrok a skutočnosť": "Vypočtený úrok a skutečnost",
  "Úrok z čerpania na konci každého dňa (zaúčtovaný zostatok a pohyby z banky) × sadzba platná v ten deň, {konvencia}. Rozdiel oproti úroku, ktorý banka strhla, je najlepšia kontrola, či sadzba a fixing sedia.":
    "Úrok z čerpání na konci každého dne (zaúčtovaný zůstatek a pohyby z banky) × sazba platná v ten den, {konvencia}. Rozdíl oproti úroku, který banka strhla, je nejlepší kontrola, zda sazba a fixing sedí.",
  "Zatiaľ nič na výpočet.": "Zatím nic k výpočtu.",
  "Priemerné čerpanie": "Průměrné čerpání",
  "Vypočítaný úrok": "Vypočtený úrok",
  "Strhla banka": "Strhla banka",
  "(predbežne)": "(předběžně)",
  "(odhad)": "(odhad)",
  "niektoré dni bez sadzby": "některé dny bez sazby",
  "Uloží sadzbu za obdobie fixácie tak, aby výpočet sedel so strhnutým úrokom.":
    "Uloží sazbu za období fixace tak, aby výpočet seděl se strženým úrokem.",
  "Prevziať sadzbu {s}": "Převzít sazbu {s}",
  "História sadzby po obdobiach": "Historie sazby po obdobích",
  Fixing: "Fixing",
  Index: "Index",
  hranica: "hranice",
  "zadané ručne": "zadáno ručně",
  pevná: "pevná",
  "odhad z mesačného priemeru": "odhad z měsíčního průměru",
  vypočítané: "vypočteno",
  predbežne: "předběžně",
  "Zadajte sadzbu v % p. a.": "Zadejte sazbu v % p. a.",
  "Zrušiť ručnú sadzbu": "Zrušit ruční sazbu",
  "Zadať sadzbu ručne": "Zadat sazbu ručně",
  "Ručne zadaná sadzba (celková, teda index + marža) prepíše vypočítanú za celé obdobie fixácie — keď banka oznámi skutočnú sadzbu, alebo keď ju prevezmete zo strhnutého úroku.":
    "Ručně zadaná sazba (celková, tedy index + marže) přepíše vypočtenou za celé období fixace — když banka oznámí skutečnou sazbu, nebo když ji převezmete ze strženého úroku.",
  "Zmluva nemá vybraný napojený účet — úrok sa nedá vypočítať.":
    "Smlouva nemá vybraný připojený účet — úrok nelze vypočítat.",
  "Banka neposiela zaúčtovaný zostatok účtu — bez neho sa čerpanie po dňoch spočítať nedá (disponibilný zostatok obsahuje aj nevyčerpaný rámec).":
    "Banka neposílá zaúčtovaný zůstatek účtu — bez něj nelze čerpání po dnech spočítat (disponibilní zůstatek obsahuje i nevyčerpaný rámec).",
  "Na účte zatiaľ nie sú žiadne pohyby z banky.": "Na účtu zatím nejsou žádné pohyby z banky.",
  "{index} + marža {marza} % p. a.": "{index} + marže {marza} % p. a.",
  "Splátkový kalendár je spočítaný so sadzbou platnou pri uložení zmluvy. Keď banka po zmene indexu oznámi novú splátku, zmluvu upravte a uložte — nezaplatené splátky sa prepočítajú s dnešnou sadzbou.":
    "Splátkový kalendář je spočítán se sazbou platnou při uložení smlouvy. Když banka po změně indexu oznámí novou splátku, smlouvu upravte a uložte — nezaplacené splátky se přepočítají s dnešní sazbou.",

  /* Manuál /pomoc/financovanie */
  "Pri novej zmluve zvoľte druh <0>Kontokorentný úver</0>. Polia splátkového kalendára sa skryjú a vyplníte <1>úverový rámec</1>, <2>účet</2>, na ktorom rámec je, <3>úrok % p. a.</3>, <4>poplatok za rámec ročne</4>, dokedy rámec platí a ako často banka úrok strhne. Pri pohyblivej sadzbe (napr. 1M EURIBOR + marža) zvoľte <5>Pohyblivá</5> — pozri časť Pohyblivá úroková sadzba nižšie.":
    "U nové smlouvy zvolte druh <0>Kontokorentní úvěr</0>. Pole splátkového kalendáře se skryjí a vyplníte <1>úvěrový rámec</1>, <2>účet</2>, na kterém rámec je, <3>úrok % p. a.</3>, <4>poplatek za rámec ročně</4>, dokdy rámec platí a jak často banka úrok strhne. U pohyblivé sazby (např. 1M EURIBOR + marže) zvolte <5>Pohyblivá</5> — viz část Pohyblivá úroková sazba níže.",
  "Nahratú zmluvu o kontokorente Faktero spozná samo — aj keď ju banka nazve „úver“: úver bez splátkového kalendára s rámcom k bežnému účtu je kontokorent. Vyčíta limit, sadzbu (aj referenčný index a maržu), poplatok, platnosť a IBAN účtu a podľa IBAN zmluvu priradí k napojenému účtu.":
    "Nahranou smlouvu o kontokorentu Faktero pozná samo — i když ji banka nazve „úvěr“: úvěr bez splátkového kalendáře s rámcem k běžnému účtu je kontokorent. Vyčte limit, sazbu (i referenční index a marži), poplatek, platnost a IBAN účtu a podle IBAN smlouvu přiřadí k připojenému účtu.",
  "Pohyblivá úroková sadzba": "Pohyblivá úroková sazba",
  "Veľa úverov a kontokorentov nemá pevný úrok, ale <0>referenčný index + maržu</0> — napríklad „1M EURIBOR + 4,3 % p. a.“. Index sa mení raz za obdobie fixácie (mesačne, štvrťročne…) a s ním aj úrok. Keby ste do zmluvy zapísali len maržu, Faktero by úrok počítalo príliš nízky.":
    "Mnoho úvěrů a kontokorentů nemá pevný úrok, ale <0>referenční index + marži</0> — například „1M EURIBOR + 4,3 % p. a.“. Index se mění jednou za období fixace (měsíčně, čtvrtletně…) a s ním i úrok. Kdybyste do smlouvy zapsali jen marži, Faktero by úrok počítalo příliš nízký.",
  "V zmluve preto pri úrokovej sadzbe zvoľte <0>Pohyblivá</0> a vyplňte:":
    "Ve smlouvě proto u úrokové sazby zvolte <0>Pohyblivá</0> a vyplňte:",
  "<0>Referenčný index</0> — 1M, 3M, 6M alebo 12M EURIBOR, €STR, alebo PRIBOR (1M, 3M, 6M, 1R) pri českých úveroch.":
    "<0>Referenční index</0> — 1M, 3M, 6M nebo 12M EURIBOR, €STR, nebo PRIBOR (1M, 3M, 6M, 1R) u českých úvěrů.",
  "<0>Marža</0> — prirážka banky tak, ako je v zmluve (po prípadnom zvýhodnení).":
    "<0>Marže</0> — přirážka banky tak, jak je ve smlouvě (po případném zvýhodnění).",
  "<0>Dolná hranica indexu</0> — keď zmluva hovorí, že záporný index sa považuje za nulu, zadajte 0. Bez hranice nechajte prázdne.":
    "<0>Spodní hranice indexu</0> — když smlouva říká, že záporný index se považuje za nulu, zadejte 0. Bez hranice nechte prázdné.",
  "<0>Sadzba sa mení</0> a <1>index sa určuje</1> — napríklad mesačne, „2 pracovné dni pred začiatkom obdobia fixácie“ (to je najčastejšie znenie), alebo ako priemer za predchádzajúci mesiac.":
    "<0>Sazba se mění</0> a <1>index se určuje</1> — například měsíčně, „2 pracovní dny před začátkem období fixace“ (to je nejčastější znění), nebo jako průměr za předchozí měsíc.",
  "<0>Výpočet úroku</0> — pri úveroch s EURIBORom banky takmer vždy počítajú „rok s 360 dňami a skutočný počet dní“, teda ACT/360. Pri rovnakej sadzbe vychádza úrok o 1,4 % vyšší než pri ACT/365.":
    "<0>Výpočet úroku</0> — u úvěrů s EURIBOREM banky téměř vždy počítají „rok o 360 dnech a skutečný počet dnů“, tedy ACT/360. Při stejné sazbě vychází úrok o 1,4 % vyšší než při ACT/365.",
  "Nahratú zmluvu Faktero prečíta samo — index, maržu, dolnú hranicu, fixing aj spôsob výpočtu vyplní do týchto polí.":
    "Nahranou smlouvu Faktero přečte samo — index, marži, spodní hranici, fixing i způsob výpočtu vyplní do těchto polí.",
  "Hodnoty indexov si Faktero každé ráno stiahne: <0>EURIBOR</0> z Európskej centrálnej banky, <1>€STR</1> tiež z ECB a <2>PRIBOR</2> z ČNB. Na detaile zmluvy uvidíte napríklad „Aktuálna sadzba: 1M EURIBOR 1,920 % (priemer za september 2026) + marža 4,30 % = 6,22 % p. a.“ a pod tým históriu sadzby po obdobiach.":
    "Hodnoty indexů si Faktero každé ráno stáhne: <0>EURIBOR</0> z Evropské centrální banky, <1>€STR</1> také z ECB a <2>PRIBOR</2> z ČNB. V detailu smlouvy uvidíte například „Aktuální sazba: 1M EURIBOR 1,920 % (průměr za září 2026) + marže 4,30 % = 6,22 % p. a.“ a pod tím historii sazby po obdobích.",
  "<0>Pozor, pri EURIBORe je to odhad.</0> Denný EURIBOR sa zadarmo strojovo získať nedá — verejne dostupný je len mesačný priemer. Zmluva však index berie k presnému dňu fixingu, takže sa vypočítaná sadzba môže od skutočnej líšiť o pár stotín percenta. Skutočný úrok vždy určuje banka. Keď index k dňu fixingu ešte nie je zverejnený, Faktero použije posledný známy a označí výsledok ako predbežný.":
    "<0>Pozor, u EURIBORU je to odhad.</0> Denní EURIBOR nelze zdarma strojově získat — veřejně dostupný je jen měsíční průměr. Smlouva však index bere k přesnému dni fixingu, takže se vypočtená sazba může od skutečné lišit o pár setin procenta. Skutečný úrok vždy určuje banka. Když index ke dni fixingu ještě není zveřejněn, Faktero použije poslední známý a označí výsledek jako předběžný.",
  "Preto sa dá sadzba za každé obdobie <0>zadať ručne</0> (ceruzka v histórii sadzby) — keď vám banka sadzbu oznámi, alebo keď ju chcete zosúladiť so skutočne strhnutým úrokom. Ručná sadzba prepíše vypočítanú za celé obdobie fixácie a dá sa vrátiť späť.":
    "Proto lze sazbu za každé období <0>zadat ručně</0> (tužka v historii sazby) — když vám banka sazbu oznámí, nebo když ji chcete sladit se skutečně strženým úrokem. Ruční sazba přepíše vypočtenou za celé období fixace a lze ji vrátit zpět.",
  "Pri kontokorente Faktero počíta aj <0>vypočítaný úrok</0> za každý mesiac — z čerpania na konci každého dňa (zostatok účtu a pohyby z banky) — a porovná ho s úrokom, ktorý banka naozaj strhla. Rozdiel je najlepšia kontrola: keď sedí na pár centov, sadzba aj fixing sú v poriadku. Keď nesedí, tlačidlom <1>Prevziať sadzbu</1> si uložíte sadzbu, ktorá zo strhnutého úroku vyplýva.":
    "U kontokorentu Faktero počítá i <0>vypočtený úrok</0> za každý měsíc — z čerpání na konci každého dne (zůstatek účtu a pohyby z banky) — a porovná ho s úrokem, který banka opravdu strhla. Rozdíl je nejlepší kontrola: když sedí na pár haléřů či centů, sazba i fixing jsou v pořádku. Když nesedí, tlačítkem <1>Převzít sazbu</1> si uložíte sazbu, která ze strženého úroku vyplývá.",
  "Pri splátkovom úvere s pohyblivou sadzbou sa kalendár počíta so sadzbou platnou pri uložení zmluvy. Keď banka po zmene indexu oznámi novú splátku, zmluvu otvorte a uložte — nezaplatené splátky sa prepočítajú s dnešnou sadzbou.":
    "U splátkového úvěru s pohyblivou sazbou se kalendář počítá se sazbou platnou při uložení smlouvy. Když banka po změně indexu oznámí novou splátku, smlouvu otevřete a uložte — nezaplacené splátky se přepočítají s dnešní sazbou.",
};
