// Nastavenia exportu do účtovníctva, nastavenia banky a konvertor Excel → Pohoda.
export default {
  "Export do účtovného programu": "Export in die Buchhaltungssoftware",
  "Platí pre export do Pohody — súbor z účtovných exportov, mesačný balík aj konektor. Názov položiek odpočtu zálohy aj pre Omegu a Money S3. Predvolené voľby posielajú doklady tak ako doteraz.":
    "Gilt für den Export nach Pohoda — Datei aus den Buchhaltungsexporten, Monatspaket und Konnektor. Die Bezeichnung der Positionen für den Abzug der Anzahlung auch für Omega und Money S3. Mit den Standardoptionen werden Belege wie bisher übertragen.",
  "Prijaté faktúry a bločky": "Eingangsrechnungen und Kassenbons",
  "DPH sa odpočíta najskôr v období, keď faktúru máte (§ 51 zákona o DPH).":
    "Die Vorsteuer wird frühestens in dem Zeitraum abgezogen, in dem Ihnen die Rechnung vorliegt (§ 51 des slowakischen MwSt-Gesetzes).",
  "Exportovať položky z rozpisu DPH, ak doklad nemá iné položky":
    "Positionen aus der MwSt-Aufstellung exportieren, wenn der Beleg keine anderen Positionen hat",
  "Doklad bez položiek dostane jednu položku na každú sadzbu DPH s predkontáciou dokladu. Inak ide len súhrn po sadzbách.":
    "Ein Beleg ohne Positionen erhält je MwSt-Satz eine Position mit der Vorkontierung des Belegs. Sonst wird nur die Summe je Satz übertragen.",
  "Dodávatelia a odberatelia": "Lieferanten und Kunden",
  "Uložiť nastavenia exportu": "Exporteinstellungen speichern",
  "Nastavenia banky": "Bankeinstellungen",
  "Párovanie pohybov s bločkami": "Zuordnung von Umsätzen zu Kassenbons",
  "Ignorovať typ platby": "Zahlungsart ignorieren",
  "Vypnuté = bloček platený kartou sa páruje len s platbou kartou a prevod len s pohybom, ktorý platbou kartou nie je. Platbu kartou Faktero spozná z textu pohybu (napr. „Platba kartou“, POS, číslo karty).":
    "Aus = ein mit Karte bezahlter Bon wird nur einer Kartenzahlung zugeordnet und eine Überweisung nur einem Umsatz, der keine Kartenzahlung ist. Kartenzahlungen erkennt Faktero am Umsatztext (z. B. „Kartenzahlung“, POS, Kartennummer).",
  "Synchronizovať banku od (vrátane)": "Bank synchronisieren ab (einschließlich)",
  "Staršie pohyby sa pri sťahovaní z banky neuložia. Prázdne = všetko, čo banka vydá.":
    "Ältere Umsätze werden beim Abruf von der Bank nicht gespeichert. Leer = alles, was die Bank liefert.",
  "Najskorší dátum automatického párovania": "Frühestes Datum der automatischen Zuordnung",
  "Staršie pohyby sa s faktúrami automaticky nespárujú — ostanú na ručné potvrdenie. Prázdne = bez obmedzenia.":
    "Ältere Umsätze werden Rechnungen nicht automatisch zugeordnet — sie bleiben zur manuellen Bestätigung. Leer = ohne Einschränkung.",
  "Predvolený text pre príjemcu pri úhrade faktúr":
    "Standardtext für den Empfänger bei der Bezahlung von Rechnungen",
  "Hromadný príkaz na úhradu a platba cez Tatra banku. Bez poznámky či symbolu ide „Faktura“ a číslo; referencia RF ide vždy štruktúrovane.":
    "Sammelüberweisung und Zahlung über die Tatra banka. Ohne Notiz oder Symbol wird „Faktura“ und die Nummer verwendet; eine RF-Referenz wird immer strukturiert übertragen.",
  "Skratku účtu pre účtovníctvo (Pohoda) zadáte pri každom účte na stránke":
    "Das Kürzel des Kontos für die Buchhaltung (Pohoda) geben Sie bei jedem Konto auf der Seite ein",
  "Firma → Bankové účty": "Firma → Bankkonten",
  "Uložiť nastavenia banky": "Bankeinstellungen speichern",
  "Ako vyplniť šablónu": "So füllen Sie die Vorlage aus",
  "Jeden riadok = jedna položka (vydané faktúry) alebo jedna sadzba DPH (prijaté faktúry, bločky).":
    "Eine Zeile = eine Position (Ausgangsrechnungen) oder ein MwSt-Satz (Eingangsrechnungen, Kassenbons).",
  "Riadky s rovnakým číslom dokladu sa spoja do jedného dokladu.":
    "Zeilen mit derselben Belegnummer werden zu einem Beleg zusammengefasst.",
  "Stĺpce s hviezdičkou sú povinné. Vzorový riadok prepíšte alebo zmažte.":
    "Spalten mit Sternchen sind Pflichtfelder. Überschreiben oder löschen Sie die Beispielzeile.",
  "Dátumy ako 2026-10-01 alebo 1.10.2026, sumy s desatinnou čiarkou alebo bodkou.":
    "Datumsangaben als 2026-10-01 oder 1.10.2026, Beträge mit Dezimalkomma oder -punkt.",
  "Predkontácia a členenie DPH sú skratky z Pohody; prázdne = predvolené kódy firmy.":
    "Vorkontierung und MwSt-Gliederung sind Kürzel aus Pohoda; leer = Standardcodes der Firma.",
  Návod: "Anleitung",
  "Prevedené: {n} dokladov. Súbor sa stiahol.":
    "Umgewandelt: {n} Belege. Die Datei wurde heruntergeladen.",
  "Prevod sa nepodaril": "Die Umwandlung ist fehlgeschlagen",
  "Konvertor do Pohody": "Konverter nach Pohoda",
  "Konvertor do Pohody — Faktero": "Konverter nach Pohoda — Faktero",
  "Konvertor Excel → Pohoda": "Konverter Excel → Pohoda",
  "Doklady z Excelu alebo CSV prevedie na dávku XML pre import do Pohody. Do Faktera sa nič neukladá.":
    "Wandelt Belege aus Excel oder CSV in einen XML-Stapel für den Import in Pohoda um. In Faktero wird nichts gespeichert.",
  "1. Druh dokladov": "1. Belegart",
  "2. Šablóna": "2. Vorlage",
  "Stiahnite si šablónu, vyplňte ju v Exceli (prvý hárok) a uložte ako XLSX alebo CSV v kódovaní UTF-8.":
    "Laden Sie die Vorlage herunter, füllen Sie sie in Excel aus (erstes Blatt) und speichern Sie sie als XLSX oder CSV in UTF-8.",
  "Stiahnuť šablónu XLSX": "Vorlage XLSX herunterladen",
  "3. Prevod": "3. Umwandlung",
  "Predkontácie, členenia DPH a číselné rady sa doplnia z nastavení firmy v":
    "Vorkontierungen, MwSt-Gliederungen und Nummernkreise werden aus den Firmeneinstellungen ergänzt in den",
  Predkontáciách: "Vorkontierungen",
  "Nahrať vyplnenú šablónu a stiahnuť XML": "Ausgefüllte Vorlage hochladen und XML herunterladen",
  "Do súboru {subor} išlo {n} dokladov.": "In die Datei {subor} wurden {n} Belege übernommen.",
  "Vynechané ({n}):": "Ausgelassen ({n}):",
  Stĺpce: "Spalten",
  "Skratka účtu uložená.": "Kontokürzel gespeichert.",
  "Skratka pre účtovníctvo": "Kürzel für die Buchhaltung",
  "Skratka účtu {iban} v Pohode": "Kürzel des Kontos {iban} in Pohoda",
  "Pri viacerých účtoch zadajte skratku pri každom účte vo":
    "Bei mehreren Konten geben Sie das Kürzel bei jedem Konto ein unter",
  " — faktúra pôjde so skratkou svojho účtu.":
    " — die Rechnung wird mit dem Kürzel ihres Kontos übertragen.",
  "Len partnerov z dokladov a ich párovanie s dokladom nastavíte v":
    "Nur die Partner aus Belegen und deren Verknüpfung mit dem Beleg stellen Sie ein in den",
  "Dátum vyhotovenia dokladu": "Ausstellungsdatum des Belegs",
  "Dátum doručenia (uloženia)": "Eingangsdatum (Speicherung)",
  "Dátum zaúčtovania": "Buchungsdatum",
  "Neskorší z dátumu dodania a doručenia": "Das spätere aus Liefer- und Eingangsdatum",
  "Popis plnenia (text nad položkami, inak dodávateľ a číslo)":
    "Leistungsbeschreibung (Text über den Positionen, sonst Lieferant und Nummer)",
  "Text účtovnej položky (názov predkontácie)":
    "Text der Buchungsposition (Name der Vorkontierung)",
  "Poznámka dokladu": "Notiz des Belegs",
  "Dodávateľ a číslo dokladu": "Lieferant und Belegnummer",
  "Text nad položkami, inak poznámka": "Text über den Positionen, sonst Notiz",
  "Poznámka faktúry": "Notiz der Rechnung",
  "Odberateľ a číslo faktúry": "Kunde und Rechnungsnummer",
  "Faktúra a číslo": "Rechnung und Nummer",
  "Interná poznámka": "Interne Notiz",
  "Interná poznámka a poznámka": "Interne Notiz und Notiz",
  "Nepridávať — partner ostane len na doklade":
    "Nicht hinzufügen — der Partner bleibt nur auf dem Beleg",
  "Pridať alebo aktualizovať v adresári a spárovať s dokladom":
    "Im Adressbuch hinzufügen oder aktualisieren und mit dem Beleg verknüpfen",
  "Ako interné doklady": "Als interne Belege",
  "Ako vydané faktúry": "Als Ausgangsrechnungen",
  "Číslo dokladu k platbe (Odpočet zálohy DD12)":
    "Nummer des Belegs zur Zahlung (Abzug der Anzahlung DD12)",
  "Sadzba DPH (Odpočet zálohy 23 %)": "MwSt-Satz (Abzug der Anzahlung 23 %)",
  "Číslo dokladu aj sadzba DPH": "Belegnummer und MwSt-Satz",
  "Dátum zápisu do účtovníctva": "Datum der Erfassung in der Buchhaltung",
  "Dátum odpočtu DPH": "Datum des Vorsteuerabzugs",
  "Text dokladu": "Belegtext",
  "Pri názve predkontácie sa berie popis z číselníka nižšie; bez neho ide predvolený text.":
    "Beim Namen der Vorkontierung wird die Beschreibung aus dem Verzeichnis unten verwendet; ohne sie der Standardtext.",
  "Interná poznámka prijatých faktúr": "Interne Notiz der Eingangsrechnungen",
  "Interná poznámka bločkov": "Interne Notiz der Kassenbons",
  "Text faktúry": "Rechnungstext",
  "Evidencia daňových dokladov k prijatej platbe":
    "Erfassung der Steuerbelege zu erhaltenen Zahlungen",
  "Ako vydané faktúry idú s predkontáciou zálohovej faktúry — nastavte ju tak, aby sa účtovala len daň zo zálohy.":
    "Als Ausgangsrechnungen werden sie mit der Vorkontierung der Anzahlungsrechnung übertragen — stellen Sie sie so ein, dass nur die Steuer aus der Anzahlung gebucht wird.",
  "Názov položiek pre uhradenú zálohu": "Bezeichnung der Positionen für die bezahlte Anzahlung",
  "Export partnera do adresára Pohody": "Export des Partners in das Pohoda-Adressbuch",
  "Pri párovaní ide karta partnera z adresára Faktera do Pohody pred dokladom a doklad sa na ňu odvolá. Celý adresár naraz sa zapína v Prepojení s Pohodou.":
    "Beim Verknüpfen wird die Partnerkarte aus dem Faktero-Adressbuch vor dem Beleg an Pohoda gesendet und der Beleg verweist darauf. Das gesamte Adressbuch auf einmal schalten Sie in der Verbindung mit Pohoda ein.",
  "Keď faktúra príde až v neskoršom mesiaci než dodanie, odpočet DPH patrí až do obdobia doručenia — taký doklad v účtovnom programe skontrolujte, alebo zvoľte „neskorší z dátumu dodania a doručenia“.":
    "Kommt die Rechnung erst in einem späteren Monat als die Lieferung, gehört der Vorsteuerabzug erst in den Zeitraum des Eingangs — prüfen Sie einen solchen Beleg in der Buchhaltungssoftware oder wählen Sie „das spätere aus Liefer- und Eingangsdatum“.",
  "Dátum zaúčtovania nesmie byť skorší než doručenie faktúry — inak by sa DPH odpočítala skôr, než to zákon dovoľuje.":
    "Das Buchungsdatum darf nicht vor dem Eingang der Rechnung liegen — sonst würde die Vorsteuer früher abgezogen, als es das Gesetz erlaubt.",
  "Faktura a číslo faktúry (Faktura 2026001)": "Faktura und Rechnungsnummer (Faktura 2026001)",
  "Len číslo faktúry": "Nur die Rechnungsnummer",
  "Variabilný symbol (VS 2026001)": "Variables Symbol (VS 2026001)",
  "Účtovná poznámka faktúry": "Buchhaltungsnotiz der Rechnung",
  "Nastavenia exportu do účtovného programu":
    "Einstellungen für den Export in die Buchhaltungssoftware",
  "Na stránke <0>Predkontácie</0> v časti <1>Export do účtovného programu</1> nastavíte, ako doklady prídu do Pohody. Predvolené voľby posielajú doklady tak ako doteraz.":
    "Auf der Seite <0>Vorkontierungen</0> legen Sie im Abschnitt <1>Export in die Buchhaltungssoftware</1> fest, wie Belege in Pohoda ankommen. Mit den Standardoptionen werden Belege wie bisher übertragen.",
  "<0>Dátum zápisu</0> prijatých dokladov — dátum vyhotovenia, dodania alebo doručenia (pri bločku dátum uloženia).":
    "<0>Erfassungsdatum</0> der Eingangsbelege — Ausstellungs-, Liefer- oder Eingangsdatum (beim Kassenbon das Speicherdatum).",
  "<0>Dátum odpočtu DPH</0> — dátum dodania, zaúčtovania, doručenia alebo neskorší z dodania a doručenia. DPH sa podľa zákona odpočíta najskôr v období, keď faktúru máte; keď faktúra príde až v ďalšom mesiaci, zvoľte doručenie alebo neskorší dátum.":
    "<0>Datum des Vorsteuerabzugs</0> — Liefer-, Buchungs- oder Eingangsdatum oder das spätere aus Liefer- und Eingangsdatum. Die Vorsteuer wird laut Gesetz frühestens in dem Zeitraum abgezogen, in dem Ihnen die Rechnung vorliegt; kommt die Rechnung erst im Folgemonat, wählen Sie das Eingangsdatum oder das spätere Datum.",
  "<0>Text dokladu</0> a <1>internú poznámku</1> — popis plnenia, názov predkontácie, poznámku alebo dodávateľa s číslom dokladu.":
    "<0>Belegtext</0> und <1>interne Notiz</1> — Leistungsbeschreibung, Name der Vorkontierung, Notiz oder Lieferant mit Belegnummer.",
  "<0>Export partnera do adresára</0> — pri párovaní ide karta partnera do adresára Pohody pred dokladom a doklad sa na ňu odvolá.":
    "<0>Export des Partners in das Adressbuch</0> — beim Verknüpfen wird die Partnerkarte vor dem Beleg in das Pohoda-Adressbuch übertragen und der Beleg verweist darauf.",
  "<0>Daňové doklady k prijatej platbe</0> ako interné doklady alebo ako vydané faktúry (s predkontáciou zálohovej faktúry).":
    "<0>Steuerbelege zu erhaltenen Zahlungen</0> als interne Belege oder als Ausgangsrechnungen (mit der Vorkontierung der Anzahlungsrechnung).",
  "<0>Položky z rozpisu DPH</0> pre doklad bez položiek a <1>názov položiek odpočtu zálohy</1> (číslo dokladu alebo sadzba DPH).":
    "<0>Positionen aus der MwSt-Aufstellung</0> für Belege ohne Positionen und die <1>Bezeichnung der Positionen für den Abzug der Anzahlung</1> (Belegnummer oder MwSt-Satz).",
  "Pri viacerých bankových účtoch zadajte pri každom účte vo <0>Firma → Bankové účty</0> jeho skratku v Pohode — faktúra pôjde so skratkou účtu, na ktorý sa má platiť.":
    "Bei mehreren Bankkonten geben Sie unter <0>Firma → Bankkonten</0> bei jedem Konto sein Kürzel in Pohoda ein — die Rechnung wird mit dem Kürzel des Kontos übertragen, auf das gezahlt werden soll.",
  "Konvertor z Excelu do Pohody": "Konverter von Excel nach Pohoda",
  "V <0>Účtovníctvo → Konvertor Excel → Pohoda</0> si stiahnete šablónu pre vydané faktúry, prijaté faktúry alebo bločky, vyplníte ju v Exceli a nahráte späť. Faktero z nej poskladá dávku XML s predkontáciami a nastaveniami firmy.":
    "Unter <0>Buchhaltung → Konverter Excel → Pohoda</0> laden Sie die Vorlage für Ausgangsrechnungen, Eingangsrechnungen oder Kassenbons herunter, füllen sie in Excel aus und laden sie wieder hoch. Faktero erstellt daraus einen XML-Stapel mit den Vorkontierungen und Einstellungen der Firma.",
  "Riadky s rovnakým číslom dokladu sa spoja do jedného dokladu. Do Faktera sa nič neukladá — XML sa len stiahne a naimportujete ho v Pohode.":
    "Zeilen mit derselben Belegnummer werden zu einem Beleg zusammengefasst. In Faktero wird nichts gespeichert — das XML wird nur heruntergeladen und Sie importieren es in Pohoda.",
};
