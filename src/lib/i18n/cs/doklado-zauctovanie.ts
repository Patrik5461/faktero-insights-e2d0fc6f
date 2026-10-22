// Zaúčtovanie pri spracovaní Nespracovaných dokladov: pravidlo s hviezdičkou,
// zaúčtovanie vytvorením, nastavenia Nespracovaných, hromadná úprava a voľby exportu.
export default {
  "Vytvorený doklad je zaúčtovaný a pripravený na export":
    "Vytvořený doklad je zaúčtovaný a připravený k exportu",
  "Prijatá faktúra vytvorená z Nespracovaných dostane predkontáciu a členenie DPH z dokladu, pravidla, kategórie alebo predvolených a rovno ide do Pohody. Vypnuté = každú faktúru treba ešte zaúčtovať.":
    "Přijatá faktura vytvořená z Nezpracovaných dostane předkontaci a členění DPH z dokladu, pravidla, kategorie nebo výchozích a rovnou jde do Pohody. Vypnuto = každou fakturu je třeba ještě zaúčtovat.",
  "Po vytvorení dokladu otvoriť ďalší nespracovaný doklad":
    "Po vytvoření dokladu otevřít další nezpracovaný doklad",
  "Vypnuté = po vytvorení sa vrátite do zoznamu.": "Vypnuto = po vytvoření se vrátíte do seznamu.",
  "Kontrolovať splatnosť pred dátumom vystavenia": "Kontrolovat splatnost před datem vystavení",
  "Vypnuté = doklad so splatnosťou skoršou ako vystavenie sa dá vytvoriť.":
    "Vypnuto = doklad se splatností dřívější než vystavení lze vytvořit.",
  "Používať vyťažené položky faktúr": "Používat vytěžené položky faktur",
  "Vypnuté = faktúra ide do účtovníctva podľa súčtov a rozpisu DPH, položky sa dajú pri doklade zapnúť.":
    "Vypnuto = faktura jde do účetnictví podle součtů a rozpisu DPH, položky lze u dokladu zapnout.",
  "Používať vyťažené položky bločkov": "Používat vytěžené položky účtenek",
  "Preberať číslo dodacieho listu z dokladu": "Přebírat číslo dodacího listu z dokladu",
  "Tolerancia zaokrúhlenia položiek (v centoch)": "Tolerance zaokrouhlení položek (v centech)",
  "Keď súčet položiek nesedí so sumou dokladu najviac o toľko centov, doklad sa dá vytvoriť a rozdiel sa doplní vyrovnávacou položkou.":
    "Když součet položek nesedí s částkou dokladu nejvýše o tolik centů, doklad lze vytvořit a rozdíl se doplní vyrovnávací položkou.",
  "Faktúra je vytvorená medzi prijatými faktúrami — čaká na zaúčtovanie (chýba predkontácia alebo členenie DPH)":
    "Faktura je vytvořená mezi přijatými fakturami — čeká na zaúčtování (chybí předkontace nebo členění DPH)",
  "Faktúra je už uhradená": "Faktura je už uhrazená",
  "Položky nesedia so sumou o {rozdiel} — doplní sa vyrovnávacia položka.":
    "Položky nesedí s částkou o {rozdiel} — doplní se vyrovnávací položka.",
  "Doplnilo pravidlo účtovania podľa dodávateľa.": "Doplnilo pravidlo účtování podle dodavatele.",
  pravidlo: "pravidlo",
  "Vyplňte aspoň jedno pole, ktoré sa má zmeniť.":
    "Vyplňte alespoň jedno pole, které se má změnit.",
  "Zmenené doklady: {n}": "Změněné doklady: {n}",
  "Presunúť vybrané doklady ({n}) do koša?": "Přesunout vybrané doklady ({n}) do koše?",
  "V koši: {n}": "V koši: {n}",
  "Hromadná úprava": "Hromadná úprava",
  "Zmeniť vybrané": "Změnit vybrané",
  "Do koša": "Do koše",
  "Vybrať doklad": "Vybrat doklad",
  "Radenie dokladov v dávke": "Řazení dokladů v dávce",
  "Podľa dátumu dokladu": "Podle data dokladu",
  "Podľa čísla dokladu": "Podle čísla dokladu",
  "Podľa poradia nahratia": "Podle pořadí nahrání",
  "Exportovať položky dokladu": "Exportovat položky dokladu",
  "Bloček pôjde do Pohody po položkách, nie jedným riadkom podľa sadzieb DPH.":
    "Účtenka půjde do Pohody po položkách, ne jedním řádkem podle sazeb DPH.",

  // Manuály (Pomoc)
  "Kam sa čo uloží:": "Kam se co uloží:",
  "Rovno <0>zaúčtujte</0>: predkontácia, členenie DPH a kontrolného výkazu, stredisko, činnosť, zákazka, kategória. Keď na dodávateľa sedí <1>pravidlo účtovania</1>, jeho kódy sa doplnia samy a pri poli svieti hviezdička. Po zmene dodávateľa sa pravidlo vyhodnotí znova; keď sedí viac pravidiel, iné vyberiete cez <2>Použiť pravidlo</2>.":
    "Rovnou <0>zaúčtujte</0>: předkontace, členění DPH a kontrolního výkazu, středisko, činnost, zakázka, kategorie. Když na dodavatele sedí <1>pravidlo účtování</1>, jeho kódy se doplní samy a u pole svítí hvězdička. Po změně dodavatele se pravidlo vyhodnotí znovu; když sedí více pravidel, jiné vyberete přes <2>Použít pravidlo</2>.",
  "Kliknite na <0>Vytvoriť</0> — doklad sa presunie medzi prijaté faktúry, doklady alebo iné doklady a otvorí sa ďalší nespracovaný. <1>Uložiť zmeny</1> ho nechá rozpracovaný na neskôr.":
    "Klikněte na <0>Vytvořit</0> — doklad se přesune mezi přijaté faktury, doklady nebo jiné doklady a otevře se další nezpracovaný. <1>Uložit změny</1> ho nechá rozpracovaný na později.",
  "Vytvorený doklad je <0>skontrolovaný a pripravený na export</0>. Bloček je spracovaný, prijatá faktúra zaúčtovaná — keď sa pre ňu dá určiť predkontácia aj členenie DPH (z dokladu, z pravidla, z kategórie alebo predvolené v <1>Predkontáciách</1>). Bez nich čaká medzi prijatými faktúrami na zaúčtovanie. Zaplatenú faktúru označíte voľbou <2>Faktúra je už uhradená</2>.":
    "Vytvořený doklad je <0>zkontrolovaný a připravený k exportu</0>. Účtenka je zpracovaná, přijatá faktura zaúčtovaná — když se pro ni dá určit předkontace i členění DPH (z dokladu, z pravidla, z kategorie nebo výchozí v <1>Předkontacích</1>). Bez nich čeká mezi přijatými fakturami na zaúčtování. Zaplacenou fakturu označíte volbou <2>Faktura je už uhrazená</2>.",
  "<0>Hromadná úprava:</0> v zozname nespracovaných dokladov označte viac dokladov a nastavte im naraz druh, zákazku, predkontáciu, členenie DPH, stredisko alebo činnosť, prípadne ich presuňte do koša. Prázdne pole sa nemení.":
    "<0>Hromadná úprava:</0> v seznamu nezpracovaných dokladů označte více dokladů a nastavte jim najednou druh, zakázku, předkontaci, členění DPH, středisko nebo činnost, případně je přesuňte do koše. Prázdné pole se nemění.",
  "Bločky odfotené v appke alebo zadané vo formulári sú v tom istom zozname — otvoria sa vo formulári dokladu, kde ich spracujete tlačidlom Spracovať. Spracovaný bloček sa presunie do <0>Doklady → Bločky</0>; tam sú len skontrolované bločky, rozdelené na spracované a odovzdané účtovníkovi. Menu Doklady má sekcie Nespracované doklady, Bločky, Prijaté faktúry, Vystavené faktúry, Iné doklady a <1>Kôš</1>, kde sa dajú zmazané doklady obnoviť. Zmazaný nespracovaný doklad ide do koša a dá sa obnoviť.":
    "Účtenky vyfocené v aplikaci nebo zadané ve formuláři jsou ve stejném seznamu — otevřou se ve formuláři dokladu, kde je zpracujete tlačítkem Zpracovat. Zpracovaná účtenka se přesune do <0>Doklady → Účtenky</0>; tam jsou jen zkontrolované účtenky, rozdělené na zpracované a předané účetnímu. Menu Doklady má sekce Nezpracované doklady, Účtenky, Přijaté faktury, Vystavené faktury, Jiné doklady a <1>Koš</1>, kde lze smazané doklady obnovit. Smazaný nezpracovaný doklad jde do koše a lze ho obnovit.",
  "<0>Položky</0> majú pri každej sadzbu DPH a príznak prenesenia daňovej povinnosti. Keď súčet položiek nesedí so sumou dokladu, zobrazí sa rozdiel a tlačidlo <1>Pridať vyrovnávaciu položku</1> — bez nej sa doklad nevytvorí. Drobný rozdiel do tolerancie, ktorú si firma nastaví, doklad nezastaví — vyrovnávacia položka sa doplní sama pri vytvorení.":
    "<0>Položky</0> mají u každé sazbu DPH a příznak přenesení daňové povinnosti. Když součet položek nesedí s částkou dokladu, zobrazí se rozdíl a tlačítko <1>Přidat vyrovnávací položku</1> — bez ní se doklad nevytvoří. Drobný rozdíl do tolerance, kterou si firma nastaví, doklad nezastaví — vyrovnávací položka se doplní sama při vytvoření.",
  "V <0>Účtovníctvo → Predkontácie</0>, časť <1>Export a spracovanie dokladov</1>, si nastavíte správanie Nespracovaných dokladov: či je vytvorená faktúra rovno zaúčtovaná, či sa po vytvorení otvorí ďalší doklad, kontrolu splatnosti, toleranciu zaokrúhlenia položiek v centoch, používanie vyťažených položiek faktúr a bločkov a preberanie čísla dodacieho listu.":
    "V <0>Účetnictví → Předkontace</0>, část <1>Export a zpracování dokladů</1>, si nastavíte chování Nezpracovaných dokladů: zda je vytvořená faktura rovnou zaúčtovaná, zda se po vytvoření otevře další doklad, kontrolu splatnosti, toleranci zaokrouhlení položek v centech, používání vytěžených položek faktur a účtenek a přebírání čísla dodacího listu.",
  "<0>Skener</0> — odfotíte bloček alebo faktúru a text z nej prečíta server. Pri slovenských pokladničných dokladoch stačí naskenovať QR kód: doklad si Faktero vypýta priamo z Finančnej správy aj s položkami a sadzbami. Viac v <1>manuáli k pokladni</1>. Čo nastavíte pred odfotením (úhrada, kategória, zákazka, predkontácia, komentár), sa uloží k dokladu aj vtedy, keď ho necháte v <2>Nespracovaných dokladoch</2> a dokončíte na webe.":
    "<0>Skener</0> — vyfotíte účtenku nebo fakturu a text z ní přečte server. U slovenských pokladních dokladů stačí naskenovat QR kód: doklad si Faktero vyžádá přímo z Finanční správy SR i s položkami a sazbami. Více v <1>manuálu k pokladně</1>. Co nastavíte před vyfocením (úhrada, kategorie, zakázka, předkontace, komentář), se uloží k dokladu i tehdy, když ho necháte v <2>Nezpracovaných dokladech</2> a dokončíte na webu.",
  "<0>Radenie dokladov v dávke</0> — podľa dátumu, čísla dokladu alebo poradia nahratia; v tomto poradí ich Pohoda očísluje.":
    "<0>Řazení dokladů v dávce</0> — podle data, čísla dokladu nebo pořadí nahrání; v tomto pořadí je Pohoda očísluje.",
  "<0>Exportovať položky dokladu</0> (bločky) — bloček pôjde po položkách, nie jedným riadkom podľa sadzieb DPH. Predvolene podľa nastavenia firmy.":
    "<0>Exportovat položky dokladu</0> (účtenky) — účtenka půjde po položkách, ne jedním řádkem podle sazeb DPH. Výchozí podle nastavení firmy.",
  "Faktúra vytvorená z <0>Nespracovaných dokladov</0> je zaúčtovaná už vytvorením, keď sa pre ňu dá určiť predkontácia aj členenie DPH (z dokladu, pravidla, kategórie alebo predvolených). Kto chce každú faktúru zaúčtovať zvlášť, vypne to v Predkontáciách voľbou <1>Vytvorený doklad je zaúčtovaný a pripravený na export</1>.":
    "Faktura vytvořená z <0>Nezpracovaných dokladů</0> je zaúčtovaná už vytvořením, když se pro ni dá určit předkontace i členění DPH (z dokladu, pravidla, kategorie nebo výchozích). Kdo chce každou fakturu zaúčtovat zvlášť, vypne to v Předkontacích volbou <1>Vytvořený doklad je zaúčtovaný a připravený k exportu</1>.",
};
