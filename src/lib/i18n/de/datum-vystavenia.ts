// Dátum vystavenia pred prvým odoslaním faktúry (okno, hromadné odoslanie, API, manuál).
export default {
  "Dátum vystavenia nie je dnešný": "Das Rechnungsdatum ist nicht von heute",
  "Dátum vystavenia je {datum}. Faktúra sa odosiela dnes — dátum vystavenia by mal byť aktuálny.":
    "Das Rechnungsdatum ist der {datum}. Die Rechnung wird heute versendet — das Rechnungsdatum sollte aktuell sein.",
  "Dátum vystavenia: {stary} → {novy}": "Rechnungsdatum: {stary} → {novy}",
  "Splatnosť: {stara} → {nova} (lehota ostáva rovnaká)":
    "Fälligkeit: {stara} → {nova} (die Zahlungsfrist bleibt gleich)",
  "Dátum dodania ostáva {datum}.": "Das Lieferdatum bleibt der {datum}.",
  "Faktúra sa presunie do iného roka. Číslo {cislo} ostáva pôvodné.":
    "Die Rechnung rückt in ein anderes Jahr. Die Nummer {cislo} bleibt unverändert.",
  "Faktúra sa presunie do iného mesiaca. Číslo {cislo} ostáva pôvodné.":
    "Die Rechnung rückt in einen anderen Monat. Die Nummer {cislo} bleibt unverändert.",
  "Obdobie je uzamknuté uzávierkou do {datum}, dátum vystavenia sa už zmeniť nedá.":
    "Der Zeitraum ist bis {datum} abgeschlossen, das Rechnungsdatum kann nicht mehr geändert werden.",
  "Faktúra je už vyvezená do účtovníctva — zmena dátumu by v účtovníctve nesedela.":
    "Die Rechnung wurde bereits in die Buchhaltung exportiert — eine Datumsänderung würde dort nicht übereinstimmen.",
  "Dátum vystavenia sa zmeniť nedá.": "Das Rechnungsdatum kann nicht geändert werden.",
  "Faktúru môžete odoslať len s pôvodným dátumom {datum}.":
    "Sie können die Rechnung nur mit dem ursprünglichen Datum {datum} senden.",
  "Mením dátum…": "Datum wird geändert…",
  "Zmeniť dátum vystavenia na dnes a odoslať": "Rechnungsdatum auf heute ändern und senden",
  "Odoslať s dátumom {datum}": "Mit Datum {datum} senden",
  "Dátum sa nepodarilo zmeniť.": "Das Datum konnte nicht geändert werden.",
  "Faktúru sa nepodarilo zmeniť — skontrolujte oprávnenie alebo ju otvorte znova.":
    "Die Rechnung konnte nicht geändert werden — prüfen Sie Ihre Berechtigung oder öffnen Sie sie erneut.",
  "Dátum vystavenia je zmenený na dnes.": "Das Rechnungsdatum wurde auf heute geändert.",
  "Faktúry so starším dátumom vystavenia: {n}. Faktúra sa odosiela dnes — dátum vystavenia by mal byť aktuálny.":
    "Rechnungen mit älterem Rechnungsdatum: {n}. Die Rechnung wird heute versendet — das Rechnungsdatum sollte aktuell sein.",
  "Dátum vystavenia sa zmení na dnes pri {n} z nich, splatnosť sa posunie o rovnaký počet dní a dátum dodania ostáva.":
    "Bei {n} davon wird das Rechnungsdatum auf heute geändert, die Fälligkeit verschiebt sich um dieselbe Anzahl Tage und das Lieferdatum bleibt.",
  "Faktúry, ktorým sa dátum zmeniť nedá (uzamknuté obdobie alebo export do účtovníctva): {n}. Hromadne sa neodošlú — pošlite ich jednotlivo z detailu faktúry.":
    "Rechnungen, deren Datum nicht geändert werden kann (abgeschlossener Zeitraum oder Export in die Buchhaltung): {n}. Sie werden nicht im Stapel versendet — senden Sie sie einzeln aus der Rechnungsansicht.",
  "Odoslať ostatné": "Übrige senden",
  'Pri prvom odoslaní musí byť dátum vystavenia dnešný. Faktúru so starším dátumom API odmietne odpoveďou 409 s kódom issue_date_in_past (v details je issue_date, today, new_due_date a can_update). Pošlite požiadavku znova s "update_issue_date": true — dátum vystavenia sa zmení na dnes, splatnosť sa posunie o rovnaký počet dní a dátum dodania ostáva. Keď sa dátum zmeniť nedá (can_update: false — uzamknuté obdobie alebo export do účtovníctva), faktúru odošle s pôvodným dátumom až "keep_issue_date": true. Upomienky a opätovné odoslanie sa nekontrolujú.':
    'Beim ersten Versand muss das Rechnungsdatum von heute sein. Eine Rechnung mit älterem Datum lehnt die API mit 409 und dem Code issue_date_in_past ab (details enthält issue_date, today, new_due_date und can_update). Senden Sie die Anfrage erneut mit "update_issue_date": true — das Rechnungsdatum wird auf heute geändert, die Fälligkeit verschiebt sich um dieselbe Anzahl Tage und das Lieferdatum bleibt. Lässt sich das Datum nicht ändern (can_update: false — abgeschlossener Zeitraum oder Export in die Buchhaltung), wird die Rechnung erst mit "keep_issue_date": true mit dem ursprünglichen Datum versendet. Mahnungen und erneuter Versand werden nicht geprüft.',
  "Pri <0>prvom odoslaní</0> (e-mailom aj eFaktúrou) musí byť dátum vystavenia dnešný. Keď ste faktúru vystavili skôr a posielate ju až dnes, Faktero to oznámi a ponúkne <1>Zmeniť dátum vystavenia na dnes a odoslať</1> — splatnosť sa posunie o rovnaký počet dní, dátum dodania aj číslo faktúry ostávajú. Faktúru z uzamknutého obdobia alebo už vyvezenú do účtovníctva zmeniť nemožno; tá sa odošle s pôvodným dátumom až po výslovnom potvrdení.":
    "Beim <0>ersten Versand</0> (per E-Mail und als E-Rechnung) muss das Rechnungsdatum von heute sein. Haben Sie die Rechnung früher ausgestellt und senden sie erst heute, weist Faktero darauf hin und bietet <1>Rechnungsdatum auf heute ändern und senden</1> an — die Fälligkeit verschiebt sich um dieselbe Anzahl Tage, Lieferdatum und Rechnungsnummer bleiben. Eine Rechnung aus einem abgeschlossenen Zeitraum oder eine bereits in die Buchhaltung exportierte lässt sich nicht ändern; sie wird mit dem ursprünglichen Datum erst nach ausdrücklicher Bestätigung versendet.",
};
