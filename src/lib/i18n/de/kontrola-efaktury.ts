// Prüfung von E-Rechnungen (KontrolaEfaktury.tsx, /efaktura/kontrola, /nastroje/kontrola-efaktury) und Regeltexte (efaktura/kontrola/pravidla.ts).
export default {
  "Súbor sa nepodarilo skontrolovať.": "Die Datei konnte nicht geprüft werden.",
  "Súbor je väčší ako {mb} MB.": "Die Datei ist größer als {mb} MB.",
  "Pretiahnite sem XML e-faktúry": "XML-Datei der E-Rechnung hierher ziehen",
  "UBL 2.1 Invoice alebo CreditNote (Peppol BIS Billing 3.0), najviac {mb} MB.":
    "UBL 2.1 Invoice oder CreditNote (Peppol BIS Billing 3.0), höchstens {mb} MB.",
  "Vložiť XML ako text": "XML als Text einfügen",
  "Súbor sa kontroluje len vo vašom prehliadači — nikam sa neodosiela ani neukladá.":
    "Die Datei wird nur in Ihrem Browser geprüft — sie wird weder hochgeladen noch gespeichert.",
  "XML e-faktúry": "XML der E-Rechnung",
  "Kontrolujem…": "Wird geprüft…",
  "Bez chýb, {n} varovaní": "Keine Fehler, {n} Warnungen",
  "Bez chýb a varovaní": "Keine Fehler und keine Warnungen",
  "Chyby: {c}, varovania: {v}": "Fehler: {c}, Warnungen: {v}",
  "skontrolovaných pravidiel: {n}": "geprüfte Regeln: {n}",
  "Dobropis (CreditNote)": "Rechnungskorrektur (CreditNote)",
  "Faktúra (Invoice)": "Rechnung (Invoice)",
  "Typ (UNCL 1001)": "Art (UNCL 1001)",
  Predávajúci: "Verkäufer",
  Kupujúci: "Käufer",
  "Všetko ({n})": "Alle ({n})",
  "Chyby ({n})": "Fehler ({n})",
  "Varovania ({n})": "Warnungen ({n})",
  Varovanie: "Warnung",
  "Vlastná kontrola Faktera": "Eigene Prüfung von Faktero",
  "riadok {r}, stĺpec {s}": "Zeile {r}, Spalte {s}",
  "Kontrola pokrýva najčastejšie pravidlá EN 16931 a Peppol BIS Billing 3.0 (povinné údaje, výpočty súm, DPH podľa kategórií, číselníky) a slovenské zvyklosti eFaktúry. Kódy začínajúce FAKTERO sú vlastné kontroly. Úplnú kontrolu schémou a schematronom robí poskytovateľ pri odoslaní.":
    "Die Prüfung deckt die häufigsten Regeln von EN 16931 und Peppol BIS Billing 3.0 ab (Pflichtangaben, Summenberechnung, USt nach Kategorien, Codelisten) sowie slowakische Besonderheiten der E-Rechnung. Codes, die mit FAKTERO beginnen, sind eigene Prüfungen. Die vollständige Prüfung gegen Schema und Schematron erfolgt beim Versand durch den Anbieter.",
  "Kontrola e-faktúry": "E-Rechnung prüfen",
  "Nahrajte XML e-faktúry (UBL, Peppol BIS 3.0) — vlastnú aj prijatú — a uvidíte chyby a varovania podľa EN 16931, Peppolu a slovenských pravidiel.":
    "Laden Sie das XML einer E-Rechnung hoch (UBL, Peppol BIS 3.0) — eigene oder empfangene — und sehen Sie Fehler und Warnungen nach EN 16931, Peppol und slowakischen Regeln.",
  "Kontrola e-faktúry — Faktero": "E-Rechnung prüfen — Faktero",
  "Od 1. 1. 2027 posielajú slovenskí platitelia DPH faktúry ako XML cez sieť Peppol. Nahrajte svoj súbor a zistite, či prejde — s vysvetlením každej chyby a odkazom na pravidlo.":
    "Ab 1. 1. 2027 versenden slowakische Umsatzsteuerpflichtige Rechnungen als XML über das Peppol-Netz. Laden Sie Ihre Datei hoch und prüfen Sie, ob sie angenommen wird — mit Erklärung jedes Fehlers und Link zur Regel.",
  "Zadarmo a bez registrácie. Súbor sa nikam neodosiela ani neukladá.":
    "Kostenlos und ohne Registrierung. Die Datei wird weder hochgeladen noch gespeichert.",
  "Čo kontrolujeme": "Was wir prüfen",
  "Dobre formovaný XML a správny koreň — UBL 2.1 Invoice alebo CreditNote.":
    "Wohlgeformtes XML und richtiges Wurzelelement — UBL 2.1 Invoice oder CreditNote.",
  "Povinné údaje podľa EN 16931: číslo, dátum, typ dokladu, mena, predávajúci, kupujúci, riadky a sumy.":
    "Pflichtangaben nach EN 16931: Nummer, Datum, Belegart, Währung, Verkäufer, Käufer, Positionen und Summen.",
  "Výpočty: súčet riadkov, suma bez DPH a s DPH, suma na úhradu a rozpis DPH podľa kategórií (S, Z, E, AE, K, G, O).":
    "Berechnungen: Summe der Positionen, Netto- und Bruttobetrag, Zahlbetrag und USt-Aufschlüsselung nach Kategorien (S, Z, E, AE, K, G, O).",
  "Pravidlá Peppol BIS Billing 3.0: elektronická adresa so schémou, formát dátumov, kódy mien, krajín a merných jednotiek.":
    "Regeln von Peppol BIS Billing 3.0: elektronische Adresse mit Schema, Datumsformat, Codes für Währungen, Länder und Mengeneinheiten.",
  "Slovenská eFaktúra: adresa 0245 s DIČ, tvar IČ DPH a IČO, sadzby DPH a pôvodná faktúra pri dobropise.":
    "Slowakische E-Rechnung: Adresse 0245 mit DIČ, Format von USt-IdNr. und IČO, Steuersätze und ursprüngliche Rechnung bei einer Rechnungskorrektur.",
  "Nechcete XML riešiť vôbec?": "Sie möchten sich gar nicht mit XML befassen?",
  "Faktero vystaví eFaktúru správne samo, odošle ju cez Peppol a prijaté faktúry vám zaeviduje. Kontrola e-faktúry je v aplikácii k dispozícii aj pre väčšie súbory.":
    "Faktero erstellt die E-Rechnung selbst korrekt, versendet sie über Peppol und erfasst empfangene Rechnungen für Sie. In der Anwendung steht die Prüfung auch für größere Dateien zur Verfügung.",
  "Kontrola e-faktúry zadarmo — validátor UBL a Peppol BIS 3.0 | Faktero":
    "E-Rechnung kostenlos prüfen — Validator für UBL und Peppol BIS 3.0 | Faktero",
  "Overte XML e-faktúry pred odoslaním: povinné údaje, výpočty súm a DPH podľa EN 16931, pravidlá Peppol BIS 3.0 a slovenskej eFaktúry 2027. Zadarmo, bez registrácie, súbor neopustí váš prehliadač.":
    "Prüfen Sie das XML einer E-Rechnung vor dem Versand: Pflichtangaben, Summen und USt nach EN 16931, Regeln von Peppol BIS 3.0 und der slowakischen E-Rechnung 2027. Kostenlos, ohne Registrierung, die Datei verlässt Ihren Browser nicht.",
  "Kontrola XML": "XML-Prüfung",
  "Akékoľvek XML e-faktúry — vlastné, od dodávateľa alebo z iného programu — skontrolujete v <0>eFaktúra → Kontrola XML</0>. Uvidíte chyby a varovania podľa EN 16931, Peppol BIS 3.0 a slovenských pravidiel, každú s kódom pravidla (napríklad BR-CO-15) a miestom v súbore. Súbor sa kontroluje len vo vašom prehliadači. Bez prihlásenia je kontrola aj na stránke <1>Kontrola e-faktúry</1>.":
    "Jedes XML einer E-Rechnung — eigenes, vom Lieferanten oder aus einem anderen Programm — prüfen Sie unter <0>E-Rechnung → XML-Prüfung</0>. Sie sehen Fehler und Warnungen nach EN 16931, Peppol BIS 3.0 und slowakischen Regeln, jeweils mit Regelcode (zum Beispiel BR-CO-15) und Stelle in der Datei. Die Datei wird nur in Ihrem Browser geprüft. Ohne Anmeldung steht die Prüfung auch auf der Seite <1>E-Rechnung prüfen</1> bereit.",

  /* — Regeltexte — */
  "Súbor nie je dobre formovaný XML: {chyba}": "Die Datei ist kein wohlgeformtes XML: {chyba}",
  "Koreňový prvok musí byť Invoice alebo CreditNote v mennom priestore UBL 2.1 (je {koren} v „{ns}“).":
    "Das Wurzelelement muss Invoice oder CreditNote im UBL-2.1-Namensraum sein (gefunden: {koren} in „{ns}“).",
  "Hodnota prvku {prvok} musí byť číslo s desatinnou bodkou, napr. 123.45 (je „{hodnota}“).":
    "Der Wert von {prvok} muss eine Zahl mit Dezimalpunkt sein, z. B. 123.45 (gefunden: „{hodnota}“).",
  "Chýba identifikátor špecifikácie (CustomizationID, BT-24).":
    "Die Spezifikationskennung fehlt (CustomizationID, BT-24).",
  "Chýba číslo faktúry (ID, BT-1).": "Die Rechnungsnummer fehlt (ID, BT-1).",
  "Chýba dátum vystavenia (IssueDate, BT-2).": "Das Rechnungsdatum fehlt (IssueDate, BT-2).",
  "Chýba kód typu dokladu (InvoiceTypeCode / CreditNoteTypeCode, BT-3).":
    "Der Code der Belegart fehlt (InvoiceTypeCode / CreditNoteTypeCode, BT-3).",
  "Chýba kód meny faktúry (DocumentCurrencyCode, BT-5).":
    "Der Währungscode fehlt (DocumentCurrencyCode, BT-5).",
  "Chýba obchodné meno predávajúceho (PartyLegalEntity/RegistrationName, BT-27).":
    "Der Name des Verkäufers fehlt (PartyLegalEntity/RegistrationName, BT-27).",
  "Chýba obchodné meno kupujúceho (PartyLegalEntity/RegistrationName, BT-44).":
    "Der Name des Käufers fehlt (PartyLegalEntity/RegistrationName, BT-44).",
  "Chýba poštová adresa predávajúceho (BG-5).": "Die Postanschrift des Verkäufers fehlt (BG-5).",
  "Adresa predávajúceho nemá kód krajiny (BT-40).":
    "Die Anschrift des Verkäufers hat keinen Ländercode (BT-40).",
  "Chýba poštová adresa kupujúceho (BG-8).": "Die Postanschrift des Käufers fehlt (BG-8).",
  "Adresa kupujúceho nemá kód krajiny (BT-55).":
    "Die Anschrift des Käufers hat keinen Ländercode (BT-55).",
  "Chýba súčet čistých súm riadkov (LegalMonetaryTotal/LineExtensionAmount, BT-106).":
    "Die Summe der Nettobeträge der Positionen fehlt (LegalMonetaryTotal/LineExtensionAmount, BT-106).",
  "Chýba celková suma bez DPH (TaxExclusiveAmount, BT-109).":
    "Der Gesamtbetrag ohne USt fehlt (TaxExclusiveAmount, BT-109).",
  "Chýba celková suma s DPH (TaxInclusiveAmount, BT-112).":
    "Der Gesamtbetrag mit USt fehlt (TaxInclusiveAmount, BT-112).",
  "Chýba suma na úhradu (PayableAmount, BT-115).": "Der Zahlbetrag fehlt (PayableAmount, BT-115).",
  "Faktúra musí mať aspoň jeden riadok (BG-25).":
    "Die Rechnung muss mindestens eine Position enthalten (BG-25).",
  "Riadok {riadok} nemá identifikátor (ID, BT-126).":
    "Position {riadok} hat keine Kennung (ID, BT-126).",
  "Riadok {riadok} nemá fakturované množstvo (BT-129).":
    "Position {riadok} hat keine Menge (BT-129).",
  "Množstvo v riadku {riadok} nemá mernú jednotku (unitCode, BT-130).":
    "Die Menge in Position {riadok} hat keine Einheit (unitCode, BT-130).",
  "Riadok {riadok} nemá čistú sumu (LineExtensionAmount, BT-131).":
    "Position {riadok} hat keinen Nettobetrag (LineExtensionAmount, BT-131).",
  "Riadok {riadok} nemá názov položky (Item/Name, BT-153).":
    "Position {riadok} hat keine Artikelbezeichnung (Item/Name, BT-153).",
  "Riadok {riadok} nemá čistú cenu položky (Price/PriceAmount, BT-146).":
    "Position {riadok} hat keinen Nettopreis (Price/PriceAmount, BT-146).",
  "Čistá cena položky v riadku {riadok} nesmie byť záporná (je {cena}).":
    "Der Nettopreis in Position {riadok} darf nicht negativ sein (ist {cena}).",
  "Riadok {riadok} nemá kategóriu DPH (Item/ClassifiedTaxCategory/ID, BT-151).":
    "Position {riadok} hat keine USt-Kategorie (Item/ClassifiedTaxCategory/ID, BT-151).",
  "Faktúra musí mať aspoň jeden rozpis DPH (TaxTotal/TaxSubtotal, BG-23).":
    "Die Rechnung muss mindestens eine USt-Aufschlüsselung enthalten (TaxTotal/TaxSubtotal, BG-23).",
  "Rozpis DPH nemá základ dane (TaxableAmount, BT-116).":
    "Die USt-Aufschlüsselung hat keine Bemessungsgrundlage (TaxableAmount, BT-116).",
  "Rozpis DPH nemá sumu dane (TaxAmount, BT-117).":
    "Die USt-Aufschlüsselung hat keinen Steuerbetrag (TaxAmount, BT-117).",
  "Rozpis DPH nemá kód kategórie DPH (TaxCategory/ID, BT-118).":
    "Die USt-Aufschlüsselung hat keinen Kategoriecode (TaxCategory/ID, BT-118).",
  "Rozpis DPH v kategórii {kat} nemá sadzbu (Percent, BT-119).":
    "Die USt-Aufschlüsselung der Kategorie {kat} hat keinen Steuersatz (Percent, BT-119).",
  "Platobný pokyn nemá kód spôsobu úhrady (PaymentMeansCode, BT-81).":
    "Die Zahlungsanweisung hat keinen Code der Zahlungsart (PaymentMeansCode, BT-81).",
  "Platobný účet nemá identifikátor (PayeeFinancialAccount/ID, BT-84).":
    "Das Zahlungskonto hat keine Kennung (PayeeFinancialAccount/ID, BT-84).",
  "Pri úhrade prevodom (kód {kod}) musí byť uvedený účet príjemcu (PayeeFinancialAccount/ID, BT-84).":
    "Bei Überweisung (Code {kod}) muss das Empfängerkonto angegeben sein (PayeeFinancialAccount/ID, BT-84).",
  "Odkaz na predchádzajúcu faktúru nemá jej číslo (BillingReference/InvoiceDocumentReference/ID, BT-25).":
    "Der Verweis auf die vorausgegangene Rechnung hat keine Nummer (BillingReference/InvoiceDocumentReference/ID, BT-25).",
  "Príloha nemá identifikátor (AdditionalDocumentReference/ID, BT-122).":
    "Die Anlage hat keine Kennung (AdditionalDocumentReference/ID, BT-122).",
  "Adresa dodania nemá kód krajiny (BT-80).": "Die Lieferanschrift hat keinen Ländercode (BT-80).",
  "Elektronická adresa predávajúceho nemá schému (EndpointID/@schemeID, BT-34).":
    "Die elektronische Adresse des Verkäufers hat kein Schema (EndpointID/@schemeID, BT-34).",
  "Elektronická adresa kupujúceho nemá schému (EndpointID/@schemeID, BT-49).":
    "Die elektronische Adresse des Käufers hat kein Schema (EndpointID/@schemeID, BT-49).",
  "Koniec fakturačného obdobia ({koniec}) je skôr ako jeho začiatok ({zaciatok}).":
    "Das Ende des Abrechnungszeitraums ({koniec}) liegt vor dessen Beginn ({zaciatok}).",
  "Zľava alebo príplatok na úrovni dokladu nemá sumu (Amount, BT-92/BT-99).":
    "Der Nachlass oder Zuschlag auf Belegebene hat keinen Betrag (Amount, BT-92/BT-99).",
  "Zľava alebo príplatok na úrovni dokladu nemá kategóriu DPH (TaxCategory/ID, BT-95/BT-102).":
    "Der Nachlass oder Zuschlag auf Belegebene hat keine USt-Kategorie (TaxCategory/ID, BT-95/BT-102).",
  "Zľava alebo príplatok na úrovni dokladu nemá dôvod ani kód dôvodu (BT-97/BT-98, BT-104/BT-105).":
    "Der Nachlass oder Zuschlag auf Belegebene hat weder Grund noch Grundcode (BT-97/BT-98, BT-104/BT-105).",
  "IČ DPH {id} musí začínať kódom krajiny podľa ISO 3166-1 (napr. SK, CZ; Grécko EL).":
    "Die USt-IdNr. {id} muss mit einem Ländercode nach ISO 3166-1 beginnen (z. B. SK, DE; Griechenland EL).",
  "Predávajúci musí mať identifikátor, IČO (PartyLegalEntity/CompanyID) alebo IČ DPH, aby ho kupujúci vedel rozpoznať.":
    "Der Verkäufer braucht eine Kennung, Registernummer (PartyLegalEntity/CompanyID) oder USt-IdNr., damit der Käufer ihn erkennt.",
  "Súčet čistých súm riadkov (BT-106) je {uvedene}, ale riadky dávajú spolu {vypocitane}.":
    "Die Summe der Nettobeträge (BT-106) ist {uvedene}, die Positionen ergeben aber {vypocitane}.",
  "Súčet zliav na doklade (BT-107) je {uvedene}, ale zľavy dávajú spolu {vypocitane}.":
    "Die Summe der Nachlässe (BT-107) ist {uvedene}, die Nachlässe ergeben aber {vypocitane}.",
  "Súčet príplatkov na doklade (BT-108) je {uvedene}, ale príplatky dávajú spolu {vypocitane}.":
    "Die Summe der Zuschläge (BT-108) ist {uvedene}, die Zuschläge ergeben aber {vypocitane}.",
  "Suma bez DPH (BT-109) je {uvedene}, ale súčet riadkov − zľavy + príplatky dáva {vypocitane}.":
    "Der Betrag ohne USt (BT-109) ist {uvedene}, Positionen − Nachlässe + Zuschläge ergeben aber {vypocitane}.",
  "Celková DPH (BT-110) je {uvedene}, ale súčet DPH v rozpise dáva {vypocitane}.":
    "Die gesamte USt (BT-110) ist {uvedene}, die Aufschlüsselung ergibt aber {vypocitane}.",
  "Suma s DPH (BT-112) je {uvedene}, ale suma bez DPH + DPH dáva {vypocitane}.":
    "Der Betrag mit USt (BT-112) ist {uvedene}, Betrag ohne USt + USt ergibt aber {vypocitane}.",
  "Suma na úhradu (BT-115) je {uvedene}, ale suma s DPH − zaplatené + zaokrúhlenie dáva {vypocitane}.":
    "Der Zahlbetrag (BT-115) ist {uvedene}, Betrag mit USt − bereits gezahlt + Rundung ergibt aber {vypocitane}.",
  "DPH v rozpise kategórie {kat} je {uvedene}, ale základ × sadzba {sadzba} % dáva {vypocitane}.":
    "Die USt in der Aufschlüsselung der Kategorie {kat} ist {uvedene}, Grundlage × Satz {sadzba} % ergibt aber {vypocitane}.",
  "Kód typu dokladu {kod} nie je v číselníku UNCL 1001.":
    "Der Belegartcode {kod} ist nicht in der Codeliste UNCL 1001.",
  "Mena faktúry {kod} nie je platný kód ISO 4217.":
    "Die Rechnungswährung {kod} ist kein gültiger ISO-4217-Code.",
  "Kód krajiny {kod} nie je platný podľa ISO 3166-1 alpha-2.":
    "Der Ländercode {kod} ist nach ISO 3166-1 alpha-2 nicht gültig.",
  "Kód spôsobu úhrady {kod} nie je v číselníku UNCL 4461.":
    "Der Zahlungsartcode {kod} ist nicht in der Codeliste UNCL 4461.",
  "Kategória DPH {kod} nie je v číselníku UNCL 5305 (S, Z, E, AE, K, G, O, L, M, B).":
    "Die USt-Kategorie {kod} ist nicht in der Codeliste UNCL 5305 (S, Z, E, AE, K, G, O, L, M, B).",
  "Kód dôvodu oslobodenia {kod} nie je v číselníku VATEX.":
    "Der Befreiungsgrundcode {kod} ist nicht in der Codeliste VATEX.",
  "Merná jednotka {kod} nie je v číselníku UN/ECE Rec. 20/21 (kus je C62, hodina HUR).":
    "Die Einheit {kod} ist nicht in UN/ECE Rec. 20/21 (Stück ist C62, Stunde HUR).",
  "Riadky, zľavy alebo príplatky s kategóriou DPH {kat} a rozpis DPH si nezodpovedajú — kategória musí byť na oboch miestach alebo na žiadnom.":
    "Positionen, Nachlässe oder Zuschläge mit der USt-Kategorie {kat} und die USt-Aufschlüsselung passen nicht zusammen — die Kategorie muss an beiden Stellen vorkommen oder an keiner.",
  "Riadok s kategóriou DPH {kat} vyžaduje IČ DPH alebo daňové identifikačné číslo predávajúceho (BT-31/BT-32).":
    "Eine Position mit der USt-Kategorie {kat} erfordert die USt-IdNr. oder Steuernummer des Verkäufers (BT-31/BT-32).",
  "Riadok {riadok} s kategóriou DPH {kat} musí mať sadzbu väčšiu ako nula.":
    "Position {riadok} mit der USt-Kategorie {kat} muss einen Steuersatz größer als null haben.",
  "Základ dane v kategórii {kat} so sadzbou {sadzba} % je {uvedene}, ale riadky, zľavy a príplatky s touto sadzbou dávajú {vypocitane}.":
    "Die Bemessungsgrundlage der Kategorie {kat} mit {sadzba} % ist {uvedene}, Positionen, Nachlässe und Zuschläge mit diesem Satz ergeben aber {vypocitane}.",
  "DPH v kategórii {kat} so sadzbou {sadzba} % je {uvedene}, ale základ × sadzba dáva {vypocitane}.":
    "Die USt der Kategorie {kat} mit {sadzba} % ist {uvedene}, Grundlage × Satz ergibt aber {vypocitane}.",
  "Rozpis DPH v kategórii {kat} nesmie uvádzať dôvod oslobodenia (TaxExemptionReason/Code).":
    "Die USt-Aufschlüsselung der Kategorie {kat} darf keinen Befreiungsgrund enthalten (TaxExemptionReason/Code).",
  "Doklad používa kategóriu DPH {kat}, preto musí mať v rozpise DPH práve jeden riadok tejto kategórie (je ich {pocet}).":
    "Der Beleg verwendet die USt-Kategorie {kat} und muss daher genau eine Aufschlüsselung dieser Kategorie enthalten (vorhanden: {pocet}).",
  "Riadok {riadok} s kategóriou DPH {kat} musí mať sadzbu 0 %.":
    "Position {riadok} mit der USt-Kategorie {kat} muss den Steuersatz 0 % haben.",
  "Základ dane v kategórii {kat} je {uvedene}, ale riadky, zľavy a príplatky tejto kategórie dávajú {vypocitane}.":
    "Die Bemessungsgrundlage der Kategorie {kat} ist {uvedene}, Positionen, Nachlässe und Zuschläge dieser Kategorie ergeben aber {vypocitane}.",
  "DPH v kategórii {kat} musí byť nula (je {uvedene}).":
    "Die USt der Kategorie {kat} muss null sein (ist {uvedene}).",
  "Rozpis DPH v kategórii {kat} musí uvádzať dôvod oslobodenia — text alebo kód VATEX (BT-120/BT-121).":
    "Die USt-Aufschlüsselung der Kategorie {kat} muss einen Befreiungsgrund enthalten — Text oder VATEX-Code (BT-120/BT-121).",
  "Prenesenie daňovej povinnosti ({kat}) vyžaduje IČ DPH predávajúceho a IČ DPH alebo IČO kupujúceho (BT-31, BT-48/BT-47).":
    "Reverse Charge ({kat}) erfordert die USt-IdNr. des Verkäufers und die USt-IdNr. oder Registernummer des Käufers (BT-31, BT-48/BT-47).",
  "Dodanie v rámci EÚ ({kat}) vyžaduje IČ DPH predávajúceho aj kupujúceho (BT-31, BT-48).":
    "Eine innergemeinschaftliche Lieferung ({kat}) erfordert die USt-IdNr. von Verkäufer und Käufer (BT-31, BT-48).",
  "Pri dodaní v rámci EÚ ({kat}) musí byť uvedený dátum dodania (BT-72) alebo fakturačné obdobie (BG-14).":
    "Bei innergemeinschaftlicher Lieferung ({kat}) muss das Lieferdatum (BT-72) oder der Abrechnungszeitraum (BG-14) angegeben sein.",
  "Pri dodaní v rámci EÚ ({kat}) musí byť uvedená krajina dodania (Delivery/DeliveryLocation/Address/Country, BT-80).":
    "Bei innergemeinschaftlicher Lieferung ({kat}) muss das Lieferland angegeben sein (Delivery/DeliveryLocation/Address/Country, BT-80).",
  "Riadok s kategóriou DPH {kat} vyžaduje IČ DPH predávajúceho (BT-31).":
    "Eine Position mit der USt-Kategorie {kat} erfordert die USt-IdNr. des Verkäufers (BT-31).",
  "Pri plnení mimo predmetu DPH ({kat}) nesmie doklad uvádzať IČ DPH predávajúceho ani kupujúceho (BT-31, BT-48).":
    "Bei nicht steuerbaren Umsätzen ({kat}) darf der Beleg weder die USt-IdNr. des Verkäufers noch des Käufers enthalten (BT-31, BT-48).",
  "Riadok {riadok} s kategóriou DPH {kat} nesmie uvádzať sadzbu DPH.":
    "Position {riadok} mit der USt-Kategorie {kat} darf keinen Steuersatz enthalten.",
  "Doklad s rozpisom DPH v kategórii {kat} nesmie mať rozpis v inej kategórii.":
    "Ein Beleg mit USt-Aufschlüsselung der Kategorie {kat} darf keine Aufschlüsselung einer anderen Kategorie enthalten.",
  "Doklad s rozpisom DPH v kategórii {kat} nesmie mať riadok s inou kategóriou (riadok {riadok}).":
    "Ein Beleg mit USt-Aufschlüsselung der Kategorie {kat} darf keine Position mit anderer Kategorie enthalten (Position {riadok}).",
  "Suma {prvok} smie mať najviac 2 desatinné miesta (je {hodnota}).":
    "Der Betrag {prvok} darf höchstens 2 Nachkommastellen haben (ist {hodnota}).",
  "Chýba identifikátor obchodného procesu (ProfileID).":
    "Die Kennung des Geschäftsprozesses fehlt (ProfileID).",
  "ProfileID „{hodnota}“ nie je schválený proces Peppol BIS (očakáva sa urn:fdc:peppol.eu:2017:poacc:billing:01:1.0, pri samofaktúre urn:fdc:peppol.eu:2017:poacc:selfbilling:01:1.0).":
    "ProfileID „{hodnota}“ ist kein zugelassener Peppol-BIS-Prozess (erwartet: urn:fdc:peppol.eu:2017:poacc:billing:01:1.0, bei Gutschriften im Gutschriftsverfahren urn:fdc:peppol.eu:2017:poacc:selfbilling:01:1.0).",
  "CustomizationID musí začínať {ocakava} (je „{hodnota}“).":
    "CustomizationID muss mit {ocakava} beginnen (ist „{hodnota}“).",
  "V hlavičke dokladu smie byť najviac jedna poznámka (Note), je ich {pocet}.":
    "Im Belegkopf ist höchstens eine Bemerkung (Note) erlaubt, vorhanden: {pocet}.",
  "Chýba referencia kupujúceho (BuyerReference) aj číslo objednávky (OrderReference/ID) — aspoň jedno je povinné.":
    "Es fehlen Käuferreferenz (BuyerReference) und Bestellnummer (OrderReference/ID) — mindestens eines ist Pflicht.",
  "Prvok {prvok} je prázdny — prázdne prvky nie sú povolené.":
    "Das Element {prvok} ist leer — leere Elemente sind nicht erlaubt.",
  "Chýba elektronická adresa kupujúceho (EndpointID) — bez nej sa faktúra v sieti Peppol nedoručí.":
    "Die elektronische Adresse des Käufers fehlt (EndpointID) — ohne sie wird die Rechnung im Peppol-Netz nicht zugestellt.",
  "Chýba elektronická adresa predávajúceho (EndpointID).":
    "Die elektronische Adresse des Verkäufers fehlt (EndpointID).",
  "Schéma elektronickej adresy „{kod}“ nie je v zozname Peppol (slovenská firma používa 0245).":
    "Das Schema der elektronischen Adresse „{kod}“ ist nicht in der Peppol-Liste (slowakische Unternehmen verwenden 0245).",
  "Doklad musí mať práve jeden TaxTotal s rozpisom DPH (je ich {pocet}).":
    "Der Beleg muss genau ein TaxTotal mit USt-Aufschlüsselung enthalten (vorhanden: {pocet}).",
  "Mena sumy {prvok} ({mena}) sa líši od meny faktúry ({menaFaktury}).":
    "Die Währung des Betrags {prvok} ({mena}) weicht von der Rechnungswährung ({menaFaktury}) ab.",
  "Mena {kod} v atribúte currencyID nie je platný kód ISO 4217.":
    "Die Währung {kod} im Attribut currencyID ist kein gültiger ISO-4217-Code.",
  "Dátum {prvok} musí byť v tvare RRRR-MM-DD (je „{hodnota}“).":
    "Das Datum {prvok} muss das Format JJJJ-MM-TT haben (ist „{hodnota}“).",
  "Typ faktúry {kod} nie je v tomto profile Peppol BIS povolený.":
    "Die Rechnungsart {kod} ist in diesem Peppol-BIS-Profil nicht erlaubt.",
  "Typ dobropisu {kod} nie je v tomto profile Peppol BIS povolený.":
    "Die Art der Rechnungskorrektur {kod} ist in diesem Peppol-BIS-Profil nicht erlaubt.",
  "Typ dokladu {kod} je povolený len medzi dvoma nemeckými firmami (384 aj medzi dvoma slovenskými).":
    "Die Belegart {kod} ist nur zwischen zwei deutschen Unternehmen erlaubt (384 auch zwischen zwei slowakischen).",
  "Kód oslobodenia {kod} vyžaduje kategóriu DPH {ocakavana}, nie {skutocna}.":
    "Der Befreiungscode {kod} erfordert die USt-Kategorie {ocakavana}, nicht {skutocna}.",
  "Pri inkase (kód {kod}) musí byť uvedená referencia mandátu (PaymentMandate/ID).":
    "Bei Lastschrift (Code {kod}) muss die Mandatsreferenz angegeben sein (PaymentMandate/ID).",
  "Čistá suma riadku {riadok} je {uvedene}, ale množstvo × cena (+ príplatky − zľavy riadku) dáva {vypocitane}.":
    "Der Nettobetrag von Position {riadok} ist {uvedene}, Menge × Preis (+ Zuschläge − Nachlässe der Position) ergibt aber {vypocitane}.",
  "Základné množstvo ceny (Price/BaseQuantity) v riadku {riadok} musí byť väčšie ako nula.":
    "Die Preisbasismenge (Price/BaseQuantity) in Position {riadok} muss größer als null sein.",
  "Príplatok na úrovni ceny nie je povolený — Price/AllowanceCharge/ChargeIndicator musí byť false (riadok {riadok}).":
    "Ein Zuschlag auf Preisebene ist nicht erlaubt — Price/AllowanceCharge/ChargeIndicator muss false sein (Position {riadok}).",
  "Čistá cena v riadku {riadok} sa musí rovnať hrubej cene mínus zľava z ceny.":
    "Der Nettopreis in Position {riadok} muss dem Bruttopreis abzüglich Preisnachlass entsprechen.",
  "Typ prílohy {kod} nie je v Peppole povolený (povolené sú PDF, PNG, JPEG, CSV, XLSX a ODS).":
    "Der Anlagentyp {kod} ist in Peppol nicht erlaubt (erlaubt sind PDF, PNG, JPEG, CSV, XLSX und ODS).",
  "Slovenský predávajúci sa v sieti Peppol adresuje schémou 0245 s DIČ, tu je schéma „{schema}“.":
    "Ein slowakischer Verkäufer wird im Peppol-Netz mit Schema 0245 und DIČ adressiert, hier ist das Schema „{schema}“.",
  "Slovenský kupujúci sa v sieti Peppol adresuje schémou 0245 s DIČ, tu je schéma „{schema}“ — faktúra mu nemusí byť doručená.":
    "Ein slowakischer Käufer wird im Peppol-Netz mit Schema 0245 und DIČ adressiert, hier ist das Schema „{schema}“ — die Rechnung wird möglicherweise nicht zugestellt.",
  "Adresa v schéme 0245 musí byť DIČ — 10 číslic bez predpony SK (je „{hodnota}“).":
    "Eine Adresse im Schema 0245 muss die DIČ sein — 10 Ziffern ohne Präfix SK (ist „{hodnota}“).",
  "DIČ v elektronickej adrese ({dic}) sa nezhoduje s IČ DPH {icdph} tej istej strany.":
    "Die DIČ in der elektronischen Adresse ({dic}) stimmt nicht mit der USt-IdNr. {icdph} derselben Partei überein.",
  "Slovenské IČ DPH má tvar SK a 10 číslic (je „{hodnota}“).":
    "Eine slowakische USt-IdNr. besteht aus SK und 10 Ziffern (ist „{hodnota}“).",
  "IČO slovenskej firmy má 8 číslic (je „{hodnota}“).":
    "Die IČO eines slowakischen Unternehmens hat 8 Ziffern (ist „{hodnota}“).",
  "Dobropis a opravná faktúra (typ {kod}) musí obsahovať číslo pôvodnej faktúry (BillingReference, BT-25).":
    "Rechnungskorrektur und korrigierte Rechnung (Art {kod}) müssen die Nummer der ursprünglichen Rechnung enthalten (BillingReference, BT-25).",
  "Sadzba DPH {sadzba} % sa na Slovensku nepoužíva (k dátumu vystavenia platia {sadzby} %).":
    "Der Steuersatz {sadzba} % wird in der Slowakei nicht verwendet (zum Rechnungsdatum gelten {sadzby} %).",
  "IBAN {iban} nemá platný kontrolný súčet — skontrolujte číslo účtu.":
    "Die IBAN {iban} hat keine gültige Prüfsumme — bitte Kontonummer prüfen.",
  "základná alebo znížená sadzba": "Normal- oder ermäßigter Satz",
  "nulová sadzba": "Nullsatz",
  "oslobodené od dane": "steuerbefreit",
  "prenesenie daňovej povinnosti": "Reverse Charge",
  "dodanie tovaru alebo služby v rámci EÚ": "innergemeinschaftliche Lieferung oder Leistung",
  "vývoz mimo EÚ": "Ausfuhr aus der EU",
  "mimo predmetu DPH": "nicht steuerbar",
  "Kanárske ostrovy (IGIC)": "Kanarische Inseln (IGIC)",
  "Ceuta a Melilla (IPSI)": "Ceuta und Melilla (IPSI)",
  "rozdelená platba (Taliansko)": "Split Payment (Italien)",
};
