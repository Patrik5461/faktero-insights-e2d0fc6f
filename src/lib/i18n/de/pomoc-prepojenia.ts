// Manuál API a prepojenia, tlačidlá PDF v manuáloch.
export default {
  "Pomoc — API a prepojenia — Faktero": "Hilfe — API und Anbindungen — Faktero",
  "Všetko, s čím sa Faktero prepojí: API, webhooky, AI asistenti, banky, účtovné programy, eFaktúra, e-shopy, kniha jázd a prechod z iných programov.":
    "Alles, womit sich Faktero verbindet: API, Webhooks, KI-Assistenten, Banken, Buchhaltungsprogramme, E-Rechnung, Onlineshops, Fahrtenbuch und Wechsel aus anderen Programmen.",
  "Pomoc · Účet a vývoj": "Hilfe · Konto und Entwicklung",
  "API a prepojenia": "API und Anbindungen",
  "Všetko, s čím sa Faktero prepojí — API, AI asistenti, banky, účtovné programy, eFaktúra, e-shopy, kniha jázd a prechod z iných programov.":
    "Alles, womit sich Faktero verbindet — API, KI-Assistenten, Banken, Buchhaltungsprogramme, E-Rechnung, Onlineshops, Fahrtenbuch und Wechsel aus anderen Programmen.",
  "Faktero nie je ostrov. Doklady si berie z banky, z e-mailu, zo skenera aj z e-shopu, posiela ich do účtovného programu a cez eFaktúru odberateľom a vlastný systém či AI asistent sa naň napojí cez API. Táto stránka zhŕňa všetky prepojenia na jednom mieste — podrobnosti ku každému sú v samostatných manuáloch.":
    "Faktero ist keine Insel. Belege holt es von der Bank, aus der E-Mail, vom Scanner und aus dem Onlineshop, schickt sie ins Buchhaltungsprogramm und per E-Rechnung an Kunden, und ein eigenes System oder ein KI-Assistent verbindet sich per API. Diese Seite fasst alle Anbindungen an einem Ort zusammen — Details zu jeder stehen in eigenen Handbüchern.",
  "Celý prehľad si stiahnete ako <0>PDF</0> tlačidlom hore alebo zo sekcie <1>Na stiahnutie</1>.":
    "Die ganze Übersicht laden Sie als <0>PDF</0> über die Schaltfläche oben oder im Abschnitt <1>Downloads</1> herunter.",
  "Faktero API — čo vie čítať a zapisovať": "Faktero API — was es lesen und schreiben kann",
  "REST API na adrese <0>https://faktero.sk/api/v1</0>, odpovede v JSON. Prihlasuje sa API kľúčom v hlavičke <1>Authorization: Bearer fk_live_…</1>. Testovací kľúč (<2>fk_test_…</2>) smie len čítať.":
    "REST-API unter <0>https://faktero.sk/api/v1</0>, Antworten in JSON. Angemeldet wird mit einem API-Schlüssel im Header <1>Authorization: Bearer fk_live_…</1>. Ein Testschlüssel (<2>fk_test_…</2>) darf nur lesen.",
  "<0>Fakturácia</0> — faktúry (vystavenie, úprava, PDF, odoslanie e-mailom, úhrada, storno), cenové ponuky a ich prevod na faktúru, opakované faktúry, odberatelia a dodávatelia vrátane hromadného prenosu adresára (do 1000 naraz).":
    "<0>Fakturierung</0> — Rechnungen (Ausstellung, Änderung, PDF, Versand per E-Mail, Zahlung, Storno), Angebote und ihre Umwandlung in eine Rechnung, wiederkehrende Rechnungen, Kunden und Lieferanten einschließlich Sammelübernahme des Adressbuchs (bis 1000 auf einmal).",
  "<0>Doklady</0> — prijaté faktúry a bločky (čítanie, zápis aj so súborom, úhrada, zaúčtovanie, označenie odovzdaných), nahratie dokladu na prečítanie cez AI.":
    "<0>Belege</0> — Eingangsrechnungen und Kassenbelege (Lesen, Erfassen auch mit Datei, Zahlung, Verbuchung, Markieren als übergeben), Hochladen eines Belegs zum Auslesen per KI.",
  "<0>Banka</0> — bankové účty a pohyby; účet banky bez napojenia založíte cez API a pohyby naň posielate dávkami.":
    "<0>Bank</0> — Bankkonten und Umsätze; ein Konto einer Bank ohne Anbindung legen Sie per API an und senden die Umsätze stapelweise.",
  "<0>Cenník a sklad</0> — produkty a služby, sklady, skladové karty, stavy, pohyby, ocenenie skladu a prečítanie dodacieho listu.":
    "<0>Preisliste und Lager</0> — Produkte und Leistungen, Lager, Lagerkarten, Bestände, Bewegungen, Lagerbewertung und Auslesen eines Lieferscheins.",
  "<0>Kniha jázd</0> — vozidlá, jazdy a tankovania.":
    "<0>Fahrtenbuch</0> — Fahrzeuge, Fahrten und Tankvorgänge.",
  "<0>Firmy a používatelia</0> — kľúčom pre viac firiem založíte firmu klienta, upravíte jej údaje a pozvete do nej účtovníka či kolegu.":
    "<0>Unternehmen und Benutzer</0> — mit dem Schlüssel für mehrere Unternehmen legen Sie das Unternehmen eines Mandanten an, ändern seine Daten und laden einen Buchhalter oder Kollegen ein.",
  "<0>Pohoda</0> — dávka dokladov pre konektor a príjem odpovede z Pohody.":
    "<0>Pohoda</0> — Belegstapel für den Konnektor und Empfang der Antwort von Pohoda.",
  "<0>Kľúč firmy alebo kľúč pre viac firiem.</0> Účtovná kancelária má jeden kľúč na všetkých klientov a firmu vyberie hlavičkou <1>X-Company</1> (IČO alebo id). Zakladať firmy a pozývať používateľov smie len kľúč pre viac firiem.":
    "<0>Unternehmensschlüssel oder Schlüssel für mehrere Unternehmen.</0> Ein Steuerbüro hat einen Schlüssel für alle Mandanten und wählt das Unternehmen mit dem Header <1>X-Company</1> (Firmen-ID oder ID). Unternehmen anlegen und Benutzer einladen darf nur der Schlüssel für mehrere Unternehmen.",
  "<0>Bezpečné opakovanie.</0> Pri zápise pošlite vlastné <1>external_id</1> — to isté volanie druhýkrát nič nezdvojí. Cez API sa nič nemaže, faktúra sa dá len stornovať. Počet požiadaviek nie je obmedzený.":
    "<0>Sicheres Wiederholen.</0> Senden Sie beim Schreiben eine eigene <1>external_id</1> — derselbe Aufruf verdoppelt beim zweiten Mal nichts. Per API wird nichts gelöscht, eine Rechnung lässt sich nur stornieren. Die Zahl der Anfragen ist nicht begrenzt.",
  "Úplný zoznam endpointov s príkladmi je v <0>API dokumentácii</0>, návod na kľúče v manuáli <1>API a webhooky</1>.":
    "Die vollständige Liste der Endpunkte mit Beispielen steht in der <0>API-Dokumentation</0>, die Anleitung zu Schlüsseln im Handbuch <1>API und Webhooks</1>.",
  "Webhooky — Faktero sa ozve samo": "Webhooks — Faktero meldet sich selbst",
  "Na vašu adresu pošle Faktero správu, keď sa niečo stane — nemusíte sa každú chvíľu pýtať:":
    "Faktero sendet eine Nachricht an Ihre Adresse, wenn etwas passiert — Sie müssen nicht ständig nachfragen:",
  "<0>invoice.created</0>, <1>invoice.sent</1>, <2>invoice.paid</2>, <3>invoice.cancelled</3> — faktúra vznikla, odišla, je uhradená, je stornovaná,":
    "<0>invoice.created</0>, <1>invoice.sent</1>, <2>invoice.paid</2>, <3>invoice.cancelled</3> — Rechnung erstellt, versendet, bezahlt, storniert,",
  "<0>customer.created</0> — nový odberateľ,": "<0>customer.created</0> — neuer Kunde,",
  "<0>bank_transaction.created</0> — nový pohyb na účte.":
    "<0>bank_transaction.created</0> — neuer Kontoumsatz.",
  "Každá správa je podpísaná, neúspešné doručenie sa opakuje a v <0>denníku webhookov</0> vidíte, čo odišlo.":
    "Jede Nachricht ist signiert, eine fehlgeschlagene Zustellung wird wiederholt, und im <0>Webhook-Protokoll</0> sehen Sie, was hinausging.",
  "AI asistenti — Claude, ChatGPT a Faktero AI": "KI-Assistenten — Claude, ChatGPT und Faktero AI",
  "<0>Faktero AI</0> je asistent priamo vo Fakteri — pozná vaše doklady aj tieto manuály. Navyše sa na Faktero napojí <1>Claude, ChatGPT</1>, Claude Code či Cursor cez MCP na adrese <2>https://www.faktero.sk/api/mcp</2>.":
    "<0>Faktero AI</0> ist der Assistent direkt in Faktero — er kennt Ihre Belege und diese Handbücher. Zusätzlich verbinden sich <1>Claude, ChatGPT</1>, Claude Code oder Cursor per MCP unter <2>https://www.faktero.sk/api/mcp</2> mit Faktero.",
  "Asistent cez MCP vie vypísať firmy, faktúry, faktúry po splatnosti, ponuky, cenník, prijaté faktúry, odberateľov, bankové účty a pohyby; vystaviť faktúru, zapísať prijatú faktúru či bloček, založiť odberateľa, produkt alebo firmu, preniesť kontakty a bankové pohyby, označiť úhradu a pozvať používateľa. Nič nemaže a nič neposiela odberateľom.":
    "Der Assistent kann per MCP Unternehmen, Rechnungen, überfällige Rechnungen, Angebote, Preisliste, Eingangsrechnungen, Kunden, Bankkonten und Umsätze auflisten; eine Rechnung ausstellen, eine Eingangsrechnung oder einen Kassenbeleg erfassen, einen Kunden, ein Produkt oder ein Unternehmen anlegen, Kontakte und Bankumsätze übernehmen, eine Zahlung markieren und einen Benutzer einladen. Er löscht nichts und sendet nichts an Kunden.",
  "Postup pridania je v manuáli <0>API a webhooky</0>.":
    "Die Einrichtung ist im Handbuch <0>API und Webhooks</0> beschrieben.",
  "Banky a platby": "Banken und Zahlungen",
  "<0>Tatra banka</0> — priame napojenie: zostatky, pohyby, výpisy a platby z Faktera; cez Tatra banku aj účty v iných slovenských bankách.":
    "<0>Tatra banka</0> — direkte Anbindung: Salden, Umsätze, Auszüge und Zahlungen aus Faktero; über die Tatra banka auch Konten bei anderen slowakischen Banken.",
  "<0>Fio banka, Wise, Revolut Business, Wallester</0> — pohyby a zostatky cez ich API (token alebo prepojenie).":
    "<0>Fio banka, Wise, Revolut Business, Wallester</0> — Umsätze und Salden über deren API (Token oder Verbindung).",
  "<0>E-mailové notifikácie banky</0> — pri banke bez napojenia stačí preposielať avíza o platbách na adresu, ktorú vám Faktero pridelí.":
    "<0>E-Mail-Benachrichtigungen der Bank</0> — bei einer Bank ohne Anbindung genügt es, Zahlungsavise an die Adresse weiterzuleiten, die Faktero Ihnen zuteilt.",
  "<0>Nahratie výpisu</0> (camt.053, CSV z platobných brán) a <1>účet cez API</1> — pre ostatné banky a pri prechode z iného programu.":
    "<0>Kontoauszug hochladen</0> (camt.053, CSV von Zahlungsanbietern) und <1>Konto per API</1> — für andere Banken und beim Wechsel aus einem anderen Programm.",
  "Platby sa <0>párujú s faktúrami</0> samé (podľa VS, sumy a protistrany), vystavené faktúry sa označia ako uhradené.":
    "Zahlungen werden automatisch <0>mit Rechnungen abgeglichen</0> (nach Verwendungszweck/VS, Betrag und Gegenpartei), ausgestellte Rechnungen werden als bezahlt markiert.",
  "<0>Hromadný príkaz na úhradu</0> (SEPA XML) z prijatých faktúr a <1>platobný QR kód</1> na faktúre (PAY by square, v Česku QR platba).":
    "<0>Sammelüberweisung</0> (SEPA-XML) aus Eingangsrechnungen und <1>Zahlungs-QR-Code</1> auf der Rechnung (PAY by square, in Tschechien QR-Zahlung).",
  "<0>Vlastné výpisy</0> v PDF a camt.053 aj pre banky, ktoré ich samé nedajú.":
    "<0>Eigene Kontoauszüge</0> als PDF und camt.053 auch für Banken, die sie selbst nicht liefern.",
  "Podrobne v manuáloch <0>Bankové účty</0> a <1>Leasingy a úvery</1>.":
    "Details in den Handbüchern <0>Bankkonten</0> und <1>Leasing und Kredite</1>.",
  "Účtovné programy": "Buchhaltungsprogramme",
  "<0>POHODA</0> — konektor si doklady berie sám každú noc (aj pre viac firiem jedným kľúčom) a vráti čísla, ktoré im Pohoda pridelila; alebo XML na ručný import. Faktúry, prijaté doklady, pokladňa, adresár, sklad a zákazky, s predkontáciou a členením DPH.":
    "<0>POHODA</0> — der Konnektor holt die Belege jede Nacht selbst ab (auch für mehrere Unternehmen mit einem Schlüssel) und meldet die Nummern zurück, die Pohoda vergeben hat; oder XML für den manuellen Import. Rechnungen, Eingangsbelege, Kasse, Adressbuch, Lager und Aufträge, mit Vorkontierung und USt-Gliederung.",
  "<0>Omega a ALFA plus, Money S3, ABRA Flexi, DATEV</0> — exporty v ich formátoch, vrátane zaúčtovania.":
    "<0>Omega und ALFA plus, Money S3, ABRA Flexi, DATEV</0> — Exporte in deren Formaten, einschließlich Verbuchung.",
  "<0>CSV a ISDOC</0> — pre ostatné programy a e-faktúry v českom štandarde.":
    "<0>CSV und ISDOC</0> — für andere Programme und E-Rechnungen im tschechischen Standard.",
  "<0>Mesačné odovzdanie účtovníkovi</0> — jeden balík (XML, súpisky, PDF a skeny) automaticky e-mailom 5. v mesiaci.":
    "<0>Monatliche Übergabe an den Buchhalter</0> — ein Paket (XML, Listen, PDF und Scans) automatisch per E-Mail am 5. des Monats.",
  "<0>Prístup pre účtovníka</0> — pozvete ho do firmy s rolou účtovník; doklady vedie a zaúčtuje priamo vo Fakteri.":
    "<0>Zugang für den Buchhalter</0> — Sie laden ihn mit der Rolle Buchhalter ins Unternehmen ein; er führt und verbucht die Belege direkt in Faktero.",
  "Podrobne v manuáloch <0>Prepojenie s Pohodou</0>, <1>Exporty a importy</1> a <2>Automatické zaúčtovanie</2>.":
    "Details in den Handbüchern <0>Anbindung an Pohoda</0>, <1>Exporte und Importe</1> und <2>Automatische Verbuchung</2>.",
  "eFaktúra, štát a registre": "E-Rechnung, Staat und Register",
  "<0>eFaktúra</0> — posielanie a prijímanie elektronických faktúr cez sieť Peppol (od roku 2027 povinné), s doručenkami a prijatými eFaktúrami priamo vo Fakteri.":
    "<0>E-Rechnung</0> — Versand und Empfang elektronischer Rechnungen über das Peppol-Netz (ab 2027 Pflicht in der Slowakei), mit Zustellnachweisen und empfangenen E-Rechnungen direkt in Faktero.",
  "<0>Finančná správa</0> — bloček z eKasy načítaný z QR kódu (aj s položkami), výkazy DPH v XML na podanie (priznanie, kontrolný a súhrnný výkaz; v Česku DPHDP3, KH1 a SHV).":
    "<0>Finanzverwaltung</0> — Kassenbeleg aus eKasa per QR-Code eingelesen (auch mit Positionen), USt-Meldungen als XML zur Abgabe (Erklärung, Kontroll- und zusammenfassende Meldung; in Tschechien DPHDP3, KH1 und SHV).",
  "<0>Registre</0> — údaje firmy podľa IČO (slovenské a české registre), overenie IČ DPH vo VIES s dôkazom pre daňovú kontrolu.":
    "<0>Register</0> — Unternehmensdaten nach Firmen-ID (slowakische und tschechische Register), Prüfung der USt-IdNr. in VIES mit Nachweis für die Steuerprüfung.",
  "<0>Kurzy</0> — ECB, ČNB a nemecké BMF pre faktúry v cudzej mene.":
    "<0>Wechselkurse</0> — EZB, ČNB und das deutsche BMF für Rechnungen in Fremdwährung.",
  "Podrobne v manuáloch <0>eFaktúra</0>, <1>Výkazy k DPH</1> a <2>OSS — predaj do EÚ</2>.":
    "Details in den Handbüchern <0>E-Rechnung</0>, <1>USt-Meldungen</1> und <2>OSS — Verkauf in die EU</2>.",
  "E-shopy a doprava": "Onlineshops und Versand",
  "<0>WooCommerce</0> — doplnok pre WordPress vystaví faktúru k objednávke a pošle ju zákazníkovi.":
    "<0>WooCommerce</0> — das WordPress-Plugin stellt zur Bestellung eine Rechnung aus und sendet sie dem Kunden.",
  "<0>Shoptet</0> — objednávky sa prenesú do Faktera a vyfakturujú.":
    "<0>Shoptet</0> — Bestellungen werden nach Faktero übernommen und fakturiert.",
  "<0>Zásielkovňa</0> — zásielka k faktúre jedným klikom, sledovanie stavu.":
    "<0>Packeta (Zásielkovňa)</0> — Sendung zur Rechnung mit einem Klick, Statusverfolgung.",
  "Ostatné e-shopy a pokladne sa napoja cez <0>API</0>.":
    "Andere Onlineshops und Kassen verbinden sich per <0>API</0>.",
  "Podrobne v manuáli <0>E-shop na WooCommerce</0>.":
    "Details im Handbuch <0>Onlineshop mit WooCommerce</0>.",
  "Kniha jázd a vozidlá": "Fahrtenbuch und Fahrzeuge",
  "<0>Commander</0> — jazdy z GPS jednotiek vozidiel.":
    "<0>Commander</0> — Fahrten aus den GPS-Einheiten der Fahrzeuge.",
  "<0>Tesla</0> — jazdy priamo z auta.": "<0>Tesla</0> — Fahrten direkt aus dem Auto.",
  "<0>Aplikácia Kniha jázd</0> — jazdu rozpozná telefón sám, adresy a vodiča doplní Faktero.":
    "<0>App Fahrtenbuch</0> — das Telefon erkennt die Fahrt selbst, Adressen und Fahrer ergänzt Faktero.",
  "Podrobne v manuáloch <0>Kniha jázd</0> a <1>Vozový park</1>.":
    "Details in den Handbüchern <0>Fahrtenbuch</0> und <1>Fuhrpark</1>.",
  "E-mail, skenovanie a doklady": "E-Mail, Scannen und Belege",
  "<0>Príjem dokladov e-mailom</0> — firma má vlastnú adresu; faktúry a bločky, ktoré na ňu pošlete či preposielate, Faktero prečíta a zaradí.":
    "<0>Belegempfang per E-Mail</0> — das Unternehmen hat eine eigene Adresse; Rechnungen und Kassenbelege, die Sie dorthin senden oder weiterleiten, liest Faktero aus und ordnet sie zu.",
  "<0>Skener v aplikácii</0> — odfotený doklad prečíta AI; ISDOC a ZUGFeRD v PDF sa načítajú presne.":
    "<0>Scanner in der App</0> — einen fotografierten Beleg liest die KI aus; ISDOC und ZUGFeRD im PDF werden exakt eingelesen.",
  "<0>Odosielanie faktúr</0> — e-mailom z Faktera alebo z vlastnej poštovej schránky (SMTP), s verejným odkazom na faktúru.":
    "<0>Rechnungsversand</0> — per E-Mail aus Faktero oder aus dem eigenen Postfach (SMTP), mit öffentlichem Link zur Rechnung.",
  "Podrobne v manuáloch <0>Doklady a skenovanie</0> a <1>Prijaté faktúry</1>.":
    "Details in den Handbüchern <0>Belege und Scannen</0> und <1>Eingangsrechnungen</1>.",
  "Prechod z iných programov": "Wechsel aus anderen Programmen",
  "Faktúry, kontakty a doklady prenesiete z programov <0>POHODA a mPOHODA</0>, <1>SuperFaktúra</1>, <2>iDoklad</2>, <3>KROS (Omega)</3> a <4>Money S3</4>; prijaté doklady z exportu pre Pohodu, z tabuľky a zo ZIP so skenmi. Číslovanie faktúr potom pokračuje tam, kde ste skončili.":
    "Rechnungen, Kontakte und Belege übernehmen Sie aus <0>POHODA und mPOHODA</0>, <1>SuperFaktúra</1>, <2>iDoklad</2>, <3>KROS (Omega)</3> und <4>Money S3</4>; Eingangsbelege aus einem Export für Pohoda, aus einer Tabelle und aus einem ZIP mit Scans. Die Rechnungsnummerierung setzt dann dort fort, wo Sie aufgehört haben.",
  "Väčší prenos (celú históriu dokladov aj so súbormi, adresár, cenník, bankové účty) zvládne aj <0>API</0>. Ak potrebujete pomôcť s prechodom, napíšte nám.":
    "Eine größere Übernahme (die ganze Belegsgeschichte samt Dateien, Adressbuch, Preisliste, Bankkonten) schafft auch die <0>API</0>. Wenn Sie Hilfe beim Wechsel brauchen, schreiben Sie uns.",
  "Aplikácie a ostatné": "Apps und Sonstiges",
  "<0>Mobilná aplikácia</0> pre iPhone a Android — faktúry, doklady, skener, banka; funguje aj bez signálu.":
    "<0>Mobile App</0> für iPhone und Android — Rechnungen, Belege, Scanner, Bank; funktioniert auch ohne Empfang.",
  "<0>Predplatné Faktera</0> sa platí kartou cez GoPay.":
    "<0>Das Faktero-Abonnement</0> wird per Karte über GoPay bezahlt.",
  "Na stiahnutie": "Downloads",
  "Tlačiť alebo uložiť ako PDF": "Drucken oder als PDF speichern",
  "Všetky manuály (PDF)": "Alle Handbücher (PDF)",
  "API a prepojenia — tento prehľad (PDF)": "API und Anbindungen — diese Übersicht (PDF)",
  "API dokumentácia — všetky endpointy s príkladmi (PDF)":
    "API-Dokumentation — alle Endpunkte mit Beispielen (PDF)",
  "Všetky manuály Faktera v jednom súbore (PDF)": "Alle Faktero-Handbücher in einer Datei (PDF)",
  "Všetko, s čím sa Faktero prepojí — aj ako PDF na stiahnutie.":
    "Alles, womit sich Faktero verbindet — auch als PDF zum Herunterladen.",
  "API a prepojenia (PDF)": "API und Anbindungen (PDF)",
};
