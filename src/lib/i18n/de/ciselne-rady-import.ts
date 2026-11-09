// Export und Import der Nummernkreise (Einstellungen → Nummernkreise → Exportieren / Importieren).
export default {
  ID: "ID",
  "Názov radu": "Name des Nummernkreises",
  "Posledné použité poradie": "Zuletzt verwendete laufende Nummer",
  "Ďalšie číslo (ukážka)": "Nächste Nummer (Vorschau)",
  Predvolený: "Standard",
  "V súbore chýba stĺpec „Druh dokladu“ alebo „Šablóna čísla“. Najjednoduchšie je stiahnuť si export a upraviť ho.":
    "In der Datei fehlt die Spalte „Belegart“ oder „Nummernformat“. Am einfachsten laden Sie den Export herunter und bearbeiten ihn.",
  "Chýba druh dokladu.": "Belegart fehlt.",
  "Neznámy druh dokladu „{druh}“.": "Unbekannte Belegart „{druh}“.",
  "Druh dokladu sa pri existujúcom rade meniť nedá — pre iný druh pridajte nový riadok bez ID.":
    "Die Belegart eines bestehenden Nummernkreises kann nicht geändert werden — fügen Sie für eine andere Art eine neue Zeile ohne ID hinzu.",
  "Chýba šablóna čísla.": "Nummernformat fehlt.",
  "Rad sa nedá jednoznačne spárovať — tú istú šablónu má viac radov. Doplňte stĺpec ID z exportu.":
    "Der Nummernkreis lässt sich nicht eindeutig zuordnen — mehrere Kreise haben dieselbe Vorlage. Ergänzen Sie die Spalte ID aus dem Export.",
  "Chýba názov radu.": "Name des Nummernkreises fehlt.",
  "Názov radu je pridlhý — najviac 60 znakov.": "Der Name ist zu lang — höchstens 60 Zeichen.",
  "Tento rad je v súbore viackrát — ponechajte len jeden riadok.":
    "Dieser Nummernkreis steht mehrfach in der Datei — behalten Sie nur eine Zeile.",
  "Neplatná hodnota „{hodnota}“ v stĺpci Predvolený — napíšte áno alebo nie.":
    "Ungültiger Wert „{hodnota}“ in der Spalte Standard — schreiben Sie ja oder nein.",
  "Neplatná hodnota „{hodnota}“ v stĺpci Aktívny — napíšte áno alebo nie.":
    "Ungültiger Wert „{hodnota}“ in der Spalte Aktiv — schreiben Sie ja oder nein.",
  "Začať od poradia musí byť celé číslo od 1 do 999999 (zadané „{hodnota}“).":
    "„Beginnen ab Nummer“ muss eine ganze Zahl von 1 bis 999999 sein (eingegeben „{hodnota}“).",
  "Číslo nižšie ako posledné použité: {od} ≤ {posledne}. Ďalší doklad by dostal poradie, ktoré už nesie vystavený doklad — zadajte aspoň {min}.":
    "Nummer niedriger als die zuletzt verwendete: {od} ≤ {posledne}. Der nächste Beleg bekäme eine laufende Nummer, die bereits ein ausgestellter Beleg trägt — geben Sie mindestens {min} ein.",
  "Rad s názvom „{nazov}“ už pre tento druh je.": "Ein Nummernkreis namens „{nazov}“ existiert für diese Art bereits.",
  "Predvolený rad môže byť na druh dokladu len jeden — v súbore ich je pre tento druh {n}.":
    "Pro Belegart darf es nur einen Standard-Nummernkreis geben — in der Datei sind es für diese Art {n}.",
  "Rad s týmto názvom už pre tento druh je.": "Ein Nummernkreis mit diesem Namen existiert für diese Art bereits.",
  "Predvolený rad môže byť na druh dokladu len jeden.": "Pro Belegart darf es nur einen Standard-Nummernkreis geben.",
  "Šablóna musí obsahovať poradie — {NN} až {NNNNNN}.":
    "Die Vorlage muss eine laufende Nummer enthalten — {NN} bis {NNNNNN}.",
  "Import číselných radov": "Import der Nummernkreise",
  "V súbore nie sú žiadne riadky s radmi.": "Die Datei enthält keine Zeilen mit Nummernkreisen.",
  "Súbor má viac ako 500 riadkov — rozdeľte ho.": "Die Datei hat mehr als 500 Zeilen — bitte aufteilen.",
  "Zmeniť číslovanie {n} radov?": "Nummerierung von {n} Nummernkreisen ändern?",
  "Nové doklady z týchto radov dostanú čísla podľa novej šablóny či poradia. Vystavené doklady sa neprečíslujú.":
    "Neue Belege aus diesen Kreisen erhalten Nummern nach der neuen Vorlage bzw. Reihenfolge. Ausgestellte Belege werden nicht umnummeriert.",
  "Import sa neuložil: {chyba}": "Der Import wurde nicht gespeichert: {chyba}",
  "Excel (XLSX) alebo CSV v rovnakom tvare ako export. Najjednoduchšie je stiahnuť si „Exportovať“, upraviť a nahrať späť.":
    "Excel (XLSX) oder CSV im selben Aufbau wie der Export. Am einfachsten laden Sie „Exportieren“ herunter, bearbeiten die Datei und laden sie wieder hoch.",
  "Rad sa páruje podľa ID, inak podľa druhu dokladu a šablóny čísla. Riadok bez páru založí nový rad.":
    "Zugeordnet wird nach ID, sonst nach Belegart und Nummernformat. Eine Zeile ohne Treffer legt einen neuen Nummernkreis an.",
  "Poradie sa nedá znížiť pod posledné číslo, ktoré už nesie vystavený doklad. Prázdna bunka hodnotu nemení.":
    "Die laufende Nummer kann nicht unter die letzte Nummer eines ausgestellten Belegs gesenkt werden. Eine leere Zelle ändert den Wert nicht.",
  "Predvolený rad môže byť na druh dokladu len jeden. Stĺpce „Posledné použité poradie“ a „Ďalšie číslo (ukážka)“ sú len na čítanie.":
    "Pro Belegart gibt es nur einen Standard-Nummernkreis. Die Spalten „Zuletzt verwendete laufende Nummer“ und „Nächste Nummer (Vorschau)“ dienen nur zur Information.",
  Rad: "Nummernkreis",
  "Ďalšie číslo": "Nächste Nummer",
  "Čo sa stane": "Was passiert",
  "Založí sa nový rad.": "Ein neuer Nummernkreis wird angelegt.",
  "Rad „{nazov}“ prestane byť predvolený.": "Der Nummernkreis „{nazov}“ ist dann nicht mehr Standard.",
  "Nie je čo uložiť — rady v súbore sú rovnaké ako vo Fakteri.":
    "Nichts zu speichern — die Nummernkreise in der Datei entsprechen denen in Faktero.",
  "Číselné rady sú uložené.": "Die Nummernkreise wurden gespeichert.",
  "Nové rady: {n}": "Neue Nummernkreise: {n}",
  "Zmenené rady: {n}": "Geänderte Nummernkreise: {n}",
  "Uložiť ({n} radov)": "Speichern ({n} Nummernkreise)",
  "Číselné rady exportované ({n})": "Nummernkreise exportiert ({n})",
  "Číselné rady sa nepodarilo exportovať: {chyba}": "Die Nummernkreise konnten nicht exportiert werden: {chyba}",
};
