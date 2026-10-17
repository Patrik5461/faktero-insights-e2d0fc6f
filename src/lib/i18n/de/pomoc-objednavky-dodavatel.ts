// Nemecký preklad manuálu v Pomoci (src/routes/pomoc.objednavky-dodavatel.tsx). Kľúče vyrába pomoc-preklad.test.tsx.
export default {
  "Pomoc — Objednávky u dodávateľov — Faktero": "Hilfe — Bestellungen bei Lieferanten — Faktero",
  "Objednávky u dodávateľov: návrh doobjednania podľa minimálnych zásob, odoslanie, čiastočný príjem tovaru a stav objednávky.":
    "Bestellungen bei Lieferanten: Nachbestellvorschlag nach Mindestbestand, Versand, Teileingang der Ware und Bestellstatus.",
  "Čo máte objednané, čo už prišlo a čo ešte čakáte.":
    "Was Sie bestellt haben, was schon angekommen ist und was noch aussteht.",
  "Načo sú objednávky u dodávateľov": "Wozu Bestellungen bei Lieferanten dienen",
  "Objednávka u dodávateľa je opak <0>prijatej objednávky</0>: tentokrát ste odberateľom vy. Drží prehľad o tom, čo je objednané, čo už prišlo a čo ešte čakáte.":
    "Eine Bestellung beim Lieferanten ist das Gegenstück zur <0>eingegangenen Bestellung</0>: Diesmal sind Sie der Kunde. Sie behält den Überblick, was bestellt ist, was schon angekommen ist und was noch aussteht.",
  "Vďaka nej viete, že tovar je „na ceste“ — a nemusíte ho objednávať druhýkrát len preto, že na sklade nie je.":
    "So wissen Sie, dass die Ware „unterwegs“ ist — und müssen sie nicht ein zweites Mal bestellen, nur weil sie nicht auf Lager ist.",
  "Vytvorenie objednávky": "Bestellung erstellen",
  "V <0>Sklad → Objednávky u dodávateľov → Nová</0> vyberte dodávateľa, sklad, kam tovar príde, a položky.":
    "Wählen Sie unter <0>Lager → Bestellungen bei Lieferanten → Neu</0> den Lieferanten, das Lager, in das die Ware kommt, und die Positionen.",
  "Rýchlejšia cesta vedie cez <0>Sklad → Pod minimom</0>. Faktero navrhne, čo doobjednať a v akom množstve, aby ste sa dostali na <1>optimálny stav</1> karty. Návrh sa dá pred odoslaním upraviť.":
    "Schneller geht es über <0>Lager → Unter Mindestbestand</0>. Faktero schlägt vor, was in welcher Menge nachzubestellen ist, damit Sie den <1>optimalen Bestand</1> des Artikels erreichen. Der Vorschlag lässt sich vor dem Senden anpassen.",
  "Objednávka sa dá priradiť na <0>zákazku</0>. Pozor: <1>objednaný tovar ešte nie je náklad zákazky</1> — nákladom sa stane až jeho výdajom zo skladu.":
    "Eine Bestellung kann einem <0>Projekt</0> zugeordnet werden. Achtung: <1>Bestellte Ware ist noch kein Projektaufwand</1> — zu Kosten wird sie erst durch den Warenausgang aus dem Lager.",
  "Stavy a príjem tovaru": "Status und Wareneingang",
  "<0>Rozpracovaná</0> — dá sa voľne meniť aj zmazať.":
    "<0>In Bearbeitung</0> — kann frei geändert und gelöscht werden.",
  "<0>Odoslaná</0> — odteraz je to doklad. Nemaže sa, len ruší.":
    "<0>Gesendet</0> — ab jetzt ist es ein Beleg. Er wird nicht gelöscht, nur storniert.",
  "<0>Čiastočne prijatá</0> — časť tovaru prišla.":
    "<0>Teilweise eingegangen</0> — ein Teil der Ware ist angekommen.",
  "<0>Prijatá</0> — prišlo všetko.": "<0>Eingegangen</0> — alles ist angekommen.",
  "<0>Zrušená</0>.": "<0>Storniert</0>.",
  "Stav sa <0>počíta z prijatých množstiev</0>, nenastavuje sa ručne. Príjem zapisujte priamo na objednávku — vtedy vznikne skladový pohyb a objednávka si sama posunie stav.":
    "Der Status wird <0>aus den eingegangenen Mengen berechnet</0>, nicht manuell gesetzt. Erfassen Sie den Eingang direkt an der Bestellung — dann entsteht eine Lagerbewegung und die Bestellung aktualisiert ihren Status selbst.",
  "Pri príjme <0>vyplňte nákupnú cenu</0>. Bez nej sa pokazí vážená cena skladu a marža na predaji bude nepravdivá.":
    "Tragen Sie beim Eingang <0>den Einkaufspreis ein</0>. Ohne ihn wird der gewichtete Durchschnittspreis des Lagers verfälscht und die Marge beim Verkauf stimmt nicht.",
} satisfies Record<string, string>;
