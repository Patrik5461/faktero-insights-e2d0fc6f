// Kassenbon, der eine Rechnungszahlung ist: Zuordnung zur Eingangsrechnung als Zahlungsbeleg oder Verschieben zu den Sonstigen Belegen.
export default {
  "Bloček je presunutý do Iných dokladov": "Der Kassenbon wurde zu den Sonstigen Belegen verschoben",
  "Bloček je pri faktúre {cislo}, faktúra je uhradená": "Der Kassenbon liegt bei Rechnung {cislo}, die Rechnung ist bezahlt",
  "Bloček je priložený k faktúre {cislo}": "Der Kassenbon ist an Rechnung {cislo} angehängt",
  "Bloček nemá súbor, ktorý by sa dal priložiť": "Der Kassenbon hat keine Datei, die angehängt werden könnte",
  "Bloček sa nenašiel — možno ho už niekto presunul alebo zmazal.": "Kassenbon nicht gefunden — vielleicht hat ihn schon jemand verschoben oder gelöscht.",
  "Doklad len potvrdzuje, že faktúra bola zaplatená — nie je to nákup a DPH sa z neho neúčtuje. Ako bloček by sa náklad započítal druhýkrát.":
    "Der Beleg bestätigt nur, dass die Rechnung bezahlt wurde — es ist kein Einkauf, und die USt wird daraus nicht gebucht. Als Kassenbon würde der Aufwand doppelt gezählt.",
  "Faktúra {cislo} ešte nie je vo Fakteri — najprv ju zapíšte do Prijatých faktúr": "Rechnung {cislo} ist noch nicht in Faktero — erfassen Sie sie zuerst bei den Eingangsrechnungen",
  "Faktúra č. {cislo}": "Rechnung Nr. {cislo}",
  "Nevyzerá ako úhrada faktúry — priraďte ho v detaile bločku": "Sieht nicht nach einer Rechnungszahlung aus — ordnen Sie ihn im Detail des Kassenbons zu",
  "Niektoré bločky sa nepresunuli": "Einige Kassenbons wurden nicht verschoben",
  "Niektoré bločky sa nepriradili": "Einige Kassenbons wurden nicht zugeordnet",
  "Preskočené bločky ostali v Bločkoch — otvorte ich a rozhodnite v detaile.": "Übersprungene Kassenbons sind bei den Kassenbons geblieben — öffnen Sie sie und entscheiden Sie im Detail.",
  "Presunuté do Iných dokladov: {n}": "Zu den Sonstigen Belegen verschoben: {n}",
  "Presunuté {ok}, preskočené {n}": "Verschoben {ok}, übersprungen {n}",
  "Presunúť": "Verschieben",
  "Presunúť / priradiť": "Verschieben / zuordnen",
  "Presunúť / priradiť bloček": "Kassenbon verschieben / zuordnen",
  "Presunúť bloček do Iných dokladov? Vznikne Iný doklad s tým istým súborom, dodávateľom, dátumom a sumou a bloček sa presunie do koša (z DPH aj nákladov zmizne).":
    "Kassenbon zu den Sonstigen Belegen verschieben? Es entsteht ein sonstiger Beleg mit derselben Datei, demselben Lieferanten, Datum und Betrag, und der Kassenbon wandert in den Papierkorb (er verschwindet aus USt und Aufwand).",
  "Presunúť do Iných dokladov": "Zu den Sonstigen Belegen verschieben",
  "Presunúť vybrané bločky ({n}) do Iných dokladov? Z každého vznikne Iný doklad s tým istým súborom a bloček sa presunie do koša (z DPH aj nákladov zmizne). Odovzdané a zamknuté sa preskočia.":
    "Ausgewählte Kassenbons ({n}) zu den Sonstigen Belegen verschieben? Aus jedem entsteht ein sonstiger Beleg mit derselben Datei, und der Kassenbon wandert in den Papierkorb (er verschwindet aus USt und Aufwand). Übergebene und gesperrte werden übersprungen.",
  "Priložiť bloček k faktúre {cislo} ako doklad o úhrade? Nezaplatená faktúra sa označí ako uhradená a bloček sa presunie do koša (z DPH aj nákladov zmizne).":
    "Kassenbon als Zahlungsbeleg an Rechnung {cislo} anhängen? Die unbezahlte Rechnung wird als bezahlt markiert, und der Kassenbon wandert in den Papierkorb (er verschwindet aus USt und Aufwand).",
  "Priradené k faktúram: {n}": "Rechnungen zugeordnet: {n}",
  "Priradiť": "Zuordnen",
  "Priradiť k prijatej faktúre": "Eingangsrechnung zuordnen",
  "Priradiť vybrané bločky ({n}) k prijatým faktúram ako doklady o úhrade? Súbor sa priloží k faktúre, nezaplatená faktúra sa označí ako uhradená a bloček sa presunie do koša. Bloček bez presnej zhody čísla a sumy sa preskočí.":
    "Ausgewählte Kassenbons ({n}) als Zahlungsbelege den Eingangsrechnungen zuordnen? Die Datei wird an die Rechnung angehängt, eine unbezahlte Rechnung wird als bezahlt markiert, und der Kassenbon wandert in den Papierkorb. Kassenbons ohne genaue Übereinstimmung von Nummer und Betrag werden übersprungen.",
  "Priradiť úhrady k faktúram": "Zahlungen den Rechnungen zuordnen",
  "Suma bločku {suma} nesedí so sumou faktúry {cislo} ({sumaFaktury}). Priradiť aj tak?":
    "Der Betrag des Kassenbons {suma} stimmt nicht mit dem Betrag der Rechnung {cislo} ({sumaFaktury}) überein. Trotzdem zuordnen?",
  "Súbor bločku sa nepodarilo načítať.": "Die Datei des Kassenbons konnte nicht geladen werden.",
  "Súbor bločku sa priloží k prijatej faktúre ako doklad o úhrade, nezaplatená faktúra sa označí ako uhradená a bloček sa presunie do koša.":
    "Die Datei des Kassenbons wird als Zahlungsbeleg an die Eingangsrechnung angehängt, eine unbezahlte Rechnung wird als bezahlt markiert, und der Kassenbon wandert in den Papierkorb.",
  "Vyzerá to ako úhrada faktúry {cislo}, nie bloček": "Das sieht nach einer Zahlung der Rechnung {cislo} aus, nicht nach einem Kassenbon",
  "Vyzerá to ako úhrada faktúry, nie bloček": "Das sieht nach einer Rechnungszahlung aus, nicht nach einem Kassenbon",
  "Vyzerá to ako úhrada faktúry, nie bloček — v detaile ho priraďte k prijatej faktúre alebo presuňte do Iných dokladov":
    "Das sieht nach einer Rechnungszahlung aus, nicht nach einem Kassenbon — ordnen Sie ihn im Detail einer Eingangsrechnung zu oder verschieben Sie ihn zu den Sonstigen Belegen",
  "Z bločku vznikne Iný doklad (druh Iné) s tým istým súborom, dodávateľom, dátumom a sumou. Do DPH ani nákladov sa nepočíta. Bloček sa presunie do koša.":
    "Aus dem Kassenbon entsteht ein sonstiger Beleg (Art Sonstiges) mit derselben Datei, demselben Lieferanten, Datum und Betrag. Er zählt weder zur USt noch zum Aufwand. Der Kassenbon wandert in den Papierkorb.",
  "kartou": "mit Karte",
  "prevodom": "per Überweisung",
  "v hotovosti": "bar",
  "Úhrada faktúry k prijatej faktúre ako doklad o úhrade, alebo presun do Iných dokladov":
    "Rechnungszahlung als Zahlungsbeleg zur Eingangsrechnung oder Verschieben zu den Sonstigen Belegen",
  "úhrada faktúry?": "Rechnungszahlung?",
  "Číslo faktúry na bločku nie je": "Keine Rechnungsnummer auf dem Kassenbon",
};
