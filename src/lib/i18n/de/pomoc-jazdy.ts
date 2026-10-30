// Nemecký preklad manuálu v Pomoci (src/routes/pomoc.jazdy.tsx). Kľúče vyrába pomoc-preklad.test.tsx.
export default {
  "Pomoc — Kniha jázd — Faktero": "Hilfe — Fahrtenbuch — Faktero",
  "Kniha jázd vo Faktere: vozidlá, spotreba, tankovanie, GPS záznam, priradenie jazdy na zákazku a export.":
    "Fahrtenbuch in Faktero: Fahrzeuge, Verbrauch, Tanken, GPS-Aufzeichnung, Zuordnung von Fahrten zu Projekten und Export.",
  "Pomoc · Kniha jázd": "Hilfe · Fahrtenbuch",
  "Vozidlá, spotreba, tankovanie, GPS záznam a prepojenie jázd so zákazkami.":
    "Fahrzeuge, Verbrauch, Tanken, GPS-Aufzeichnung und Verknüpfung von Fahrten mit Projekten.",
  "Než zapíšete prvú jazdu": "Bevor Sie die erste Fahrt erfassen",
  "Najprv založte vozidlo v <0>Jazdy → Vozidlá a tankovanie</0>. Okrem značky a evidenčného čísla vyplňte <1>spotrebu v litroch na 100 km</1>.":
    "Legen Sie zuerst unter <0>Fahrten → Fahrzeuge und Tanken</0> ein Fahrzeug an. Neben Marke und Kennzeichen tragen Sie den <1>Verbrauch in Litern pro 100 km</1> ein.",
  "Bez spotreby Faktero neurčí, koľko paliva sa minulo — a náklad na dopravu vyjde nula, vrátane <0>vyhodnotenia zákaziek</0>.":
    "Ohne Verbrauch kann Faktero nicht ermitteln, wie viel Kraftstoff verbraucht wurde — die Fahrtkosten betragen dann null, auch in der <0>Projektauswertung</0>.",
  "Zápis jazdy": "Fahrt erfassen",
  "V <0>Jazdy → Nová jazda</0> zadajte vozidlo, dátum, odkiaľ a kam, počet kilometrov a účel.":
    "Geben Sie unter <0>Fahrten → Neue Fahrt</0> Fahrzeug, Datum, Start und Ziel, die Kilometer und den Zweck ein.",
  "Spotrebované palivo Faktero dopočíta zo spotreby vozidla. Jazdu možno priradiť na <0>zákazku</0> — potom sa jej cena objaví v nákladoch tej zákazky.":
    "Den verbrauchten Kraftstoff berechnet Faktero aus dem Verbrauch des Fahrzeugs. Eine Fahrt kann einem <0>Projekt</0> zugeordnet werden — ihre Kosten erscheinen dann bei den Kosten dieses Projekts.",
  "Rozlišuje sa <0>služobná</0> a <1>súkromná</1> jazda; do nákladov idú len služobné. Charakter jazdy vyberiete priamo vo formulári a v zozname je súkromná jazda označená štítkom. Jazdy bez uvedeného charakteru sa berú ako služobné — tak vznikali staršie záznamy.":
    "Unterschieden wird zwischen <0>dienstlicher</0> und <1>privater</1> Fahrt; in die Kosten fließen nur Dienstfahrten ein. Die Art der Fahrt wählen Sie direkt im Formular, in der Liste ist eine Privatfahrt mit einem Label gekennzeichnet. Fahrten ohne Angabe gelten als dienstlich — so sind ältere Einträge entstanden.",
  "Oprava a vymazanie jazdy": "Fahrt korrigieren und löschen",
  "Na každom riadku v <0>zozname jázd</0> je ceruzka — otvorí tú istú jazdu na úpravu. Opraviť sa dá všetko vrátane tachometra, vozidla, zákazky aj charakteru jazdy.":
    "In jeder Zeile der <0>Fahrtenliste</0> gibt es einen Stift — er öffnet dieselbe Fahrt zur Bearbeitung. Korrigieren lässt sich alles, auch Kilometerstand, Fahrzeug, Projekt und Art der Fahrt.",
  "Pri jazdách stiahnutých z Commandera alebo zaznamenaných GPS-kou <0>opravujte, nemažte</0> — vymazaním sa stratí uložená trasa. Nočná synchronizácia ju sama nevráti, lebo sťahuje len čerstvé dni; museli by ste si dané obdobie natiahnuť ručne v <1>Integráciách</1>.":
    "Fahrten, die aus Commander geladen oder per GPS aufgezeichnet wurden, <0>korrigieren Sie, statt sie zu löschen</0> — beim Löschen geht die gespeicherte Route verloren. Die nächtliche Synchronisierung stellt sie nicht wieder her, da sie nur die letzten Tage lädt; den Zeitraum müssten Sie manuell unter <1>Integrationen</1> nachladen.",
  "Kôš na jazdy nie je: vymazanie je okamžité a nedá sa vrátiť. Preto sa pýta na potvrdenie.":
    "Einen Papierkorb für Fahrten gibt es nicht: Das Löschen erfolgt sofort und lässt sich nicht rückgängig machen. Deshalb wird eine Bestätigung abgefragt.",
  "Tankovanie a cena paliva": "Tanken und Kraftstoffpreis",
  "Tankovania sa zapisujú pri vozidle. Z nich Faktero berie <0>cenu za liter</0>, ktorou oceňuje jazdy.":
    "Tankvorgänge werden beim Fahrzeug erfasst. Daraus übernimmt Faktero den <0>Preis pro Liter</0>, mit dem die Fahrten bewertet werden.",
  "Použije sa posledná cena z tankovaní daného vozidla; ak vozidlo tankovanie nemá, posledná cena ktoréhokoľvek vozidla firmy. Kým nie je ani jedno tankovanie, jazdy sa neocenia.":
    "Verwendet wird der letzte Preis aus den Tankvorgängen des jeweiligen Fahrzeugs; hat das Fahrzeug keine, der letzte Preis eines beliebigen Fahrzeugs des Unternehmens. Solange es keinen einzigen Tankvorgang gibt, werden Fahrten nicht bewertet.",
  "GPS a automatický záznam": "GPS und automatische Aufzeichnung",
  "<0>GPS jazda</0> zaznamená trasu priamo v mobile — stačí spustiť na začiatku a ukončiť na konci cesty. Kilometre sa dopočítajú samy.":
    "Eine <0>GPS-Fahrt</0> zeichnet die Route direkt auf dem Smartphone auf — einfach zu Beginn starten und am Ende der Fahrt beenden. Die Kilometer werden automatisch berechnet.",
  "<0>V mobilnej aplikácii si jazdu všimne telefón sám.</0> Keď rozpozná, že idete autom, začne merať a spýta sa až na konci — jazdu potom buď potvrdíte, alebo zahodíte. Kým meranie beží, je to vidieť: v aplikácii svieti pruh „Nahrávam jazdu“ a <1>na uzamknutej obrazovke</1> beží čas a narastajúce kilometre, takže sa nemusíte prepínať do aplikácie ani ju nechať otvorenú. Potrebuje to iPhone s iOS 16.1 alebo novším.":
    "<0>In der mobilen App erkennt das Smartphone die Fahrt selbst.</0> Sobald es erkennt, dass Sie Auto fahren, beginnt es zu messen und fragt erst am Ende nach — die Fahrt bestätigen Sie dann oder verwerfen sie. Solange die Messung läuft, ist das sichtbar: In der App leuchtet die Leiste „Nahrávam jazdu“ und <1>auf dem Sperrbildschirm</1> laufen Zeit und Kilometer mit, sodass Sie weder in die App wechseln noch sie geöffnet lassen müssen. Erforderlich ist ein iPhone mit iOS 16.1 oder neuer.",
  "Automatické rozpoznávanie sa dá vypnúť priamo na obrazovke <0>Jazda</0> prepínačom „Rozpoznávať jazdy automaticky“; vtedy sa meranie spúšťa ručne tlačidlom.":
    "Die automatische Erkennung lässt sich direkt auf dem Bildschirm <0>Fahrt</0> mit dem Schalter „Rozpoznávať jazdy automaticky“ deaktivieren; die Messung wird dann manuell per Schaltfläche gestartet.",
  "Prehľad a export": "Übersicht und Export",
  "<0>Prehľad</0> ukazuje najazdené kilometre a náklady po vozidlách a obdobiach.":
    "Die <0>Übersicht</0> zeigt gefahrene Kilometer und Kosten nach Fahrzeugen und Zeiträumen.",
  "<0>Export</0> pripraví knihu jázd na odovzdanie účtovníčke alebo na kontrolu.":
    "Der <0>Export</0> bereitet das Fahrtenbuch zur Übergabe an die Buchhaltung oder zur Prüfung vor.",
  "Na knihu jázd platí <0>uzamknutie období</0> — po uzavretí sa staré jazdy už nedajú meniť.":
    "Für das Fahrtenbuch gilt die <0>Periodensperre</0> — nach dem Abschluss lassen sich alte Fahrten nicht mehr ändern.",
} satisfies Record<string, string>;
