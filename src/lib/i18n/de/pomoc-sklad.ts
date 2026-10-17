// Nemecký preklad manuálu v Pomoci (src/routes/pomoc.sklad.tsx). Kľúče vyrába pomoc-preklad.test.tsx.
export default {
  "Pomoc — Sklad — Faktero": "Hilfe — Lager — Faktero",
  "Skladové karty, príjem a výdaj, vážená nákupná cena, rezervácie, prevody medzi skladmi, dodacie listy, inventúra, minimálne zásoby a automatický odpočet pri faktúre.":
    "Artikel, Wareneingang und Warenausgang, gewichteter Einkaufspreis, Reservierungen, Umlagerungen zwischen Lagern, Lieferscheine, Inventur, Mindestbestände und automatische Abbuchung bei der Rechnung.",
  "Kompletný manuál k skladu vo Faktere.": "Vollständiges Handbuch zum Lager in Faktero.",
  "Sklad vo Faktere": "Lager in Faktero",
  "Čo sklad vie, ako sa v ňom pracuje a kde sa najčastejšie robia chyby. Sklad je prepojený s faktúrami, zákazkami aj objednávkami — tovar sa odpisuje sám.":
    "Was das Lager kann, wie man damit arbeitet und wo am häufigsten Fehler passieren. Das Lager ist mit Rechnungen, Projekten und Bestellungen verknüpft — Ware wird automatisch abgebucht.",
  "Čo sklad robí": "Was das Lager macht",
  "Sklad vo Faktere odpovedá na tri otázky: <0>čo mám</0>, <1>koľko to stálo</1> a <2>kam sa to podelo</2>. Nie je to samostatná evidencia vedľa fakturácie — je to tá istá evidencia. Keď vystavíte faktúru na skladovú položku, tovar sa odpíše sám.":
    "Das Lager in Faktero beantwortet drei Fragen: <0>Was habe ich</0>, <1>was hat es gekostet</1> und <2>wo ist es geblieben</2>. Es ist keine separate Erfassung neben der Fakturierung — es ist dieselbe Erfassung. Wenn Sie eine Rechnung über einen Lagerartikel ausstellen, wird die Ware automatisch abgebucht.",
  "Konkrétne sklad vie:": "Konkret kann das Lager:",
  "viesť skladové karty so stavom, nákupnou a predajnou cenou,":
    "Artikel mit Bestand, Einkaufs- und Verkaufspreis führen,",
  "evidovať príjem, výdaj, opravu a inventúrny rozdiel — každý pohyb s dátumom, cenou a poznámkou,":
    "Wareneingang, Warenausgang, Korrektur und Inventurdifferenz erfassen — jede Bewegung mit Datum, Preis und Notiz,",
  "počítať <0>váženú nákupnú cenu</0>, takže viete, akú maržu ste na predaji naozaj dosiahli,":
    "den <0>gewichteten Einkaufspreis</0> berechnen, sodass Sie wissen, welche Marge Sie beim Verkauf tatsächlich erzielt haben,",
  "odpisovať tovar automaticky pri odoslaní faktúry a vracať ho pri dobropise,":
    "Ware beim Senden der Rechnung automatisch abbuchen und bei einer Gutschrift zurückbuchen,",
  "rezervovať tovar na ponuku alebo prijatú objednávku,":
    "Ware für ein Angebot oder eine eingegangene Bestellung reservieren,",
  "presúvať tovar medzi viacerými skladmi,": "Ware zwischen mehreren Lagern umlagern,",
  "vystavovať dodacie listy,": "Lieferscheine ausstellen,",
  "strážiť minimálne zásoby a pripraviť objednávku u dodávateľa,":
    "Mindestbestände überwachen und eine Bestellung beim Lieferanten vorbereiten,",
  "robiť inventúru a rozdiel zaúčtovať,": "eine Inventur durchführen und die Differenz verbuchen,",
  "priradiť výdaj na zákazku, aby bolo vidieť skutočný náklad práce.":
    "einen Warenausgang einem Projekt zuordnen, damit die tatsächlichen Kosten der Arbeit sichtbar sind.",
  "Skladové karty a sledovanie stavu": "Artikel und Bestandsführung",
  "Kliknutím na ikonu dokumentu pri položke sa otvorí <0>skladová karta</0>: pohyby od začiatku, rezervácie, priemerná aj posledná nákupná cena a export pohybov do CSV.":
    "Ein Klick auf das Dokumentsymbol beim Eintrag öffnet den <0>Artikel</0>: Bewegungen von Anfang an, Reservierungen, durchschnittlicher und letzter Einkaufspreis sowie Export der Bewegungen als CSV.",
  "Karta vzniká v <0>Sklad → Skladové položky</0>. Má SKU, názov, mernú jednotku, nákupnú a predajnú cenu, prípadne čiarový kód, umiestnenie a fotku.":
    "Ein Artikel wird unter <0>Lager → Lagerartikel</0> angelegt. Er hat SKU, Bezeichnung, Mengeneinheit, Einkaufs- und Verkaufspreis, gegebenenfalls Barcode, Lagerort und Foto.",
  "Najdôležitejší prepínač je <0>Sledovať stav</0>. Iba pri zapnutom sledovaní pohyby menia množstvo a Faktero bráni tomu, aby stav klesol pod nulu. Služby a položky, ktoré na sklade nedržíte, nechajte bez sledovania — inak vám každá faktúra spadne na nedostatok zásoby.":
    "Der wichtigste Schalter ist <0>Bestand führen</0>. Nur bei aktivierter Bestandsführung ändern Bewegungen die Menge, und Faktero verhindert, dass der Bestand unter null fällt. Dienstleistungen und Positionen, die Sie nicht auf Lager halten, lassen Sie ohne Bestandsführung — sonst scheitert jede Rechnung an fehlendem Bestand.",
  "Karta sa viaže na <0>produkt z katalógu</0> (<1>Produkty a služby</1>). Produkt je to, čo predávate a čo ide na faktúru — cena, merná jednotka, DPH. Karta je to isté z pohľadu skladu — SKU, nákupná cena, minimum, stav a pohyby. Služba má len produkt, tovar oboje.":
    "Der Artikel ist mit einem <0>Produkt aus dem Katalog</0> (<1>Produkte und Dienstleistungen</1>) verknüpft. Das Produkt ist das, was Sie verkaufen und was auf die Rechnung kommt — Preis, Mengeneinheit, MwSt. Der Artikel ist dasselbe aus Sicht des Lagers — SKU, Einkaufspreis, Mindestbestand, Bestand und Bewegungen. Eine Dienstleistung hat nur ein Produkt, Ware beides.",
  "<0>Predajná cena je jedna.</0> Či ju zmeníte v katalógu alebo na karte, prepíše sa na oboch miestach. Iné ceny pre rôznych odberateľov alebo pri väčších množstvách sa nerobia druhou cenou na karte, ale v <1>cenníku a zľavách</1>.":
    "<0>Es gibt nur einen Verkaufspreis.</0> Ob Sie ihn im Katalog oder im Artikel ändern, er wird an beiden Stellen überschrieben. Andere Preise für verschiedene Kunden oder bei größeren Mengen werden nicht über einen zweiten Preis im Artikel abgebildet, sondern in der <1>Preisliste und den Rabatten</1>.",
  "Tovar sa dá založiť z oboch strán: v katalógu zaškrtnutím <0>Sledovať sklad</0> (karta vznikne sama), alebo v Skladových položkách tlačidlom <1>Pridať tovar</1>, ktoré vytvorí naraz produkt aj kartu a vie hneď zapísať počiatočný stav.":
    "Ware lässt sich von beiden Seiten anlegen: im Katalog durch Aktivieren von <0>Lager führen</0> (der Artikel entsteht automatisch) oder in den Lagerartikeln über die Schaltfläche <1>Ware hinzufügen</1>, die Produkt und Artikel gleichzeitig anlegt und direkt den Anfangsbestand erfassen kann.",
  "Kartu, ktorú už nepoužívate, <0>archivujte</0>, nemažte. Mazanie by odstrihlo históriu pohybov, ktoré patria k starým faktúram.":
    "Einen Artikel, den Sie nicht mehr verwenden, <0>archivieren</0> Sie, statt ihn zu löschen. Das Löschen würde die Bewegungshistorie abschneiden, die zu alten Rechnungen gehört.",
  "Príjem, výdaj a oprava": "Wareneingang, Warenausgang und Korrektur",
  "Pohyby nájdete v <0>Sklad → Pohyby</0>, nový sa zadáva cez <1>Príjem</1> a <2>Výdaj</2>. Rýchlejšie je to zo samotnej položky: v zozname skladových položiek má každý riadok tlačidlo <3>Naskladniť</3> a to isté nájdete v jej karte spolu s tlačidlom <4>Vydať</4>. Položka aj nákupná cena sú potom vopred vyplnené.":
    "Bewegungen finden Sie unter <0>Lager → Bewegungen</0>, neue erfassen Sie über <1>Wareneingang</1> und <2>Warenausgang</2>. Schneller geht es direkt vom Artikel aus: In der Liste der Lagerartikel hat jede Zeile die Schaltfläche <3>Einlagern</3>, und dasselbe finden Sie im Artikel zusammen mit der Schaltfläche <4>Ausgeben</4>. Artikel und Einkaufspreis sind dann bereits vorausgefüllt.",
  "<0>Stav na sklade sa nikde nezadáva ako číslo.</0> Je to súčet pohybov — inak by sa rozišiel s hodnotou skladu a chýbal by riadok, ktorý ho zmenil. Prvý stav zapíšete pri zakladaní tovaru (pole <1>Počiatočný stav</1>), potom ho meníte príjmom a výdajom a rozdiel oproti skutočnosti zrovnáte <2>inventúrou</2>.":
    "<0>Der Lagerbestand wird nirgends als Zahl eingegeben.</0> Er ist die Summe der Bewegungen — sonst würde er vom Lagerwert abweichen und es fehlte die Zeile, die ihn geändert hat. Den ersten Bestand erfassen Sie beim Anlegen der Ware (Feld <1>Anfangsbestand</1>), danach ändern Sie ihn über Wareneingang und Warenausgang, und Abweichungen von der Realität gleichen Sie per <2>Inventur</2> aus.",
  "<0>Príjem</0> — nákup tovaru. Zadajte množstvo a <1>nákupnú cenu za jednotku</1>. Bez nej sa nedá spočítať vážená cena a marža na faktúre bude nepravdivá.":
    "<0>Wareneingang</0> — Einkauf von Ware. Geben Sie die Menge und den <1>Einkaufspreis pro Einheit</1> ein. Ohne ihn lässt sich der gewichtete Preis nicht berechnen, und die Marge auf der Rechnung ist falsch.",
  "<0>Výdaj</0> — predaj mimo faktúry, spotreba na zákazke, škoda. Znižuje stav.":
    "<0>Warenausgang</0> — Verkauf außerhalb einer Rechnung, Verbrauch in einem Projekt, Schaden. Verringert den Bestand.",
  "<0>Oprava</0> — ručná úprava so znamienkom, keď sa niečo zaevidovalo zle.":
    "<0>Korrektur</0> — manuelle Anpassung mit Vorzeichen, wenn etwas falsch erfasst wurde.",
  "<0>Faktúra</0> a <1>dobropis</1> — tieto vytvára Faktero samo, ručne sa nezadávajú.":
    "<0>Rechnung</0> und <1>Gutschrift</1> — diese erstellt Faktero selbst, sie werden nicht manuell erfasst.",
  "Pri výdaji môžete vybrať <0>zákazku</0>. Tovar sa potom objaví v jej nákladoch a vo vyhodnotení marže.":
    "Beim Warenausgang können Sie ein <0>Projekt</0> auswählen. Die Ware erscheint dann in dessen Kosten und in der Margenauswertung.",
  "Vážená nákupná cena": "Gewichteter Einkaufspreis",
  "Faktero oceňuje sklad <0>váženým priemerom</0>. Keď kúpite 10 kusov po 4 € a neskôr 10 kusov po 6 €, karta má 20 kusov v priemernej cene 5 €. Každý ďalší výdaj berie túto priemernú cenu.":
    "Faktero bewertet das Lager zum <0>gewichteten Durchschnitt</0>. Wenn Sie 10 Stück zu 4 € und später 10 Stück zu 6 € kaufen, hat der Artikel 20 Stück zum Durchschnittspreis von 5 €. Jeder weitere Warenausgang verwendet diesen Durchschnittspreis.",
  "Priemer sa prepočítava pri každom príjme, takže hodnota skladu v <0>Sklad → Hodnota</0> zodpovedá tomu, čo ste za tovar naozaj zaplatili — nie poslednej cene ani cenníkovej.":
    "Der Durchschnitt wird bei jedem Wareneingang neu berechnet, sodass der Lagerwert unter <0>Lager → Wert</0> dem entspricht, was Sie für die Ware tatsächlich bezahlt haben — nicht dem letzten Preis und nicht dem Listenpreis.",
  "<0>Pozor na pohyby bez ceny.</0> Ak sa pri starších pohyboch nákupná cena nevyplnila, ostanú bez ocenenia a v hodnote skladu chýbajú. Vyriešite to opravným pohybom alebo inventúrou s cenou.":
    "<0>Achtung bei Bewegungen ohne Preis.</0> Wurde bei älteren Bewegungen kein Einkaufspreis eingetragen, bleiben sie unbewertet und fehlen im Lagerwert. Das beheben Sie mit einer Korrekturbewegung oder einer Inventur mit Preis.",
  "Automatický odpočet pri faktúre": "Automatische Abbuchung bei der Rechnung",
  "Keď na faktúru vyberiete položku, ktorá má skladovú kartu, a faktúra prejde do stavu <0>Odoslaná</0> alebo <1>Uhradená</1>, Faktero vytvorí pohyb typu <2>faktúra</2> a stav skladu sa zníži.":
    "Wenn Sie auf der Rechnung eine Position mit Artikel wählen und die Rechnung in den Status <0>Gesendet</0> oder <1>Bezahlt</1> wechselt, erstellt Faktero eine Bewegung vom Typ <2>Rechnung</2> und der Lagerbestand sinkt.",
  "Pri <0>dobropise</0> sa vytvorí opačný pohyb a tovar sa vráti na sklad — vrátane zákazky, na ktorú bol pôvodne vydaný.":
    "Bei einer <0>Gutschrift</0> wird die Gegenbewegung erstellt und die Ware kommt zurück ins Lager — einschließlich des Projekts, für das sie ursprünglich ausgegeben wurde.",
  "Kým je faktúra <0>koncept</0>, sklad sa nehýbe. Až odoslanie je moment, keď tovar odišiel.":
    "Solange die Rechnung ein <0>Entwurf</0> ist, bewegt sich im Lager nichts. Erst das Senden ist der Moment, in dem die Ware das Haus verlassen hat.",
  "Skladové položky odoslanej faktúry sa už nedajú meniť. Keby sa dali, stav skladu by prestal zodpovedať dokladom.":
    "Die Lagerpositionen einer gesendeten Rechnung lassen sich nicht mehr ändern. Ginge das, würde der Lagerbestand nicht mehr zu den Belegen passen.",
  Rezervácie: "Reservierungen",
  "Rezervácia drží tovar pre konkrétny doklad, aby ho medzitým niekto nepredal. Vzniká z <0>cenovej ponuky</0> alebo z <1>prijatej objednávky</1>, keď na nej zapnete <2>rezervovať tovar</2>.":
    "Eine Reservierung hält Ware für einen bestimmten Beleg zurück, damit sie inzwischen niemand verkauft. Sie entsteht aus einem <0>Angebot</0> oder einer <1>eingegangenen Bestellung</1>, wenn Sie dort <2>Ware reservieren</2> aktivieren.",
  "Rezervovaný kus stále leží na sklade, ale <0>dostupné množstvo</0> je o neho nižšie. Práve dostupné množstvo vidíte pri výbere položky na faktúru.":
    "Ein reserviertes Stück liegt weiterhin im Lager, aber die <0>verfügbare Menge</0> ist um dieses geringer. Genau die verfügbare Menge sehen Sie bei der Auswahl der Position für die Rechnung.",
  "Rezervácia sa uvoľní, keď sa doklad vybaví, zruší alebo (pri ponuke) uplynie jej platnosť.":
    "Die Reservierung wird freigegeben, wenn der Beleg erledigt oder storniert wird oder (beim Angebot) seine Gültigkeit abläuft.",
  "Viac skladov a prevody": "Mehrere Lager und Umlagerungen",
  "Firma môže mať viac skladov — predajňu, dielňu, auto technika. Nastavujú sa v <0>Sklad → Nastavenia</0>.":
    "Ein Unternehmen kann mehrere Lager haben — Verkaufsstelle, Werkstatt, Servicefahrzeug. Sie werden unter <0>Lager → Einstellungen</0> eingerichtet.",
  "Presun tovaru medzi nimi robte cez <0>Sklad → Presuny</0>, nie dvojicou výdaj + príjem. Prevod zachová ocenenie a v histórii je vidieť, že tovar firmu neopustil.":
    "Umlagerungen zwischen ihnen erfassen Sie über <0>Lager → Umlagerungen</0>, nicht als Paar aus Warenausgang und Wareneingang. Die Umlagerung erhält die Bewertung, und in der Historie ist erkennbar, dass die Ware das Unternehmen nicht verlassen hat.",
  "Dodacie listy": "Lieferscheine",
  "Dodací list v <0>Sklad → Dodacie listy</0> je doklad o fyzickom odovzdaní tovaru. Používa sa vtedy, keď tovar odchádza skôr, než sa fakturuje — napríklad na stavbu.":
    "Der Lieferschein unter <0>Lager → Lieferscheine</0> ist der Beleg über die physische Übergabe der Ware. Er wird verwendet, wenn Ware ausgeliefert wird, bevor sie fakturiert ist — zum Beispiel auf eine Baustelle.",
  "Dá sa vytlačiť ako PDF a odovzdať s tovarom.":
    "Er lässt sich als PDF drucken und mit der Ware übergeben.",
  "Minimálne zásoby a objednávky u dodávateľov": "Mindestbestände und Bestellungen bei Lieferanten",
  "Na karte nastavte <0>minimálny stav</0> a prípadne <1>optimálny stav</1>. Zoznam toho, čo je pod limitom, nájdete v <2>Sklad → Pod minimom</2>; upozornenie sa objaví aj na nástenke.":
    "Legen Sie im Artikel einen <0>Mindestbestand</0> und gegebenenfalls einen <1>Optimalbestand</1> fest. Die Liste dessen, was unter dem Limit liegt, finden Sie unter <2>Lager → Unter Mindestbestand</2>; ein Hinweis erscheint auch auf dem Dashboard.",
  "Odtiaľ sa dá rovno pripraviť <0>objednávka u dodávateľa</0>. Faktero navrhne množstvo tak, aby ste sa dostali na optimálny stav. Príjem tovaru sa potom zapíše priamo na objednávku a tá si sama drží prehľad, čo z nej ešte neprišlo.":
    "Von dort lässt sich direkt eine <0>Bestellung beim Lieferanten</0> vorbereiten. Faktero schlägt die Menge so vor, dass Sie den Optimalbestand erreichen. Der Wareneingang wird dann direkt auf die Bestellung gebucht, und diese behält selbst den Überblick, was davon noch nicht eingetroffen ist.",
  "Inventúra porovná fyzický stav so stavom v systéme a rozdiel zaúčtuje.":
    "Die Inventur vergleicht den physischen Bestand mit dem Bestand im System und verbucht die Differenz.",
  "V <0>Sklad → Inventúra</0> založte novú inventúru.":
    "Legen Sie unter <0>Lager → Inventur</0> eine neue Inventur an.",
  "Vyplňte spočítané množstvá pre každú kartu.":
    "Tragen Sie die gezählten Mengen für jeden Artikel ein.",
  "Po uzavretí Faktero vytvorí pohyby typu <0>inventúra</0> s rozdielom.":
    "Nach dem Abschließen erstellt Faktero Bewegungen vom Typ <0>Inventur</0> mit der Differenz.",
  "Inventúrny rozdiel <0>nevstupuje do nákladov zákazky</0> — je to oprava evidencie, nie spotreba materiálu.":
    "Die Inventurdifferenz <0>fließt nicht in die Projektkosten ein</0> — sie ist eine Korrektur der Erfassung, kein Materialverbrauch.",
  "Kategórie, import a export": "Kategorien, Import und Export",
  "Karty sa dajú triediť do <0>kategórií</0>. Pri väčšom sklade je to jediný spôsob, ako sa v ňom vyznať.":
    "Artikel lassen sich in <0>Kategorien</0> einordnen. Bei einem größeren Lager ist das die einzige Möglichkeit, den Überblick zu behalten.",
  "Celý sklad naraz založíte cez <0>Sklad → Import</0> z CSV.":
    "Das gesamte Lager legen Sie auf einmal über <0>Lager → Import</0> aus einer CSV-Datei an.",
  "Opačným smerom je <0>Export skladu CSV</0> v zozname skladových položiek. Súbor obsahuje SKU, názov, aktuálny a minimálny stav, nákupnú a predajnú cenu a hodnotu skladu. Je v UTF-8 so stredníkom ako oddeľovačom, takže sa otvorí v Exceli.":
    "In die Gegenrichtung gibt es <0>Lager als CSV exportieren</0> in der Liste der Lagerartikel. Die Datei enthält SKU, Bezeichnung, aktuellen und Mindestbestand, Einkaufs- und Verkaufspreis sowie den Lagerwert. Sie ist in UTF-8 mit Semikolon als Trennzeichen, sodass sie sich in Excel öffnen lässt.",
  "Na čo si dať pozor": "Worauf Sie achten sollten",
  "<0>Karta bez sledovania stavu</0> sa nikdy neodpíše. Ak vám stav „nič nerobí“, skontrolujte najprv tento prepínač.":
    "Ein <0>Artikel ohne Bestandsführung</0> wird nie abgebucht. Wenn der Bestand „nichts macht“, prüfen Sie zuerst diesen Schalter.",
  "<0>Príjem bez nákupnej ceny</0> pokazí váženú cenu aj maržu. Cenu doplňte hneď, spätne sa dohľadáva ťažko.":
    "Ein <0>Wareneingang ohne Einkaufspreis</0> verfälscht den gewichteten Preis und die Marge. Ergänzen Sie den Preis sofort, nachträglich ist er schwer zu ermitteln.",
  "<0>Koncept faktúry sklad nehýbe.</0> Ak tovar odišiel, faktúru odošlite.":
    "<0>Ein Rechnungsentwurf bewegt das Lager nicht.</0> Wenn die Ware das Haus verlassen hat, senden Sie die Rechnung.",
  "<0>Presun medzi skladmi nerobte výdajom a príjmom</0> — pokazíte tým ocenenie aj históriu.":
    "<0>Umlagerungen zwischen Lagern nicht per Warenausgang und Wareneingang erfassen</0> — damit verfälschen Sie die Bewertung und die Historie.",
  "<0>Uzamknuté obdobie</0> ( <1>uzávierka</1>) nepustí zmeny do starých dokladov. Ak sa pohyb nedá uložiť spätne, býva to práve toto.":
    "Eine <0>gesperrte Periode</0> ( <1>Abschluss</1>) lässt keine Änderungen an alten Belegen zu. Wenn sich eine Bewegung rückwirkend nicht speichern lässt, liegt es meist genau daran.",
  "Skladové karty do Pohody": "Artikel an Pohoda",
  "Ak účtovníčka vedie sklad v Pohode, karty jej vieme posielať priamo — zapína sa to vo <0>Účtovníctvo → Prepojenie s Pohodou</0> a treba k tomu vyplniť členenie skladu.":
    "Wenn die Buchhalterin das Lager in Pohoda führt, können wir ihr die Artikel direkt senden — das wird unter <0>Buchhaltung → Verbindung mit Pohoda</0> aktiviert, und dazu muss die Lagergliederung ausgefüllt werden.",
  "Posiela sa <0>číselník zásob, nie stav skladu</0>. Množstvá v Pohode vznikajú príjemkami a výdajkami, takže dosadené číslo by sa s dokladmi rozišlo. Viac v <1>manuáli k Pohode</1>.":
    "Gesendet wird der <0>Artikelstamm, nicht der Lagerbestand</0>. Mengen entstehen in Pohoda durch Wareneingangs- und Warenausgangsbelege, eine eingesetzte Zahl würde also von den Belegen abweichen. Mehr dazu im <1>Handbuch zu Pohoda</1>.",
} satisfies Record<string, string>;
