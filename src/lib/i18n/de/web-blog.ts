// Verejný web — články blogu (dáta v blog-content.ts), kľúče presne reťazce z dát.
export default {
  "Pohoda si doklady vezme sama — a povie, aké čísla im dala":
    "Pohoda holt sich die Belege selbst — und meldet, welche Nummern sie vergeben hat",
  "Nové priame prepojenie s programom POHODA: bez inštalácie, bez otvárania portov a s návratom čísel dokladov späť do Faktera.":
    "Neue direkte Anbindung an das Programm POHODA: ohne Installation, ohne geöffnete Ports und mit Rückmeldung der Belegnummern an Faktero.",
  "Doteraz sa podklady pre účtovníčku sťahovali alebo posielali mailom. Od augusta 2026 to ide aj tretím spôsobom: POHODA si doklady raz denne v noci stiahne sama, načíta ich a pošle späť správu o tom, ako import dopadol. Účtovníčka pritom nič neinštaluje.":
    "Bisher wurden die Unterlagen für die Buchhalterin heruntergeladen oder per E-Mail geschickt. Seit August 2026 geht es auch auf einem dritten Weg: POHODA lädt die Belege einmal täglich nachts selbst herunter, liest sie ein und schickt eine Meldung zurück, wie der Import verlaufen ist. Die Buchhalterin muss dafür nichts installieren.",
  "Prečo to nie je ďalší program": "Warum das kein weiteres Programm ist",
  "POHODA vie XML import spustiť sama z príkazového riadku. Celé prepojenie je preto priečinok s dávkovým súborom a jedna naplánovaná úloha Windows — päť riadkov textu, ktoré si účtovníčka vie prečítať v Poznámkovom bloku a kedykoľvek zmazať. Žiadny inštalátor, žiadny neznámy .exe, žiadne aktualizácie. Neotvárajú sa ani porty: spojenie ide von z jej počítača, rovnako ako keby si otvorila webovú stránku.":
    "POHODA kann den XML-Import selbst über die Kommandozeile starten. Die ganze Anbindung besteht daher aus einem Ordner mit einer Batch-Datei und einer geplanten Windows-Aufgabe — fünf Zeilen Text, die die Buchhalterin im Editor lesen und jederzeit löschen kann. Kein Installer, keine unbekannte .exe, keine Updates. Es werden auch keine Ports geöffnet: Die Verbindung geht von ihrem Rechner nach außen, genauso als würde sie eine Webseite öffnen.",
  "Čísla dokladov sa vracajú": "Die Belegnummern kommen zurück",
  "Po importe POHODA vydá správu o každom doklade. Vďaka nej Faktero vie, ktoré doklady sa naozaj založili a aké čísla dostali — pri faktúre teda vidíte aj to, ako sa volá v účtovníctve. A hlavne: doklad, ktorý POHODA odmietne, sa aj s dôvodom vráti do fronty a príde znova, keď sa chyba opraví. Nestane sa, že by bol u vás odovzdaný a v účtovníctve neexistoval.":
    "Nach dem Import erstellt POHODA eine Meldung zu jedem Beleg. Dadurch weiß Faktero, welche Belege tatsächlich angelegt wurden und welche Nummern sie erhalten haben — bei der Rechnung sehen Sie also auch, wie sie in der Buchhaltung heißt. Und vor allem: Ein Beleg, den POHODA ablehnt, kehrt samt Begründung in die Warteschlange zurück und kommt erneut, sobald der Fehler behoben ist. Es kann nicht passieren, dass er bei Ihnen als übergeben gilt und in der Buchhaltung nicht existiert.",
  "Čo do POHODY chodí": "Was an POHODA geht",
  "Vydané faktúry, zálohové faktúry a dobropisy":
    "Ausgangsrechnungen, Anzahlungsrechnungen und Gutschriften",
  "Prijaté doklady — bločky aj faktúry, s rozpisom DPH po sadzbách":
    "Eingangsbelege — Kassenbons und Rechnungen, mit MwSt.-Aufschlüsselung nach Sätzen",
  "Pokladňa: príjmové a výdavkové doklady": "Kasse: Einnahme- und Ausgabebelege",
  "Voliteľne adresár odberateľov — zmenený kontakt sa prepíše, nezaloží sa druhý":
    "Optional die Kunden — ein geänderter Kontakt wird überschrieben, kein zweiter angelegt",
  "Voliteľne skladové karty — a s nimi príjemky a výdajky, aby sedeli aj stavy skladu":
    "Optional die Artikel — und mit ihnen Wareneingänge und Warenausgänge, damit auch die Lagerbestände stimmen",
  "Voliteľne zákazky — faktúra potom nesie zákazku, takže vidno výnos po zákazkách":
    "Optional Projekte — die Rechnung trägt dann das Projekt, so sieht man den Erlös je Projekt",
  "Odkaz na PDF faktúry priamo v záložke Dokumenty":
    "Link zum PDF der Rechnung direkt im Reiter Dokumente",
  "Doklad sa nezaloží dvakrát": "Ein Beleg wird nicht doppelt angelegt",
  "Každý doklad má stály identifikátor a POHODA má pri importe zapnutú kontrolu duplicity. Druhý pokus preto odmietne sama — aj keby tá istá faktúra prišla raz prepojením a raz z mesačného mailu. Obidve cesty sa tak dajú pokojne kombinovať.":
    "Jeder Beleg hat eine feste Kennung und POHODA hat beim Import die Dublettenprüfung aktiviert. Einen zweiten Versuch lehnt sie daher selbst ab — auch wenn dieselbe Rechnung einmal über die Anbindung und einmal mit der monatlichen E-Mail käme. Beide Wege lassen sich so ohne Bedenken kombinieren.",
  "Čo zámerne neposielame": "Was wir bewusst nicht senden",
  "Banku nie: výpis si účtovníčka načíta priamo z banky, takže náš export by v POHODE vyrobil druhý komplet bankových dokladov. Množstvo na skladovej karte tiež nie — stav v POHODE vzniká príjemkami a výdajkami, tie posielame zvlášť a sklad si dopočíta sama. A faktúru v cudzej mene preskočíme a povieme to: POHODA chce rozpis po sadzbách vždy v domácej mene a kurz k faktúre neevidujeme, takže by sa doláre zaúčtovali ako eurá.":
    "Die Bank nicht: Den Auszug liest die Buchhalterin direkt von der Bank ein, unser Export würde in POHODA einen zweiten Satz Bankbelege erzeugen. Den Bestand auf dem Artikel auch nicht — der Bestand in POHODA entsteht aus Wareneingängen und Warenausgängen, die senden wir separat und das Lager rechnet POHODA selbst nach. Und eine Rechnung in Fremdwährung überspringen wir und sagen das: POHODA verlangt die Aufschlüsselung nach Sätzen immer in Landeswährung, und einen Kurs zur Rechnung führen wir nicht, sodass Dollar als Euro verbucht würden.",
  "Vyplňte predkontácie, kým to zapnete":
    "Füllen Sie die Vorkontierungen aus, bevor Sie es einschalten",
  "V Účtovníctvo → Prepojenie s Pohodou sa dajú vyplniť skratky z POHODY vašej účtovníčky (napríklad 3Fv a UD). Bez nich sa doklady naimportujú, ale zaúčtovanie si ku každému doklikáva ručne — teda presne tú prácu, ktorú mal prenos ušetriť. Stačí sa jej raz opýtať.":
    "Unter Buchhaltung → Anbindung an Pohoda lassen sich die Kürzel aus der POHODA Ihrer Buchhalterin eintragen (zum Beispiel 3Fv und UD). Ohne sie werden die Belege importiert, aber die Buchung muss sie bei jedem Beleg von Hand nachklicken — also genau die Arbeit, die die Übertragung sparen sollte. Es genügt, sie einmal zu fragen.",
  "eFaktúra 2027: čo musíte stihnúť pred 1.1.2027":
    "E-Rechnung 2027: Was Sie vor dem 1.1.2027 erledigt haben müssen",
  "Od januára 2027 budú firmy v SR povinné posielať B2B faktúry štruktúrovane. Vysvetľujeme Peppol, Digitálneho poštára a čo to znamená pre vaše procesy.":
    "Ab Januar 2027 müssen Unternehmen in der Slowakei B2B-Rechnungen strukturiert senden. Wir erklären Peppol, den Digitalen Postboten und was das für Ihre Abläufe bedeutet.",
  "Od 1. januára 2027 nebude PDF poslané e-mailom platnou faktúrou medzi firmami. Nahradí ho eFaktúra — štruktúrovaný XML dokument podľa európskej normy EN 16931, ktorý si účtovný softvér príjemcu prečíta sám. Do konca roka 2026 teda treba mať vyriešené tri veci: čím faktúry vystavíte, ako ich doručíte a kde ich desať rokov uložíte.":
    "Ab dem 1. Januar 2027 ist ein per E-Mail gesendetes PDF keine gültige Rechnung zwischen Unternehmen mehr. Es wird durch die E-Rechnung ersetzt — ein strukturiertes XML-Dokument nach der europäischen Norm EN 16931, das die Buchhaltungssoftware des Empfängers selbst liest. Bis Ende 2026 müssen also drei Dinge geklärt sein: womit Sie Rechnungen ausstellen, wie Sie sie zustellen und wo Sie sie zehn Jahre aufbewahren.",
  "Čo sa presne mení": "Was sich genau ändert",
  "Dnes je faktúra dokument pre človeka — vytlačí sa, prepíše alebo naskenuje. Od roku 2027 je to dátová správa pre stroj. Rovnaké údaje (dodávateľ, odberateľ, položky, sadzby DPH, IBAN) idú v presne definovanej štruktúre, takže odberateľ ich zaúčtuje bez prepisovania a bez OCR. PDF nezmizne, ale prestane byť tým, o čo sa opiera odpočet DPH.":
    "Heute ist eine Rechnung ein Dokument für Menschen — sie wird gedruckt, abgetippt oder gescannt. Ab 2027 ist sie eine Datennachricht für Maschinen. Dieselben Angaben (Lieferant, Kunde, Positionen, MwSt.-Sätze, IBAN) kommen in einer genau definierten Struktur, sodass der Kunde sie ohne Abtippen und ohne OCR verbucht. Das PDF verschwindet nicht, ist aber nicht mehr die Grundlage für den Vorsteuerabzug.",
  "Koho sa to týka": "Wen es betrifft",
  "Každého platiteľa DPH na Slovensku pri obchode s inou firmou (B2B) a so štátom (B2G) — od živnostníka po korporáciu. Faktúry pre koncových spotrebiteľov ostávajú v pôvodnom režime. Ak fakturujete čo i len jednej firme, týka sa to aj vás.":
    "Jeden umsatzsteuerpflichtigen Unternehmer in der Slowakei beim Handel mit anderen Unternehmen (B2B) und mit dem Staat (B2G) — vom Einzelunternehmer bis zum Konzern. Rechnungen an Endverbraucher bleiben im bisherigen Verfahren. Wenn Sie auch nur einem Unternehmen Rechnungen stellen, betrifft es auch Sie.",
  "Čo treba stihnúť do konca roka 2026": "Was bis Ende 2026 erledigt sein muss",
  "Mať softvér, ktorý vygeneruje validný XML podľa Peppol BIS 3.0 — ručne sa to spraviť nedá":
    "Software haben, die ein valides XML nach Peppol BIS 3.0 erzeugt — von Hand geht das nicht",
  "Vyriešiť doručovanie: Peppol Access Point alebo Digitálny poštár Finančnej správy":
    "Die Zustellung klären: Peppol Access Point oder Digitaler Postbote der Finanzverwaltung",
  "Vedieť eFaktúry aj prijímať a spracovať — povinnosť platí na oboch stranách":
    "E-Rechnungen auch empfangen und verarbeiten können — die Pflicht gilt auf beiden Seiten",
  "Zabezpečiť archiváciu 10 rokov v pôvodnom XML, nie v PDF":
    "Die Archivierung für 10 Jahre im ursprünglichen XML sicherstellen, nicht als PDF",
  "Skontrolovať údaje odberateľov: bez správneho IČ DPH sa faktúra nedoručí":
    "Die Daten der Kunden prüfen: Ohne korrekte USt-IdNr. wird die Rechnung nicht zugestellt",
  "Najčastejší omyl": "Der häufigste Irrtum",
  "„Veď faktúry posielam e-mailom, tak som elektronický.“ Nie ste. Elektronická faktúra v zmysle normy nie je PDF v prílohe — je to štruktúrovaný záznam. Rozdiel je v tom, že PDF vie prečítať človek, kým eFaktúru vie spracovať softvér bez toho, aby sa jej ktokoľvek dotkol.":
    "„Ich schicke Rechnungen doch per E-Mail, also bin ich elektronisch.“ Sind Sie nicht. Eine elektronische Rechnung im Sinne der Norm ist kein PDF im Anhang — sie ist ein strukturierter Datensatz. Der Unterschied: Ein PDF kann ein Mensch lesen, eine E-Rechnung kann Software verarbeiten, ohne dass jemand sie anfasst.",
  "Čo spraviť teraz, keď je ešte čas": "Was Sie jetzt tun sollten, solange noch Zeit ist",
  "Po prvé, upratať adresár odberateľov — hlavne IČ DPH a e-mailové adresy, lebo práve na nich doručovanie stojí. Po druhé, zistiť si u dodávateľa softvéru, či a kedy eFaktúru podporí; keď odpoveď nepríde do konca roka, je čas hľadať inde. Po tretie, vyskúšať si to nanečisto — prvá ostrá eFaktúra v januári 2027 nie je dobré miesto na učenie.":
    "Erstens: die Kunden aufräumen — vor allem USt-IdNr. und E-Mail-Adressen, denn genau darauf beruht die Zustellung. Zweitens: beim Softwareanbieter nachfragen, ob und wann er die E-Rechnung unterstützt; kommt bis Jahresende keine Antwort, ist es Zeit, woanders zu suchen. Drittens: es testweise ausprobieren — die erste echte E-Rechnung im Januar 2027 ist kein guter Ort zum Lernen.",
  "Ako je na tom Faktero": "Wie Faktero aufgestellt ist",
  "Faktero generuje štruktúrované XML podľa Peppol BIS 3.0, vie ho odoslať aj prijať a odoslané eFaktúry vrátane stavu doručenia eviduje. Nemusíte teda meniť softvér tesne pred termínom — stačí, keď sa v januári prepne režim.":
    "Faktero erzeugt strukturiertes XML nach Peppol BIS 3.0, kann es senden und empfangen und erfasst gesendete E-Rechnungen samt Zustellstatus. Sie müssen die Software also nicht kurz vor dem Termin wechseln — es genügt, im Januar den Modus umzuschalten.",
  "Ako prejsť do Faktera bez straty histórie":
    "Wie Sie ohne Verlust des Verlaufs zu Faktero wechseln",
  "Prenos odberateľov a faktúr z doterajšieho systému, zachovanie číselných radov a kontrola otvorených pohľadávok — krok za krokom.":
    "Übertragung von Kunden und Rechnungen aus dem bisherigen System, Erhalt der Nummernkreise und Prüfung offener Forderungen — Schritt für Schritt.",
  "Najväčšia obava pri zmene fakturačného systému nie je cena ani ovládanie, ale história. Kam sa podejú faktúry z minulého roka, číselné rady a adresár, ktorý ste roky budovali? Odpoveď je, že nikam — dajú sa preniesť a trvá to približne štvrťhodinu.":
    "Die größte Sorge beim Wechsel des Rechnungssystems ist weder der Preis noch die Bedienung, sondern der Verlauf. Wohin kommen die Rechnungen aus dem Vorjahr, die Nummernkreise und die Kontakte, die Sie über Jahre aufgebaut haben? Die Antwort: nirgendwohin — sie lassen sich übertragen, und das dauert etwa eine Viertelstunde.",
  "Kedy má prechod zmysel": "Wann ein Wechsel sinnvoll ist",
  "Väčšina fakturačných programov robí to isté dobre — faktúru vystaví každý. Prechod má zmysel vtedy, keď vám niečo konkrétne chýba: napojenie na banku, sklad prepojený s faktúrami, kniha jázd alebo pripravenosť na eFaktúru 2027. Ak vám doterajší nástroj stačí, pokojne pri ňom ostaňte; toto je návod pre prípad, keď ste sa už rozhodli.":
    "Die meisten Rechnungsprogramme machen dasselbe gut — eine Rechnung stellt jedes aus. Ein Wechsel ist sinnvoll, wenn Ihnen etwas Konkretes fehlt: Bankanbindung, ein mit Rechnungen verbundenes Lager, ein Fahrtenbuch oder die Bereitschaft für die E-Rechnung 2027. Reicht Ihnen Ihr bisheriges Werkzeug, bleiben Sie ruhig dabei; dies ist eine Anleitung für den Fall, dass Sie sich bereits entschieden haben.",
  "Odkiaľ vie Faktero prevziať dáta": "Woher Faktero Daten übernehmen kann",
  "SuperFaktúra — export agendy vrátane ZIP so súbormi isdoc":
    "SuperFaktúra — Export des Mandanten inklusive ZIP mit isdoc-Dateien",
  "Pohoda a mPohoda": "Pohoda und mPohoda",
  "Money S3": "Money S3",
  "Omega a KROS": "Omega und KROS",
  iDoklad: "iDoklad",
  "CSV alebo XLSX, keď váš systém nie je v zozname":
    "CSV oder XLSX, wenn Ihr System nicht in der Liste ist",
  Postup: "Vorgehen",
  "V starom systéme si vyexportujte agendu — odberateľov a vystavené faktúry. Vo Fakteri otvorte Účtovníctvo → Importy, vyberte svoj systém a nahrajte súbor. Faktero rozpozná stĺpce a ukáže, čo z nich prečítalo. Až potom sa rozhodujete, čo sa naozaj zapíše.":
    "Exportieren Sie im alten System den Mandanten — Kunden und Ausgangsrechnungen. Öffnen Sie in Faktero Buchhaltung → Importe, wählen Sie Ihr System und laden Sie die Datei hoch. Faktero erkennt die Spalten und zeigt, was es daraus gelesen hat. Erst dann entscheiden Sie, was tatsächlich gespeichert wird.",
  "Prečo importovať po častiach": "Warum in Teilen importieren",
  "Odporúčame začať odberateľmi. Skontrolujete si na nich, či sedia IČO, adresy a e-maily, a až potom pustíte faktúry — tie sa na hotový adresár naviažu. Keby ste išli naraz a niečo v adresári nesedelo, opravovali by ste to na dvoch miestach.":
    "Wir empfehlen, mit den Kunden zu beginnen. An ihnen prüfen Sie, ob Firmen-IDs, Adressen und E-Mails stimmen, und erst dann importieren Sie die Rechnungen — diese werden mit den fertigen Kontakten verknüpft. Würden Sie alles auf einmal importieren und in den Kontakten stimmte etwas nicht, müssten Sie es an zwei Stellen korrigieren.",
  "Čo sa prenesie": "Was übertragen wird",
  "Odberatelia vrátane IČO, DIČ, IČ DPH a adries":
    "Kunden inklusive Firmen-ID (IČO), Steuernummer (DIČ), USt-IdNr. und Adressen",
  "Vystavené faktúry s položkami, sadzbami DPH a dátumami":
    "Ausgangsrechnungen mit Positionen, MwSt.-Sätzen und Daten",
  "Pôvodné čísla faktúr — číselný rad sa zachová, nezačína sa od jednotky":
    "Ursprüngliche Rechnungsnummern — der Nummernkreis bleibt erhalten, er beginnt nicht bei eins",
  "Stav úhrady, takže otvorené pohľadávky ostanú otvorené":
    "Zahlungsstatus, sodass offene Forderungen offen bleiben",
  "Kontrola, na ktorú sa zabúda": "Die Prüfung, die oft vergessen wird",
  "Po importe porovnajte súčet otvorených pohľadávok s tým, čo ste mali v starom systéme. Ak sedí, prenieslo sa všetko podstatné. Ak nesedí, takmer vždy je za tým faktúra so stavom, ktorý starý systém volal inak — v prehľade faktúr ju nájdete podľa čísla za pár sekúnd.":
    "Vergleichen Sie nach dem Import die Summe der offenen Forderungen mit dem, was Sie im alten System hatten. Stimmt sie, wurde alles Wesentliche übertragen. Stimmt sie nicht, steckt fast immer eine Rechnung mit einem Status dahinter, den das alte System anders genannt hat — in der Rechnungsübersicht finden Sie sie anhand der Nummer in Sekunden.",
  "Starý systém nevypínajte hneď": "Schalten Sie das alte System nicht sofort ab",
  "Nechajte si k nemu prístup do konca účtovného obdobia. Nie preto, že by import niečo stratil, ale preto, že je pokojnejšie mať kde overiť číslo, keď sa na niečo spýta účtovníčka.":
    "Behalten Sie den Zugang bis zum Ende des Geschäftsjahres. Nicht weil der Import etwas verloren hätte, sondern weil es beruhigender ist, eine Nummer prüfen zu können, wenn die Buchhalterin nach etwas fragt.",
  "Pohoda export bez ručného prepisovania": "Pohoda-Export ohne manuelles Abtippen",
  "Ako odovzdať účtovníčke mesačný balík faktúr jediným klikom — XML, PDF a sumár DPH.":
    "Wie Sie der Buchhalterin das monatliche Rechnungspaket mit einem einzigen Klick übergeben — XML, PDF und MwSt.-Übersicht.",
  "Mesačné odovzdávanie podkladov účtovníčke je práca, ktorú nikto nepočíta, a pritom zožerie pol dňa. Faktúry sa sťahujú po jednej, prepisujú do tabuľky a posielajú v troch e-mailoch. Pritom celý balík sa dá pripraviť jedným označením a jedným kliknutím.":
    "Die monatliche Übergabe der Unterlagen an die Buchhalterin ist Arbeit, die niemand zählt, und doch frisst sie einen halben Tag. Rechnungen werden einzeln heruntergeladen, in eine Tabelle abgetippt und in drei E-Mails verschickt. Dabei lässt sich das ganze Paket mit einer Markierung und einem Klick vorbereiten.",
  "Ako to funguje": "So funktioniert es",
  "V zozname faktúr označíte obdobie — napríklad všetky faktúry za minulý mesiac — a zvolíte export do Pohody. Vznikne jeden XML súbor, ktorý si Pohoda načíta ako dávku. Nič sa neprepisuje, takže nevznikajú preklepy v sumách ani v číslach faktúr.":
    "In der Rechnungsliste markieren Sie den Zeitraum — zum Beispiel alle Rechnungen des Vormonats — und wählen den Export nach Pohoda. Es entsteht eine XML-Datei, die Pohoda als Stapel einliest. Nichts wird abgetippt, es entstehen also keine Tippfehler in Beträgen oder Rechnungsnummern.",
  "Čo XML nesie": "Was das XML enthält",
  "Hlavičku faktúry s číslom, dátumami a variabilným symbolom":
    "Den Rechnungskopf mit Nummer, Daten und Verwendungszweck (VS)",
  "Odberateľa vrátane IČO, DIČ a IČ DPH":
    "Den Kunden inklusive Firmen-ID (IČO), Steuernummer (DIČ) und USt-IdNr.",
  "Položky s množstvom, cenou a sadzbou DPH": "Positionen mit Menge, Preis und MwSt.-Satz",
  "Rozlíšenie dobropisu a zálohovej faktúry, aby sa nezaúčtovali ako bežné plnenie":
    "Unterscheidung von Gutschrift und Anzahlungsrechnung, damit sie nicht als normale Leistung verbucht werden",
  "Celý balík naraz": "Das ganze Paket auf einmal",
  "K XML sa hodia dve veci: PDF všetkých faktúr v jednom ZIP archíve a prehľad DPH za obdobie s rozpisom po sadzbách. Oboje je v Fakteri na jedno kliknutie, takže účtovníčka dostane jednu správu a nie sériu otázok, čo kde chýba.":
    "Zum XML passen zwei Dinge: die PDFs aller Rechnungen in einem ZIP-Archiv und die MwSt.-Übersicht für den Zeitraum mit Aufschlüsselung nach Sätzen. Beides gibt es in Faktero mit einem Klick, sodass die Buchhalterin eine Nachricht erhält und nicht eine Reihe von Fragen, was wo fehlt.",
  "Nepoužívate Pohodu?": "Sie nutzen Pohoda nicht?",
  "Rovnaký balík viete vyexportovať aj pre Omegu (TXT) a Money S3 (XML). Výber formátu je jedna položka v ponuke, zvyšok postupu je rovnaký.":
    "Dasselbe Paket können Sie auch für Omega (TXT) und Money S3 (XML) exportieren. Die Wahl des Formats ist ein Eintrag im Menü, der Rest des Vorgehens ist gleich.",
  "Odvtedy pribudlo priame prepojenie": "Inzwischen gibt es eine direkte Anbindung",
  "Tento článok popisuje cestu súborom, ktorá platí ďalej. Od augusta 2026 si však POHODA vie doklady stiahnuť sama každú noc a poslať späť čísla, ktoré im pridelila — bez sťahovania a bez mailov. Viac v článku „Pohoda si doklady vezme sama“.":
    "Dieser Artikel beschreibt den Weg über eine Datei, der weiterhin gilt. Seit August 2026 kann POHODA die Belege aber jede Nacht selbst herunterladen und die vergebenen Nummern zurückschicken — ohne Herunterladen und ohne E-Mails. Mehr im Artikel „Pohoda holt sich die Belege selbst“.",
  "Keď je priznanie podané, zamknite obdobie":
    "Ist die Erklärung eingereicht, sperren Sie den Zeitraum",
  "Uzávierka v Fakteri zabráni tomu, aby sa doklady s už podaným priznaním dodatočne zmenili. Úhrady sa zapisovať dajú ďalej — zamknuté sú sumy, dátumy a položky.":
    "Der Abschluss in Faktero verhindert, dass Belege mit bereits eingereichter Erklärung nachträglich geändert werden. Zahlungen lassen sich weiterhin erfassen — gesperrt sind Beträge, Daten und Positionen.",
  "API fakturácia pre SaaS: idempotencia, webhooky a opakované faktúry":
    "API-Rechnungsstellung für SaaS: Idempotenz, Webhooks und wiederkehrende Rechnungen",
  "Architektúra automatizovanej fakturácie pre SaaS produkty na Slovensku — vzory, ktoré fungujú v produkcii.":
    "Architektur automatisierter Rechnungsstellung für SaaS-Produkte in der Slowakei — Muster, die sich in der Produktion bewähren.",
  "Keď fakturáciu spustíte z kódu, prestanú byť problémom preklepy a začnú byť problémom duplicity. Táto téma má tri praktické časti: ako nevystaviť tú istú faktúru dvakrát, ako sa dozvedieť o zaplatení a kedy si vystačíte bez API.":
    "Wenn Sie die Rechnungsstellung aus dem Code starten, sind Tippfehler kein Problem mehr — Duplikate dafür schon. Das Thema hat drei praktische Teile: wie Sie dieselbe Rechnung nicht zweimal ausstellen, wie Sie von der Zahlung erfahren und wann Sie ohne API auskommen.",
  "Test a live kľúč od začiatku": "Test- und Live-Schlüssel von Anfang an",
  "Faktero rozlišuje testovací a ostrý kľúč a je to vidieť už z jeho tvaru. Vývoj a skúšanie robte testovacím; ostrý patrí len do produkcie. Kľúč sa posiela v hlavičke Authorization ako Bearer token a jeho hodnotu vidíte jediný raz — pri vytvorení.":
    "Faktero unterscheidet Test- und Live-Schlüssel, und das sieht man schon an ihrer Form. Entwicklung und Tests machen Sie mit dem Testschlüssel; der Live-Schlüssel gehört nur in die Produktion. Der Schlüssel wird im Header Authorization als Bearer-Token gesendet, und seinen Wert sehen Sie nur ein einziges Mal — bei der Erstellung.",
  "Idempotencia cez external_id": "Idempotenz über external_id",
  "Každá požiadavka na vystavenie faktúry môže niesť vaše vlastné external_id — napríklad identifikátor predplatného alebo objednávky. Keď to isté external_id príde druhý raz, Faktero nevystaví novú faktúru, ale vráti tú pôvodnú. Vďaka tomu je bezpečné volanie zopakovať po timeoute alebo po páde procesu, čo je presne tá situácia, v ktorej duplicity vznikajú.":
    "Jede Anfrage zur Ausstellung einer Rechnung kann Ihre eigene external_id tragen — zum Beispiel die Kennung eines Abonnements oder einer Bestellung. Kommt dieselbe external_id ein zweites Mal, stellt Faktero keine neue Rechnung aus, sondern gibt die ursprüngliche zurück. Dadurch lässt sich ein Aufruf nach einem Timeout oder einem Prozessabsturz gefahrlos wiederholen — genau die Situation, in der Duplikate entstehen.",
  "Čo si ustrážiť na svojej strane": "Worauf Sie auf Ihrer Seite achten sollten",
  "external_id musí byť stabilné — nie náhodné pri každom pokuse":
    "Die external_id muss stabil sein — nicht bei jedem Versuch zufällig",
  "Odpoveď si uložte aj s číslom faktúry, nech ho neskôr netreba dohľadávať":
    "Speichern Sie die Antwort samt Rechnungsnummer, damit Sie sie später nicht suchen müssen",
  "Sieťovú chybu berte ako „neviem, či prešlo“, nie ako neúspech, a volanie zopakujte":
    "Behandeln Sie einen Netzwerkfehler als „weiß nicht, ob es durchging“, nicht als Fehlschlag, und wiederholen Sie den Aufruf",
  "Webhooky namiesto opakovaného dopytovania": "Webhooks statt wiederholter Abfragen",
  "Stav faktúry nezisťujte v cykle. Faktero pošle na váš endpoint udalosť, keď faktúra vznikne, keď je odoslaná, keď je zaplatená a keď je stornovaná. Doručenia sa evidujú aj s HTTP odpoveďou vašej strany, takže sa dá dohľadať, čo prešlo a čo nie.":
    "Fragen Sie den Rechnungsstatus nicht in einer Schleife ab. Faktero sendet ein Ereignis an Ihren Endpunkt, wenn eine Rechnung entsteht, gesendet, bezahlt oder storniert wird. Die Zustellungen werden samt HTTP-Antwort Ihrer Seite protokolliert, sodass sich nachvollziehen lässt, was durchging und was nicht.",
  "Kedy API vôbec nepotrebujete": "Wann Sie die API gar nicht brauchen",
  "Ak fakturujete každý mesiac tú istú sumu tým istým zákazníkom, opakované faktúry to vyriešia bez jediného riadku kódu — šablóna sa vystaví a odošle sama. API má zmysel vtedy, keď suma alebo položky závisia od toho, čo sa udialo vo vašom produkte.":
    "Wenn Sie jeden Monat denselben Betrag an dieselben Kunden berechnen, lösen das wiederkehrende Rechnungen ohne eine einzige Zeile Code — die Vorlage wird von selbst ausgestellt und gesendet. Die API ist sinnvoll, wenn Betrag oder Positionen davon abhängen, was in Ihrem Produkt passiert ist.",
  "Vyskúšajte to bez písania kódu": "Probieren Sie es aus, ohne Code zu schreiben",
  "V sekcii API Playground viete zavolať koncové body priamo z prehliadača a hneď vidieť odpoveď aj záznam v logu volaní. Je to najrýchlejší spôsob, ako si overiť tvar dát pred tým, než sa do toho pustíte.":
    "Im Bereich API Playground können Sie die Endpunkte direkt im Browser aufrufen und sofort die Antwort und den Eintrag im Aufrufprotokoll sehen. Das ist der schnellste Weg, die Datenform zu prüfen, bevor Sie loslegen.",
} satisfies Record<string, string>;
