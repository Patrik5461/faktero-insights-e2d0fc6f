// Vlastný číselný rad splátok leasingu, úveru a kontokorentu (číslo dokladu splátky do Pohody).
export default {
  "Splátky leasingov a úverov": "Raten von Leasing und Krediten",
  "Číslo dokladu splátky": "Belegnummer der Rate",
  "Vlastný číselný rad": "Eigener Nummernkreis",
  "bez vlastného čísla (pridelí Pohoda)": "ohne eigene Nummer (vergibt Pohoda)",
  "Kontokorent sa do Pohody zatiaľ neexportuje — rad sa len uloží pri zmluve.":
    "Der Kontokorrentkredit wird noch nicht nach Pohoda exportiert — der Nummernkreis wird nur beim Vertrag gespeichert.",
  "Každá splátka dostane vlastné číslo dokladu z tohto radu a export ho pošle do Pohody. Pridelené číslo sa už nemení. Bez radu číslo pridelí Pohoda.":
    "Jede Rate erhält eine eigene Belegnummer aus diesem Nummernkreis, und der Export übergibt sie an Pohoda. Eine vergebene Nummer ändert sich nicht mehr. Ohne Nummernkreis vergibt Pohoda die Nummer.",
  "Splátky budú bez vlastného čísla — pridelí ho Pohoda.": "Die Raten bleiben ohne eigene Nummer — Pohoda vergibt sie.",
  "Číselný rad uložený, čísla dostalo splátok: {n}.": "Nummernkreis gespeichert, Nummern erhalten: {n} Raten.",
  "Číselný rad uložený.": "Nummernkreis gespeichert.",
  "Tvar čísla: {c}": "Nummernformat: {c}",
  "Názov": "Name",
  "Zrušiť": "Abbrechen",
  "{YYYY} rok, {YY} rok dvojčíslím, {MM} mesiac, {NNN} poradie — podľa splatnosti splátky.":
    "{YYYY} Jahr, {YY} Jahr zweistellig, {MM} Monat, {NNN} laufende Nummer — nach Fälligkeit der Rate.",
  "Založiť a použiť": "Anlegen und verwenden",
  "Skratka číselného radu agendy Ostatné záväzky v Pohode. S vlastným číslom splátky ide do exportu spolu s ním.":
    "Kürzel des Nummernkreises der Agenda Sonstige Verbindlichkeiten in Pohoda. Mit eigener Ratennummer wird es zusammen mit ihr exportiert.",
  "Číselný rad sa nenašiel.": "Nummernkreis nicht gefunden.",
  "Vlastný číselný rad splátok ešte nie je v databáze zapnutý (chýba migrácia 20261109180000).":
    "Der eigene Nummernkreis für Raten ist in der Datenbank noch nicht aktiviert (Migration 20261109180000 fehlt).",
  "Zatiaľ bez radu — splátky nemajú vlastné číslo a v Pohode im ho pridelí jej číselný rad. Rad sa vyberá na detaile leasingu, úveru či kontokorentu.":
    "Noch kein Nummernkreis — die Raten haben keine eigene Nummer, Pohoda vergibt sie über ihren Nummernkreis. Der Nummernkreis wird im Detail des Leasings, Kredits oder Kontokorrents gewählt.",
};
