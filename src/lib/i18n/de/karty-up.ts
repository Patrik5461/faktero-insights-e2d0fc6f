// Nahratie výpisu palivovej karty Up Déjeuner (NahratieVypisuKarty, palivové karty, manuál vozového parku).
export default {
  "Súbor sa nepodarilo prečítať": "Die Datei konnte nicht gelesen werden",
  "Súbor je väčší ako 10 MB.": "Die Datei ist größer als 10 MB.",
  "Nahrať výpis karty": "Kartenauszug hochladen",
  "Nahrať výpis alebo faktúru — {nazov}": "Auszug oder Rechnung hochladen — {nazov}",
  "CSV alebo XLSX s nákupmi, prípadne faktúru v PDF (prečíta ju AI). Pred uložením uvidíte náhľad. Opakované nahratie toho istého výpisu nič nezdvojí.":
    "CSV oder XLSX mit den Einkäufen oder die Rechnung als PDF (die KI liest sie). Vor dem Speichern sehen Sie eine Vorschau. Wird derselbe Auszug erneut hochgeladen, entsteht nichts doppelt.",
  "Priraďte stĺpce": "Spalten zuordnen",
  "Stĺpce sa nepodarilo s istotou rozpoznať. Vyberte aspoň dátum, sumu a produkt alebo množstvo.":
    "Die Spalten konnten nicht sicher erkannt werden. Wählen Sie mindestens Datum, Betrag und Produkt oder Menge.",
  "— nepoužiť —": "— nicht verwenden —",
  "Použiť priradenie": "Zuordnung übernehmen",
  Nákupov: "Einkäufe",
  "Suma faktúry s DPH": "Rechnungsbetrag inkl. MwSt.",
  "Nákupy pôjdu do jednej prijatej faktúry s rozpisom. Ak už faktúra s týmto číslom od vydavateľa karty vo Fakteri je, nová sa nezaloží — nákupy sa k nej len prepoja.":
    "Die Einkäufe kommen in eine Eingangsrechnung mit Aufstellung. Ist eine Rechnung mit dieser Nummer vom Kartenaussteller schon in Faktero, wird keine neue angelegt — die Einkäufe werden nur mit ihr verknüpft.",
  "Bez čísla faktúry sa uložia len nákupy a tankovania. Prijatá faktúra vznikne, keď nahráte faktúru alebo doplníte jej číslo.":
    "Ohne Rechnungsnummer werden nur Einkäufe und Tankvorgänge gespeichert. Die Eingangsrechnung entsteht, wenn Sie die Rechnung hochladen oder ihre Nummer ergänzen.",
  "Súčet nákupov sa od sumy faktúry líši o {suma}. Rozdiel (poplatky, zaokrúhlenie) sa na faktúre doplní dorovnávacím riadkom — skontrolujte ho.":
    "Die Summe der Einkäufe weicht vom Rechnungsbetrag um {suma} ab. Die Differenz (Gebühren, Rundung) wird auf der Rechnung als Ausgleichszeile ergänzt — bitte prüfen.",
  "Faktúra {cislo} už vo Fakteri je ({suma}) — nová sa nezaloží.":
    "Die Rechnung {cislo} ist bereits in Faktero ({suma}) — es wird keine neue angelegt.",
  "{n} nákupov je už nahratých z tohto súboru — nezdvoja sa.":
    "{n} Einkäufe aus dieser Datei sind bereits hochgeladen — sie werden nicht verdoppelt.",
  "{n} nákupov už je nahratých z iného súboru (rovnaký deň, suma a množstvo) — preskočia sa.":
    "{n} Einkäufe sind bereits aus einer anderen Datei hochgeladen (gleicher Tag, Betrag und Menge) — sie werden übersprungen.",
  "Pri {n} nákupoch je vo Fakteri aj bloček z pumpy — označí sa, nezaúčtujte ho.":
    "Bei {n} Einkäufen gibt es in Faktero auch den Kassenbeleg der Tankstelle — er wird markiert, buchen Sie ihn nicht.",
  "{n} tankovaní už je zapísaných (GPS jednotka alebo ručne) — nové sa nezaložia, len sa prepoja.":
    "{n} Tankvorgänge sind bereits erfasst (GPS-Einheit oder manuell) — es werden keine neuen angelegt, nur verknüpft.",
  "Pri {n} riadkoch výpis nemá DPH — dopočítala sa základnou sadzbou. Skontrolujte s faktúrou.":
    "Bei {n} Zeilen enthält der Auszug keine MwSt. — sie wurde mit dem Regelsatz berechnet. Bitte mit der Rechnung abgleichen.",
  "Preskočené riadky bez dátumu alebo sumy: {n}":
    "Übersprungene Zeilen ohne Datum oder Betrag: {n}",
  "Vozidlá: {zoznam}": "Fahrzeuge: {zoznam}",
  "Žiadny nákup sa nepodarilo priradiť k vozidlu.":
    "Kein Einkauf konnte einem Fahrzeug zugeordnet werden.",
  "bez vozidla: {n} — kartu priraďte v časti Karty a vozidlá":
    "ohne Fahrzeug: {n} — ordnen Sie die Karte unter Karten und Fahrzeuge zu",
  "Karta / ŠPZ": "Karte / Kennzeichen",
  "už nahraté": "bereits hochgeladen",
  "preskočí sa": "wird übersprungen",
  "tankovanie už je": "Tankvorgang vorhanden",
  "bez vozidla": "ohne Fahrzeug",
  "DPH {krajina} do nákladu": "MwSt. {krajina} als Aufwand",
  "Zobrazených je prvých 300 riadkov z {n}.": "Angezeigt werden die ersten 300 von {n} Zeilen.",
  "Uložiť {n} nákupov": "{n} Einkäufe speichern",
  "V súbore sa nenašiel ani jeden nákup s dátumom a sumou.":
    "In der Datei wurde kein Einkauf mit Datum und Betrag gefunden.",
  "Posledné nahratie": "Letzter Upload",
  "Web vydavateľa": "Website des Ausstellers",
  "Číslo karty": "Kartennummer",
  "Množstvo (litre)": "Menge (Liter)",
  "Základ (bez DPH)": "Nettobetrag (ohne MwSt.)",
  "Suma s DPH": "Betrag inkl. MwSt.",
  "Tachometer (km)": "Kilometerstand (km)",
  "Číslo transakcie / dokladu": "Transaktions- / Belegnummer",
  "Číslo zmluvy alebo zákazníka": "Vertrags- oder Kundennummer",
  "Len na rozlíšenie, ak máte u Up viac zmlúv. Nikam sa neposiela.":
    "Nur zur Unterscheidung, wenn Sie bei Up mehrere Verträge haben. Wird nirgendwohin gesendet.",
  "Up Déjeuner verejné API nemá. Mesačný výpis transakcií (CSV alebo XLSX) alebo faktúru v PDF si stiahnete v klientskej zóne Up alebo vám ich Up pošle e-mailom (palivo@up-dejeuner.sk) — tu ich nahráte. Opakované nahratie toho istého výpisu nič nezdvojí.":
    "Up Déjeuner hat keine öffentliche API. Den monatlichen Transaktionsauszug (CSV oder XLSX) oder die Rechnung als PDF laden Sie im Kundenbereich von Up herunter oder Up schickt sie per E-Mail (palivo@up-dejeuner.sk) — hier laden Sie sie hoch. Wird derselbe Auszug erneut hochgeladen, entsteht nichts doppelt.",
  "Palivová karta Up Déjeuner": "Tankkarte Up Déjeuner",
  "Shell kartu od Up Déjeuner vydáva a fakturuje Up. Up nemá verejné API, preto sa nákupy nenačítajú samé — nahráte <0>mesačný výpis transakcií</0> (CSV alebo XLSX) alebo <1>faktúru v PDF</1>. Výpis alebo faktúru nájdete v klientskej zóne Up, prípadne vám ich Up pošle e-mailom.":
    "Die Shell-Karte von Up Déjeuner wird von Up ausgegeben und abgerechnet. Up hat keine öffentliche API, daher werden die Einkäufe nicht automatisch geladen — Sie laden den <0>monatlichen Transaktionsauszug</0> (CSV oder XLSX) oder die <1>Rechnung als PDF</1> hoch. Auszug oder Rechnung finden Sie im Kundenbereich von Up, oder Up schickt sie Ihnen per E-Mail.",
  "V <0>Palivových kartách</0> pri Up Déjeuner kliknite na <1>Pripojiť</1> — stačí názov, prípadne číslo zmluvy, žiadne heslá. Potom tlačidlom <2>Nahrať výpis</2> vyberte súbor. Stĺpce výpisu (dátum, karta, ŠPZ, pumpa, produkt, litre, suma bez DPH a s DPH, tachometer, číslo faktúry) Faktero spozná samo; keď si nie je isté, ukáže stĺpce a priradíte ich sami. PDF faktúru prečíta AI.":
    "Klicken Sie unter <0>Tankkarten</0> bei Up Déjeuner auf <1>Verbinden</1> — ein Name und ggf. die Vertragsnummer genügen, keine Passwörter. Wählen Sie dann mit <2>Auszug hochladen</2> die Datei. Die Spalten des Auszugs (Datum, Karte, Kennzeichen, Tankstelle, Produkt, Liter, Betrag ohne und mit MwSt., Kilometerstand, Rechnungsnummer) erkennt Faktero selbst; ist es sich nicht sicher, zeigt es die Spalten und Sie ordnen sie selbst zu. Eine PDF-Rechnung liest die KI.",
  "Pred uložením uvidíte <0>náhľad</0>: nákupy, litre, súčty, ku ktorým vozidlám patria a čo je duplicitné. Ak sa súčet nákupov líši od sumy faktúry, rozdiel sa na faktúre doplní dorovnávacím riadkom. Po uložení vznikne jedna prijatá faktúra od Up s rozpisom nákupov, tankovania k vozidlám a bločky z pumpy sa označia rovnako ako pri karte Shell.":
    "Vor dem Speichern sehen Sie eine <0>Vorschau</0>: Einkäufe, Liter, Summen, zu welchen Fahrzeugen sie gehören und was doppelt ist. Weicht die Summe der Einkäufe vom Rechnungsbetrag ab, wird die Differenz auf der Rechnung als Ausgleichszeile ergänzt. Nach dem Speichern entsteht eine Eingangsrechnung von Up mit Aufstellung der Einkäufe, Tankvorgänge bei den Fahrzeugen, und Kassenbelege der Tankstelle werden wie bei der Shell-Karte markiert.",
  "Ten istý výpis môžete nahrať aj viackrát — nič sa nezdvojí. Nákup, ktorý už je nahratý z iného súboru (napríklad najprv výpis v CSV a potom faktúra v PDF), sa preskočí, a faktúra, ktorú od Up už vo Fakteri máte, sa len prepojí. Kartu bez ŠPZ priradíte k vozidlu v časti <0>Karty a vozidlá</0>.":
    "Denselben Auszug können Sie auch mehrmals hochladen — nichts wird verdoppelt. Ein Einkauf, der bereits aus einer anderen Datei hochgeladen ist (z. B. zuerst der Auszug als CSV, dann die Rechnung als PDF), wird übersprungen, und eine Rechnung von Up, die schon in Faktero ist, wird nur verknüpft. Eine Karte ohne Kennzeichen ordnen Sie unter <0>Karten und Fahrzeuge</0> einem Fahrzeug zu.",
};
