// Kontrolle der E-Rechnung vor dem Versand (OdoslanieEfakturyOkno, KontrolaPredOdoslanim, Sammelversand).
export default {
  "pri odoslaní len varovanie — ePošták túto časť dopĺňa sám":
    "beim Versand nur eine Warnung — diesen Teil ergänzt ePošták selbst",
  "Skontrolovať znova": "Erneut prüfen",
  "Kontrolujem eFaktúru podľa pravidiel EN 16931 a Peppol BIS…":
    "E-Rechnung wird nach den Regeln EN 16931 und Peppol BIS geprüft…",
  "Kontrolu sa nepodarilo spustiť ({dovod}). Faktúru skontroluje server pri odoslaní.":
    "Die Prüfung konnte nicht gestartet werden ({dovod}). Der Server prüft die Rechnung beim Versand.",
  "Kontrola prešla s varovaniami: {n}": "Prüfung bestanden, Warnungen: {n}",
  "Kontrola prešla": "Prüfung bestanden",
  "eFaktúra neprešla kontrolou — chyby: {n}. Takto by ju sieť Peppol odmietla.":
    "Die E-Rechnung hat die Prüfung nicht bestanden — Fehler: {n}. So würde das Peppol-Netz sie ablehnen.",
  "Opravte faktúru (Upraviť alebo Opraviť faktúru) podľa zoznamu nižšie a potom ju skontrolujte znova. Odoslanie je dovtedy zablokované.":
    "Korrigieren Sie die Rechnung (Bearbeiten oder Rechnung korrigieren) anhand der Liste unten und prüfen Sie sie dann erneut. Bis dahin ist der Versand gesperrt.",
  "Orientačné varovania kontroly: {n}": "Unverbindliche Warnungen der Prüfung: {n}",
  "Varovania: {n} — odoslaniu nebránia": "Warnungen: {n} — sie verhindern den Versand nicht",
  "Faktúra nepatrí tejto firme.": "Die Rechnung gehört nicht zu dieser Firma.",
  "eFaktúru nie je možné odoslať.": "Die E-Rechnung kann nicht versendet werden.",
  "Najprv opravte chyby z kontroly eFaktúry.":
    "Korrigieren Sie zuerst die Fehler aus der Prüfung der E-Rechnung.",
  "Kontrola eFaktúry našla varovania: {n}": "Die Prüfung der E-Rechnung ergab Warnungen: {n}",
  "Faktúry, ktoré neprešli kontrolou eFaktúry a neodošlú sa: {n}. Chyby ukáže okno odoslania v detaile faktúry.":
    "Rechnungen, die die Prüfung der E-Rechnung nicht bestanden haben und nicht versendet werden: {n}. Die Fehler zeigt das Versandfenster im Rechnungsdetail.",
  "Odoslať ostatné ({n})": "Übrige senden ({n})",
  "Odberateľ nemá DIČ ani IČ DPH — bez nich sa eFaktúra nemá kam poslať.":
    "Der Kunde hat weder Steuernummer noch USt-IdNr. — ohne sie kann die E-Rechnung nirgendwohin gesendet werden.",
  "Zálohová faktúra nie je daňový doklad — cez eFaktúru sa neposiela. Pošlite ju e-mailom; daňový doklad k prijatej platbe už áno.":
    "Eine Vorauszahlungsrechnung ist kein Steuerbeleg — sie wird nicht als E-Rechnung versendet. Senden Sie sie per E-Mail; den Steuerbeleg zur erhaltenen Zahlung hingegen schon.",
  "Suma s DPH podľa položiek je {efaktura} {mena}, na faktúre {faktura} {mena}. eFaktúra počíta daň z položiek — odberateľ by dostal inú sumu ako na PDF. Skontrolujte ceny a DPH položiek.":
    "Der Bruttobetrag laut Positionen beträgt {efaktura} {mena}, auf der Rechnung {faktura} {mena}. Die E-Rechnung berechnet die Steuer aus den Positionen — der Kunde würde einen anderen Betrag als im PDF erhalten. Prüfen Sie Preise und USt der Positionen.",
  "<0>Kontrola eFaktúry:</0> po otvorení okna sa faktúra sama skontroluje podľa pravidiel EN 16931 a Peppol BIS. Zelené <1>Kontrola prešla</1> znamená, že je v poriadku. Pri chybe okno vypíše, čo opraviť (s odkazom na pravidlo), a tlačidlo Odoslať ostane zablokované; varovania odoslaniu nebránia. Pri hromadnom odoslaní sa faktúry s chybou preskočia.":
    "<0>Prüfung der E-Rechnung:</0> Beim Öffnen des Fensters wird die Rechnung automatisch nach den Regeln EN 16931 und Peppol BIS geprüft. Ein grünes <1>Prüfung bestanden</1> bedeutet, dass sie in Ordnung ist. Bei einem Fehler zeigt das Fenster, was zu korrigieren ist (mit Link zur Regel), und die Schaltfläche Senden bleibt gesperrt; Warnungen verhindern den Versand nicht. Beim Sammelversand werden Rechnungen mit Fehlern übersprungen.",
};
