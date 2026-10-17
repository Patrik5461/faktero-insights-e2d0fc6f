// Nemecký preklad manuálu v Pomoci (src/routes/pomoc.objednavky.tsx). Kľúče vyrába pomoc-preklad.test.tsx.
export default {
  "Pomoc — Prijaté objednávky — Faktero": "Hilfe — Eingegangene Bestellungen — Faktero",
  "Prijaté objednávky od odberateľov: potvrdenie, rezervácia tovaru, čiastočné fakturovanie a stav vybavenia.":
    "Eingegangene Bestellungen von Kunden: Bestätigung, Warenreservierung, Teilabrechnung und Erledigungsstatus.",
  "Pomoc · Objednávky": "Hilfe · Bestellungen",
  "Prijaté objednávky od odberateľov": "Eingegangene Bestellungen von Kunden",
  "Čo si u vás odberatelia objednali, čo z toho ešte nie je vyfakturované a ako sa objednávka vybavuje aj po častiach.":
    "Was Kunden bei Ihnen bestellt haben, was davon noch nicht abgerechnet ist und wie eine Bestellung auch in Teilen erledigt wird.",
  "Načo sú prijaté objednávky": "Wozu eingegangene Bestellungen",
  "Objednávka je <0>záväzok odberateľa</0>, že si tovar alebo prácu vezme. Uzatvára reťaz <1>ponuka → objednávka → faktúra</1>: ponuka je návrh, ktorý ešte nikto neprijal; objednávka je prijatý návrh, ktorý sa postupne vybavuje.":
    "Eine Bestellung ist eine <0>Verpflichtung des Kunden</0>, die Ware oder Leistung abzunehmen. Sie schließt die Kette <1>Angebot → Bestellung → Rechnung</1>: Ein Angebot ist ein Vorschlag, den noch niemand angenommen hat; eine Bestellung ist ein angenommener Vorschlag, der schrittweise erledigt wird.",
  "Objednávka odpovedá na dve otázky, na ktoré faktúra sama neodpovie:":
    "Eine Bestellung beantwortet zwei Fragen, die die Rechnung allein nicht beantwortet:",
  "čo sme sľúbili a ešte nedodali,": "was wir zugesagt und noch nicht geliefert haben,",
  "koľko peňazí máme rozpracovaných.": "wie viel Geld in Bearbeitung ist.",
  "Ako objednávka vznikne": "So entsteht eine Bestellung",
  "Dvoma spôsobmi:": "Auf zwei Arten:",
  "ručne v <0>Objednávky → Nová objednávka</0>,":
    "manuell unter <0>Bestellungen → Neue Bestellung</0>,",
  "z prijatej cenovej ponuky tlačidlom <0>Vytvoriť objednávku</0> — položky aj ceny prejdú tak, ako ich odberateľ videl.":
    "aus einem angenommenen Angebot über die Schaltfläche <0>Bestellung erstellen</0> — Positionen und Preise werden so übernommen, wie der Kunde sie gesehen hat.",
  "Číslo pridelí Faktero v tvare <0>OBJ{rok}{poradie}</0>. Zvlášť sa eviduje <1>číslo objednávky u odberateľa</1> — to sa potom napíše na faktúru, aby ju odberateľ vedel spárovať.":
    "Die Nummer vergibt Faktero im Format <0>OBJ{rok}{poradie}</0>. Separat erfasst wird die <1>Bestellnummer des Kunden</1> — sie wird dann auf die Rechnung gedruckt, damit der Kunde sie zuordnen kann.",
  "Ceny sa dopĺňajú z <0>cenníka</0> rovnako ako na faktúre.":
    "Preise werden wie auf der Rechnung aus der <0>Preisliste</0> ergänzt.",
  "Stavy objednávky": "Bestellstatus",
  "<0>Rozpracovaná</0> — pracujete na nej, dá sa voľne meniť aj zmazať.":
    "<0>In Bearbeitung</0> — Sie arbeiten daran, sie lässt sich frei ändern und auch löschen.",
  "<0>Potvrdená</0> — objednávka platí. Ak je zapnutá rezervácia, tovar sa drží.":
    "<0>Bestätigt</0> — die Bestellung gilt. Ist die Reservierung aktiviert, wird die Ware zurückgehalten.",
  "<0>Čiastočne vybavená</0> — časť je vyfakturovaná.":
    "<0>Teilweise erledigt</0> — ein Teil ist abgerechnet.",
  "<0>Vybavená</0> — vyfakturované je všetko.": "<0>Erledigt</0> — alles ist abgerechnet.",
  "<0>Zrušená</0> — z objednávky nebude nič; rezervácie sa uvoľnia.":
    "<0>Storniert</0> — aus der Bestellung wird nichts; Reservierungen werden freigegeben.",
  "Stav sa <0>nenastavuje ručne</0>. Faktero ho počíta z toho, koľko je naozaj vyfakturované. Ručne nastavený stav by sa skôr či neskôr rozišiel so skutočnosťou.":
    "Der Status wird <0>nicht manuell gesetzt</0>. Faktero berechnet ihn daraus, wie viel tatsächlich abgerechnet ist. Ein manuell gesetzter Status würde früher oder später von der Realität abweichen.",
  "Vybavovanie faktúrami — aj po častiach": "Erledigung per Rechnung — auch in Teilen",
  "Na detaile objednávky je tlačidlo <0>Vyfakturovať</0>. Otvorí novú faktúru a prenesie do nej <1>len to, čo ešte zostáva</1> — nie celú objednávku.":
    "In der Bestelldetailansicht gibt es die Schaltfläche <0>Abrechnen</0>. Sie öffnet eine neue Rechnung und überträgt in diese <1>nur das, was noch offen ist</1> — nicht die ganze Bestellung.",
  "Množstvá vo faktúre sa dajú znížiť. Keď z objednaných 10 kusov vyfakturujete 4, objednávka prejde na <0>Čiastočne vybavená</0> a nabudúce vám ponúkne zvyšných 6. Keď dofakturujete zvyšok, prepne sa na <1>Vybavená</1> a tlačidlo zmizne.":
    "Die Mengen in der Rechnung lassen sich reduzieren. Wenn Sie von 10 bestellten Stück 4 abrechnen, wechselt die Bestellung auf <0>Teilweise erledigt</0> und bietet Ihnen beim nächsten Mal die restlichen 6 an. Wenn Sie den Rest abrechnen, wechselt sie auf <1>Erledigt</1> und die Schaltfläche verschwindet.",
  "Vybavenie sa posunie <0>až keď faktúra naozaj vznikne</0>. Ak by sa uloženie faktúry nepodarilo, objednávka ostane, kde bola.":
    "Die Erledigung wird <0>erst fortgeschrieben, wenn die Rechnung tatsächlich entstanden ist</0>. Schlägt das Speichern der Rechnung fehl, bleibt die Bestellung, wo sie war.",
  "V detaile objednávky je zoznam všetkých faktúr, ktoré z nej vznikli, a stĺpec <0>Zostáva</0> pri každej položke.":
    "In der Bestelldetailansicht finden Sie eine Liste aller daraus entstandenen Rechnungen und bei jeder Position die Spalte <0>Offen</0>.",
  "Ak na objednávke zapnete <0>Po potvrdení rezervovať tovar na sklade</0>, potvrdením sa objednané množstvá zarezervujú. Tovar ostane fyzicky na sklade, ale zníži sa <1>dostupné množstvo</1>, takže ho niekto iný nepredá omylom.":
    "Aktivieren Sie auf der Bestellung <0>Nach Bestätigung Ware im Lager reservieren</0>, werden mit der Bestätigung die bestellten Mengen reserviert. Die Ware bleibt physisch im Lager, aber die <1>verfügbare Menge</1> sinkt, sodass niemand anderes sie versehentlich verkauft.",
  "Rezervujú sa len položky, ktoré majú skladovú kartu so sledovaným stavom. Zrušením objednávky sa rezervácie zrušia, vybavením uvoľnia.":
    "Reserviert werden nur Positionen mit einem Artikel mit geführtem Bestand. Durch Stornieren der Bestellung werden die Reservierungen aufgehoben, durch Erledigen freigegeben.",
  "Úprava, zrušenie, mazanie": "Bearbeiten, Stornieren, Löschen",
  "Objednávku možno upravovať, kým nie je vybavená alebo zrušená. Pri úprave si <0>pamätá, čo je už vyfakturované</0> — prepis položiek vybavenie nevynuluje.":
    "Eine Bestellung kann bearbeitet werden, solange sie nicht erledigt oder storniert ist. Beim Bearbeiten <0>merkt sie sich, was bereits abgerechnet ist</0> — das Überschreiben der Positionen setzt die Erledigung nicht zurück.",
  "<0>Zmazať sa dá len rozpracovaná objednávka.</0> Potvrdená je záväzok voči odberateľovi — tá sa <1>ruší</1>, aby po nej ostala stopa.":
    "<0>Löschen lässt sich nur eine Bestellung in Bearbeitung.</0> Eine bestätigte ist eine Verpflichtung gegenüber dem Kunden — sie wird <1>storniert</1>, damit eine Spur bleibt.",
  Termíny: "Termine",
  "Požadovaný termín dodania je nepovinný, ale oplatí sa. Objednávka, ktorá je po termíne a nie je vybavená, sa v zozname označí červeným <0>po termíne</0> a v detaile upozorní.":
    "Der gewünschte Liefertermin ist optional, lohnt sich aber. Eine Bestellung, die überfällig und nicht erledigt ist, wird in der Liste rot als <0>überfällig</0> markiert und in der Detailansicht hervorgehoben.",
  "Rozpracovaná objednávka sa nesleduje — kým nie je potvrdená, nie je čo vybavovať.":
    "Eine Bestellung in Bearbeitung wird nicht überwacht — solange sie nicht bestätigt ist, gibt es nichts zu erledigen.",
} satisfies Record<string, string>;
