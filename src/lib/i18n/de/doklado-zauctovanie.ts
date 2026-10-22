// Zaúčtovanie pri spracovaní Nespracovaných dokladov: pravidlo s hviezdičkou,
// zaúčtovanie vytvorením, nastavenia Nespracovaných, hromadná úprava a voľby exportu.
export default {
  "Vytvorený doklad je zaúčtovaný a pripravený na export":
    "Erstellter Beleg ist verbucht und exportbereit",
  "Prijatá faktúra vytvorená z Nespracovaných dostane predkontáciu a členenie DPH z dokladu, pravidla, kategórie alebo predvolených a rovno ide do Pohody. Vypnuté = každú faktúru treba ešte zaúčtovať.":
    "Eine aus den unverarbeiteten Belegen erstellte Eingangsrechnung erhält Vorkontierung und MwSt.-Kennzeichen aus dem Beleg, der Regel, der Kategorie oder den Voreinstellungen und geht direkt an Pohoda. Ausgeschaltet = jede Rechnung muss noch verbucht werden.",
  "Po vytvorení dokladu otvoriť ďalší nespracovaný doklad":
    "Nach dem Erstellen den nächsten unverarbeiteten Beleg öffnen",
  "Vypnuté = po vytvorení sa vrátite do zoznamu.":
    "Ausgeschaltet = nach dem Erstellen kehren Sie zur Liste zurück.",
  "Kontrolovať splatnosť pred dátumom vystavenia": "Fälligkeit vor dem Rechnungsdatum prüfen",
  "Vypnuté = doklad so splatnosťou skoršou ako vystavenie sa dá vytvoriť.":
    "Ausgeschaltet = ein Beleg mit Fälligkeit vor dem Rechnungsdatum kann erstellt werden.",
  "Používať vyťažené položky faktúr": "Ausgelesene Rechnungspositionen verwenden",
  "Vypnuté = faktúra ide do účtovníctva podľa súčtov a rozpisu DPH, položky sa dajú pri doklade zapnúť.":
    "Ausgeschaltet = die Rechnung geht nach Summen und MwSt.-Aufschlüsselung in die Buchhaltung, die Positionen lassen sich beim Beleg einschalten.",
  "Používať vyťažené položky bločkov": "Ausgelesene Kassenbonpositionen verwenden",
  "Preberať číslo dodacieho listu z dokladu": "Lieferscheinnummer aus dem Beleg übernehmen",
  "Tolerancia zaokrúhlenia položiek (v centoch)": "Rundungstoleranz der Positionen (in Cent)",
  "Keď súčet položiek nesedí so sumou dokladu najviac o toľko centov, doklad sa dá vytvoriť a rozdiel sa doplní vyrovnávacou položkou.":
    "Weicht die Summe der Positionen höchstens um so viele Cent vom Belegbetrag ab, lässt sich der Beleg erstellen und die Differenz wird durch eine Ausgleichsposition ergänzt.",
  "Faktúra je vytvorená medzi prijatými faktúrami — čaká na zaúčtovanie (chýba predkontácia alebo členenie DPH)":
    "Die Rechnung wurde bei den Eingangsrechnungen erstellt — sie wartet auf die Verbuchung (Vorkontierung oder MwSt.-Kennzeichen fehlt)",
  "Faktúra je už uhradená": "Rechnung ist bereits bezahlt",
  "Položky nesedia so sumou o {rozdiel} — doplní sa vyrovnávacia položka.":
    "Die Positionen weichen um {rozdiel} vom Betrag ab — eine Ausgleichsposition wird ergänzt.",
  "Doplnilo pravidlo účtovania podľa dodávateľa.":
    "Von der Buchungsregel anhand des Lieferanten ergänzt.",
  pravidlo: "Regel",
  "Vyplňte aspoň jedno pole, ktoré sa má zmeniť.":
    "Füllen Sie mindestens ein Feld aus, das geändert werden soll.",
  "Zmenené doklady: {n}": "Geänderte Belege: {n}",
  "Presunúť vybrané doklady ({n}) do koša?":
    "Ausgewählte Belege ({n}) in den Papierkorb verschieben?",
  "V koši: {n}": "Im Papierkorb: {n}",
  "Hromadná úprava": "Sammelbearbeitung",
  "Zmeniť vybrané": "Ausgewählte ändern",
  "Do koša": "In den Papierkorb",
  "Vybrať doklad": "Beleg auswählen",
  "Radenie dokladov v dávke": "Reihenfolge der Belege im Stapel",
  "Podľa dátumu dokladu": "Nach Belegdatum",
  "Podľa čísla dokladu": "Nach Belegnummer",
  "Podľa poradia nahratia": "Nach Reihenfolge des Hochladens",
  "Exportovať položky dokladu": "Belegpositionen exportieren",
  "Bloček pôjde do Pohody po položkách, nie jedným riadkom podľa sadzieb DPH.":
    "Der Kassenbon geht positionsweise an Pohoda, nicht als eine Zeile je MwSt.-Satz.",

  // Manuály (Pomoc)
  "Kam sa čo uloží:": "Wohin was gespeichert wird:",
  "Rovno <0>zaúčtujte</0>: predkontácia, členenie DPH a kontrolného výkazu, stredisko, činnosť, zákazka, kategória. Keď na dodávateľa sedí <1>pravidlo účtovania</1>, jeho kódy sa doplnia samy a pri poli svieti hviezdička. Po zmene dodávateľa sa pravidlo vyhodnotí znova; keď sedí viac pravidiel, iné vyberiete cez <2>Použiť pravidlo</2>.":
    "<0>Verbuchen</0> Sie direkt: Vorkontierung, MwSt.-Kennzeichen und Kennzeichen der Kontrollmeldung (KV DPH), Kostenstelle, Tätigkeit, Projekt, Kategorie. Passt eine <1>Buchungsregel</1> auf den Lieferanten, werden ihre Codes automatisch ergänzt und am Feld leuchtet ein Stern. Nach einer Änderung des Lieferanten wird die Regel neu ausgewertet; passen mehrere Regeln, wählen Sie über <2>Regel anwenden</2> eine andere.",
  "Kliknite na <0>Vytvoriť</0> — doklad sa presunie medzi prijaté faktúry, doklady alebo iné doklady a otvorí sa ďalší nespracovaný. <1>Uložiť zmeny</1> ho nechá rozpracovaný na neskôr.":
    "Klicken Sie auf <0>Erstellen</0> — der Beleg wird in die Eingangsrechnungen, Belege oder Sonstigen Belege verschoben und der nächste unverarbeitete Beleg öffnet sich. <1>Änderungen speichern</1> lässt ihn für später in Verarbeitung.",
  "Vytvorený doklad je <0>skontrolovaný a pripravený na export</0>. Bloček je spracovaný, prijatá faktúra zaúčtovaná — keď sa pre ňu dá určiť predkontácia aj členenie DPH (z dokladu, z pravidla, z kategórie alebo predvolené v <1>Predkontáciách</1>). Bez nich čaká medzi prijatými faktúrami na zaúčtovanie. Zaplatenú faktúru označíte voľbou <2>Faktúra je už uhradená</2>.":
    "Ein erstellter Beleg ist <0>geprüft und exportbereit</0>. Ein Kassenbon ist verarbeitet, eine Eingangsrechnung verbucht — sofern sich Vorkontierung und MwSt.-Kennzeichen bestimmen lassen (aus dem Beleg, der Regel, der Kategorie oder den Voreinstellungen unter <1>Vorkontierungen</1>). Ohne sie wartet sie bei den Eingangsrechnungen auf die Verbuchung. Eine bezahlte Rechnung markieren Sie mit der Option <2>Rechnung ist bereits bezahlt</2>.",
  "<0>Hromadná úprava:</0> v zozname nespracovaných dokladov označte viac dokladov a nastavte im naraz druh, zákazku, predkontáciu, členenie DPH, stredisko alebo činnosť, prípadne ich presuňte do koša. Prázdne pole sa nemení.":
    "<0>Sammelbearbeitung:</0> Markieren Sie in der Liste der unverarbeiteten Belege mehrere Belege und setzen Sie ihnen auf einmal Belegart, Projekt, Vorkontierung, MwSt.-Kennzeichen, Kostenstelle oder Tätigkeit, oder verschieben Sie sie in den Papierkorb. Ein leeres Feld wird nicht geändert.",
  "Bločky odfotené v appke alebo zadané vo formulári sú v tom istom zozname — otvoria sa vo formulári dokladu, kde ich spracujete tlačidlom Spracovať. Spracovaný bloček sa presunie do <0>Doklady → Bločky</0>; tam sú len skontrolované bločky, rozdelené na spracované a odovzdané účtovníkovi. Menu Doklady má sekcie Nespracované doklady, Bločky, Prijaté faktúry, Vystavené faktúry, Iné doklady a <1>Kôš</1>, kde sa dajú zmazané doklady obnoviť. Zmazaný nespracovaný doklad ide do koša a dá sa obnoviť.":
    "In der App fotografierte oder im Formular erfasste Kassenbons stehen in derselben Liste — sie öffnen sich im Belegformular, wo Sie sie mit der Schaltfläche Verarbeiten verarbeiten. Ein verarbeiteter Kassenbon wird nach <0>Belege → Kassenbons</0> verschoben; dort liegen nur geprüfte Kassenbons, aufgeteilt in verarbeitete und an den Buchhalter übergebene. Das Menü Belege hat die Bereiche Unverarbeitete Belege, Kassenbons, Eingangsrechnungen, Ausgangsrechnungen, Sonstige Belege und <1>Papierkorb</1>, in dem sich gelöschte Belege wiederherstellen lassen. Ein gelöschter unverarbeiteter Beleg kommt in den Papierkorb und kann wiederhergestellt werden.",
  "<0>Položky</0> majú pri každej sadzbu DPH a príznak prenesenia daňovej povinnosti. Keď súčet položiek nesedí so sumou dokladu, zobrazí sa rozdiel a tlačidlo <1>Pridať vyrovnávaciu položku</1> — bez nej sa doklad nevytvorí. Drobný rozdiel do tolerancie, ktorú si firma nastaví, doklad nezastaví — vyrovnávacia položka sa doplní sama pri vytvorení.":
    "<0>Positionen</0> haben jeweils einen MwSt.-Satz und ein Reverse-Charge-Kennzeichen. Wenn die Summe der Positionen nicht mit dem Belegbetrag übereinstimmt, werden die Differenz und die Schaltfläche <1>Ausgleichsposition hinzufügen</1> angezeigt — ohne sie wird der Beleg nicht erstellt. Eine kleine Differenz bis zur Toleranz, die das Unternehmen einstellt, hält den Beleg nicht auf — die Ausgleichsposition wird beim Erstellen automatisch ergänzt.",
  "V <0>Účtovníctvo → Predkontácie</0>, časť <1>Export a spracovanie dokladov</1>, si nastavíte správanie Nespracovaných dokladov: či je vytvorená faktúra rovno zaúčtovaná, či sa po vytvorení otvorí ďalší doklad, kontrolu splatnosti, toleranciu zaokrúhlenia položiek v centoch, používanie vyťažených položiek faktúr a bločkov a preberanie čísla dodacieho listu.":
    "Unter <0>Buchhaltung → Vorkontierungen</0>, Bereich <1>Export und Belegverarbeitung</1>, stellen Sie das Verhalten der unverarbeiteten Belege ein: ob die erstellte Rechnung direkt verbucht ist, ob sich nach dem Erstellen der nächste Beleg öffnet, die Fälligkeitsprüfung, die Rundungstoleranz der Positionen in Cent, die Verwendung ausgelesener Positionen von Rechnungen und Kassenbons sowie die Übernahme der Lieferscheinnummer.",
  "<0>Skener</0> — odfotíte bloček alebo faktúru a text z nej prečíta server. Pri slovenských pokladničných dokladoch stačí naskenovať QR kód: doklad si Faktero vypýta priamo z Finančnej správy aj s položkami a sadzbami. Viac v <1>manuáli k pokladni</1>. Čo nastavíte pred odfotením (úhrada, kategória, zákazka, predkontácia, komentár), sa uloží k dokladu aj vtedy, keď ho necháte v <2>Nespracovaných dokladoch</2> a dokončíte na webe.":
    "<0>Scanner</0> — Sie fotografieren einen Kassenbon oder eine Rechnung, und der Server liest den Text aus. Bei slowakischen Kassenbelegen genügt es, den QR-Code zu scannen: Faktero ruft den Beleg direkt bei der Finanzverwaltung (Finančná správa) ab, samt Positionen und Steuersätzen. Mehr dazu im <1>Handbuch zur Kasse</1>. Was Sie vor dem Fotografieren einstellen (Zahlung, Kategorie, Projekt, Vorkontierung, Kommentar), wird mit dem Beleg gespeichert, auch wenn Sie ihn in den <2>unverarbeiteten Belegen</2> lassen und im Web fertigstellen.",
  "<0>Radenie dokladov v dávke</0> — podľa dátumu, čísla dokladu alebo poradia nahratia; v tomto poradí ich Pohoda očísluje.":
    "<0>Reihenfolge der Belege im Stapel</0> — nach Datum, Belegnummer oder Reihenfolge des Hochladens; in dieser Reihenfolge nummeriert Pohoda sie.",
  "<0>Exportovať položky dokladu</0> (bločky) — bloček pôjde po položkách, nie jedným riadkom podľa sadzieb DPH. Predvolene podľa nastavenia firmy.":
    "<0>Belegpositionen exportieren</0> (Kassenbons) — der Kassenbon geht positionsweise, nicht als eine Zeile je MwSt.-Satz. Standardmäßig nach der Einstellung des Unternehmens.",
  "Faktúra vytvorená z <0>Nespracovaných dokladov</0> je zaúčtovaná už vytvorením, keď sa pre ňu dá určiť predkontácia aj členenie DPH (z dokladu, pravidla, kategórie alebo predvolených). Kto chce každú faktúru zaúčtovať zvlášť, vypne to v Predkontáciách voľbou <1>Vytvorený doklad je zaúčtovaný a pripravený na export</1>.":
    "Eine aus den <0>unverarbeiteten Belegen</0> erstellte Rechnung ist schon mit dem Erstellen verbucht, sofern sich Vorkontierung und MwSt.-Kennzeichen bestimmen lassen (aus dem Beleg, der Regel, der Kategorie oder den Voreinstellungen). Wer jede Rechnung einzeln verbuchen möchte, schaltet das unter Vorkontierungen mit der Option <1>Erstellter Beleg ist verbucht und exportbereit</1> aus.",
};
