// Überprüfung der Umsatzsteuerregistrierung in den amtlichen Registern (PlatitelDphRegister.tsx, Glocke).
export default {
  "Register sa nepodarilo overiť: {chyba}": "Das Register konnte nicht abgefragt werden: {chyba}",
  "Prázdne údaje DPH sa doplnili z registra":
    "Fehlende Umsatzsteuerangaben wurden aus dem Register ergänzt",
  "Overené v registri": "Im Register überprüft",
  "Prevziať nastavenie DPH z registra? Režim DPH firmy sa nastaví na „{rezim}“. Ovplyvní sadzby a vety na nových dokladoch, vystavené doklady sa nemenia.":
    "Umsatzsteuer-Einstellung aus dem Register übernehmen? Die Firma wird auf „{rezim}“ gesetzt. Das betrifft Steuersätze und Hinweise auf neuen Belegen, ausgestellte Belege bleiben unverändert.",
  "Prevziať z registra": "Aus dem Register übernehmen",
  "Nastavenie DPH je prevzaté z registra": "Umsatzsteuer-Einstellung aus dem Register übernommen",
  "Overenie v registri DPH": "Prüfung im Umsatzsteuerregister",
  "Overiť teraz": "Jetzt prüfen",
  "Podľa registra Finančnej správy SR: {rezim}{od}. Overené {datum}.":
    "Laut Register der slowakischen Finanzverwaltung: {rezim}{od}. Geprüft am {datum}.",
  " od {datum}": " seit {datum}",
  "Podľa Registra plátců DPH: {rezim}. Overené {datum}.":
    "Laut tschechischem Register der Umsatzsteuerpflichtigen: {rezim}. Geprüft am {datum}.",
  "Firma sa v registri ešte neoverovala.": "Die Firma wurde im Register noch nicht geprüft.",
  "Register sa naposledy nepodarilo overiť ({datum}) — skúsi sa to znova.":
    "Die letzte Registerabfrage ist fehlgeschlagen ({datum}) — sie wird wiederholt.",
  "Podľa registra FS je firma {rezim}{od}, vo Faktere je nastavená ako {nastavene}.":
    "Laut Register der Finanzverwaltung ist die Firma {rezim}{od}, in Faktero ist sie als {nastavene} eingestellt.",
  "Podľa Registra plátců DPH je firma {rezim}, vo Faktere je nastavená ako {nastavene}.":
    "Laut tschechischem Umsatzsteuerregister ist die Firma {rezim}, in Faktero ist sie als {nastavene} eingestellt.",
  "IČ DPH v registri: {ic}.": "USt-IdNr. im Register: {ic}.",
  "Preberám…": "Wird übernommen…",
  "Automaticky overovať platiteľstvo DPH": "Umsatzsteuerregistrierung automatisch prüfen",
  "Raz denne a po zmene IČO alebo IČ DPH. Prázdny režim DPH sa doplní sám, vyplnený sa nikdy neprepíše — pri nesúlade sa ozve zvonček.":
    "Einmal täglich und nach Änderung der IČO oder USt-IdNr. Eine leere Umsatzsteuer-Einstellung wird automatisch ergänzt, eine ausgefüllte nie überschrieben — bei Abweichungen meldet sich die Glocke.",
  "História registrácie DPH": "Verlauf der Umsatzsteuerregistrierung",
  "doplnené do firmy": "in die Firma übernommen",
  "prevzaté z registra": "aus dem Register übernommen",
  "nová registrácia": "neue Registrierung",
  "zrušenie registrácie": "Löschung der Registrierung",
  "zmena druhu registrácie": "Änderung der Registrierungsart",
  "Firma je podľa registra registrovaná pre DPH":
    "Die Firma ist laut Register für die Umsatzsteuer registriert",
  "Registrácia DPH firmy bola podľa registra zrušená":
    "Die Umsatzsteuerregistrierung der Firma wurde laut Register gelöscht",
  "Zmenil sa druh registrácie DPH": "Die Art der Umsatzsteuerregistrierung hat sich geändert",
  "Od {od}. Skontrolujte nastavenie DPH firmy.":
    "Seit {od}. Prüfen Sie die Umsatzsteuer-Einstellung der Firma.",
  "{rezim} od {od}. Skontrolujte nastavenie DPH firmy.":
    "{rezim} seit {od}. Prüfen Sie die Umsatzsteuer-Einstellung der Firma.",
  "Nastavenie DPH firmy nesedí s registrom":
    "Die Umsatzsteuer-Einstellung der Firma stimmt nicht mit dem Register überein",
  "Podľa registra: {rezim}. Vo Faktere: {nastavene}.":
    "Laut Register: {rezim}. In Faktero: {nastavene}.",
  "Finančná správa eviduje dôvody na zrušenie registrácie DPH":
    "Die Finanzverwaltung führt Gründe für die Löschung der Umsatzsteuerregistrierung",
  "Zverejnené {datum}. Registrácia môže byť zrušená z úradnej moci.":
    "Veröffentlicht am {datum}. Die Registrierung kann von Amts wegen gelöscht werden.",
  // Manuál: Nastavenia firmy a DPH.
  "V údajoch firmy sa zaškrtáva <0>Firma je platiteľ DPH</0> a vyberá typ registrácie — § 4, § 4b alebo § 5 pre platiteľa, § 7, § 7a alebo bez registrácie pre ostatných. Pri vyhľadaní podľa IČO sa typ registrácie vyplní zo zoznamu Finančnej správy (českej firme z Registra plátců DPH).":
    "In den Unternehmensdaten aktivieren Sie <0>Unternehmen ist umsatzsteuerpflichtig</0> und wählen die Art der Registrierung — § 4, § 4b oder § 5 für umsatzsteuerpflichtige Unternehmen, § 7, § 7a oder ohne Registrierung für die übrigen. Bei der Suche nach der IČO wird die Art der Registrierung aus der Liste der slowakischen Finanzverwaltung übernommen (bei einem tschechischen Unternehmen aus dem Register der Umsatzsteuerpflichtigen).",
  "Pod výberom je <0>Overenie v registri DPH</0>: kedy a čo register naposledy povedal a história registrácie. Zapnuté <1>Automaticky overovať platiteľstvo DPH</1> overuje firmu raz denne a po zmene IČO alebo IČ DPH. Prázdny režim DPH sa doplní sám, vyplnený sa nikdy neprepíše — keď s registrom nesedí, ukáže sa upozornenie s tlačidlom <2>Prevziať z registra</2> a ozve sa zvonček. Zvonček hlási aj novú registráciu, jej zrušenie a dôvody na zrušenie, ktoré zverejnila Finančná správa.":
    "Unter der Auswahl steht die <0>Prüfung im Umsatzsteuerregister</0>: wann und was das Register zuletzt gemeldet hat, und der Verlauf der Registrierung. Ist <1>Umsatzsteuerregistrierung automatisch prüfen</1> aktiviert, wird das Unternehmen einmal täglich und nach Änderung der IČO oder USt-IdNr. geprüft. Eine leere Umsatzsteuer-Einstellung wird automatisch ergänzt, eine ausgefüllte nie überschrieben — weicht sie vom Register ab, erscheint ein Hinweis mit der Schaltfläche <2>Aus dem Register übernehmen</2> und die Glocke meldet sich. Die Glocke meldet auch eine neue Registrierung, ihre Löschung und von der Finanzverwaltung veröffentlichte Löschungsgründe.",
  "Neplatiteľovi sa v doklade ponúka len nulová sadzba a na faktúru pribudne veta, prečo na nej daň nie je. Typ registrácie Faktero overuje v zozname Finančnej správy (paragraf registrácie a dátum) a českej firme v Registri plátců DPH — pozri <0>Nastavenia firmy</0>.":
    "Einem nicht Steuerpflichtigen wird im Beleg nur der Nullsatz angeboten, und auf der Rechnung erscheint ein Satz, warum keine Steuer ausgewiesen ist. Die Art der Registrierung prüft Faktero in der Liste der slowakischen Finanzverwaltung (Paragraf und Datum der Registrierung), bei einem tschechischen Unternehmen im Register der Umsatzsteuerpflichtigen — siehe <0>Unternehmenseinstellungen</0>.",
};
