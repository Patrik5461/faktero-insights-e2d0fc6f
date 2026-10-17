// Preklady: export DATEV (Buchungsstapel) a prehľad UStVA pre nemecké firmy.
export default {
  // Účtovné exporty
  "Exportujte faktúry do Pohody, Omegy, Money S3, ABRA Flexi, DATEV, do ISDOC-u alebo ako súpisku pre Excel.":
    "Exportieren Sie Rechnungen nach DATEV, Pohoda, Omega, Money S3, ABRA Flexi, als ISDOC oder als Liste für Excel.",
  "Súbor EXTF_Buchungsstapel… (Windows-1252) načíta DATEV Rechnungswesen cez Bestand → Importieren → ASCII-Daten / DATEV-Format, prípadne ho pošlite poradcovi do DATEV Unternehmen online. Jeden súbor smie obsahovať len doklady z jedného hospodárskeho roka. Pred prvým exportom vyplňte v nastaveniach Beraternummer a Mandantennummer.":
    "Die Datei EXTF_Buchungsstapel… (Windows-1252) liest DATEV Rechnungswesen über Bestand → Importieren → ASCII-Daten / DATEV-Format ein, alternativ geben Sie sie Ihrer Steuerberatung für DATEV Unternehmen online. Eine Datei darf nur Belege aus einem Wirtschaftsjahr enthalten. Tragen Sie vor dem ersten Export Beraternummer und Mandantennummer in den Einstellungen ein.",
  "Beraternummer a Mandantennummer vám dá daňový poradca. Daň si DATEV rozpočíta sám: výnosy a nákupy v prenesení idú na automatické účty, bežné náklady s BU-Schlüssel. Účet z predkontácie (Účtovníctvo → Predkontácie, MD pri nákupe, Dal pri predaji) má prednosť pred predvoleným.":
    "Beraternummer und Mandantennummer erhalten Sie von Ihrer Steuerberatung. Die Steuer errechnet DATEV selbst: Erlöse sowie Einkäufe mit Steuerschuldumkehr laufen über Automatikkonten, übrige Aufwendungen mit BU-Schlüssel. Ein Konto aus der Vorkontierung (Buchhaltung → Vorkontierungen, Soll beim Einkauf, Haben beim Verkauf) hat Vorrang vor dem Standardkonto.",
  "Mandant v DATEV": "Mandant in DATEV",
  "Číslo daňového poradcu v DATEV (1001–9999999).":
    "Nummer der Steuerberatung in DATEV (1001–9999999).",
  "napr. 29098": "z. B. 29098",
  "napr. 55003": "z. B. 55003",
  "Účtová osnova": "Kontenrahmen",
  "Dĺžka Sachkonten": "Sachkontenlänge",
  "Hospodársky rok začína v mesiaci": "Wirtschaftsjahr beginnt im Monat",
  "1 = január": "1 = Januar",
  "Debitori a kreditori": "Debitoren und Kreditoren",
  "Zberné účty (10000 / 70000)": "Sammelkonten (10000 / 70000)",
  "Osobné účty podľa partnera": "Personenkonten je Geschäftspartner",
  "napr. FA": "z. B. FA",
  "Ďalšie automatické účty (bez BU-Schlüssel)": "Weitere Automatikkonten (ohne BU-Schlüssel)",
  "napr. 3400, 8401": "z. B. 3400, 8401",
  "Prepis účtov (prázdne = predvolený účet osnovy)":
    "Abweichende Konten (leer = Standardkonto des Kontenrahmens)",
  "BU-Schlüssel pri bežnom účte": "BU-Schlüssel bei Konten ohne Automatik",
  "§ 13b 19 % (tuzemsko)": "§ 13b 19 % (Inland)",
  "§ 13b 19 % (služba z EÚ)": "§ 13b 19 % (Leistung aus der EU)",
  "Zberný Debitor (odberatelia)": "Sammeldebitor (Kunden)",
  "Zberný Kreditor (dodávatelia)": "Sammelkreditor (Lieferanten)",
  "Náklady, keď predkontácia nemá účet (Sonstiger Betriebsbedarf) — s BU-Schlüssel":
    "Aufwand, wenn die Vorkontierung kein Konto hat (Sonstiger Betriebsbedarf) — mit BU-Schlüssel",
  "Kasse — bločky platené v hotovosti": "Kasse — bar bezahlte Kassenbelege",
  "Geldtransit — bločky platené kartou": "Geldtransit — mit Karte bezahlte Kassenbelege",

  // UStVA — obrazovka
  "Prehľad Umsatzsteuer-Voranmeldung (UStVA) zostavený z dokladov — na prepis do ELSTER alebo pre daňového poradcu.":
    "Übersicht der Umsatzsteuer-Voranmeldung (UStVA) aus Ihren Belegen — zum Übertragen in ELSTER oder für Ihre Steuerberatung.",
  "PDF sa nepodarilo vytvoriť.": "Das PDF konnte nicht erstellt werden.",
  štvrťrok: "Quartal",
  "Kleinunternehmer UStVA nepodáva": "Kleinunternehmer geben keine UStVA ab",
  "Firma je vedená ako Kleinunternehmer podľa § 19 UStG — faktúry vystavuje bez dane, daň neodvádza a odpočet nemá, takže mesačné ani štvrťročné priznanie (UStVA) sa nepodáva. Výnimkou je daň, ktorú dlhuje ako príjemca (§ 13b, napr. služba od podnikateľa z EÚ) — tú priznáva aj Kleinunternehmer, prehľad ju zatiaľ nepočíta. Ak obrat v predchádzajúcom roku prekročil 25 000 € alebo v bežnom roku prekročí 100 000 €, režim končí — zmeňte ho v Nastaveniach firmy.":
    "Das Unternehmen ist als Kleinunternehmer nach § 19 UStG geführt — Rechnungen ohne Umsatzsteuer, keine Steuerabführung und kein Vorsteuerabzug, daher keine monatliche oder vierteljährliche Voranmeldung (UStVA). Ausnahme ist Steuer, die Sie als Leistungsempfänger schulden (§ 13b, z. B. Leistung eines Unternehmers aus der EU) — diese meldet auch ein Kleinunternehmer an; die Übersicht berechnet sie noch nicht. Lag der Umsatz im Vorjahr über 25.000 € oder übersteigt er im laufenden Jahr 100.000 €, endet die Regelung — ändern Sie sie in den Unternehmenseinstellungen.",
  "V období je {vystavene} vystavených faktúr, {prijate} prijatých a {doklady} dokladov s DPH.":
    "Im Zeitraum gibt es {vystavene} Ausgangsrechnungen, {prijate} Eingangsrechnungen und {doklady} Belege mit Umsatzsteuer.",
  "Pred podaním skontrolujte ({n})": "Vor der Abgabe prüfen ({n})",
  "Pred podaním skontrolujte": "Vor der Abgabe prüfen",
  "Prehľad UStVA": "UStVA-Übersicht",
  "Základy dane v celých eurách, daň a odpočet na centy · {obdobie}":
    "Bemessungsgrundlagen in vollen Euro, Steuer und Vorsteuer auf den Cent · {obdobie}",
  "Nadmerný odpočet — finančný úrad vráti": "Überschuss — wird vom Finanzamt erstattet",
  "Na úhradu do 10. dňa po skončení obdobia": "Zahlbar bis zum 10. Tag nach Ablauf des Zeitraums",
  "Odpočet dane spolu": "Vorsteuer gesamt",
  "Daň spolu": "Umsatzsteuer gesamt",
  "KZ 39 — Sondervorauszahlung (zvyčajne v decembri)":
    "KZ 39 — Sondervorauszahlung (in der Regel im Dezember)",
  "KZ 48 — oslobodené plnenia bez nároku na odpočet":
    "KZ 48 — steuerfreie Umsätze ohne Vorsteuerabzug",
  "KZ 64 — oprava odpočtu podľa § 15a": "KZ 64 — Berichtigung des Vorsteuerabzugs (§ 15a UStG)",
  "KZ 69 — daň nesprávne uvedená na faktúre":
    "KZ 69 — in Rechnungen unrichtig oder unberechtigt ausgewiesene Steuer",
  "Prehľad sa podáva cez ELSTER (Mein ELSTER alebo program poradcu) do 10. dňa po skončení obdobia, pri Dauerfristverlängerung o mesiac neskôr. Predaj cez OSS sa sem nepočíta — podáva sa v samostatnom priznaní OSS.":
    "Die Voranmeldung wird über ELSTER (Mein ELSTER oder die Software der Steuerberatung) bis zum 10. Tag nach Ablauf des Zeitraums übermittelt, bei Dauerfristverlängerung einen Monat später. Umsätze über OSS gehören nicht hierher — sie werden in der gesonderten OSS-Erklärung gemeldet.",
  "Prehľad zostavený z dokladov vo Fakteri. Podáva sa cez ELSTER; základy dane sú v celých eurách, daň na centy.":
    "Übersicht aus den Belegen in Faktero. Abgabe über ELSTER; Bemessungsgrundlagen in vollen Euro, Steuer auf den Cent.",

  // UStVA — Kennzahlen (oficiálne nemecké znenie)
  "Zdaniteľné plnenia 19 %": "Steuerpflichtige Umsätze zum Steuersatz von 19 %",
  "Zdaniteľné plnenia 7 %": "Steuerpflichtige Umsätze zum Steuersatz von 7 %",
  "Plnenia s inou sadzbou": "Umsätze zu anderen Steuersätzen",
  "Dodanie tovaru do EÚ odberateľom s IČ DPH":
    "Innergemeinschaftliche Lieferungen an Abnehmer mit USt-IdNr.",
  "Trojstranný obchod — dodanie prvým odberateľom (§ 25b)":
    "Lieferungen des ersten Abnehmers bei innergemeinschaftlichen Dreiecksgeschäften (§ 25b Abs. 2 UStG)",
  "Ďalšie oslobodené plnenia s nárokom na odpočet (vývoz)":
    "Weitere steuerfreie Umsätze mit Vorsteuerabzug (z. B. Ausfuhrlieferungen)",
  "Oslobodené plnenia bez nároku na odpočet": "Steuerfreie Umsätze ohne Vorsteuerabzug",
  "Služby do EÚ s miestom plnenia v inom štáte (§ 18b)":
    "Nicht steuerbare sonstige Leistungen gem. § 18b Satz 1 Nr. 2 UStG",
  "Ostatné plnenia mimo tuzemska": "Übrige nicht steuerbare Umsätze (Leistungsort nicht im Inland)",
  "Plnenia, pri ktorých daň platí odberateľ (§ 13b)":
    "Umsätze, für die der Leistungsempfänger die Steuer nach § 13b Abs. 5 UStG schuldet",
  "Nadobudnutie tovaru z EÚ 19 %": "Innergemeinschaftliche Erwerbe zum Steuersatz von 19 %",
  "Nadobudnutie tovaru z EÚ 7 %": "Innergemeinschaftliche Erwerbe zum Steuersatz von 7 %",
  "Nadobudnutie tovaru z EÚ s inou sadzbou":
    "Innergemeinschaftliche Erwerbe zu anderen Steuersätzen",
  "Služby od podnikateľa z EÚ (§ 13b ods. 1)":
    "Sonstige Leistungen eines im übrigen Gemeinschaftsgebiet ansässigen Unternehmers (§ 13b Abs. 1 UStG)",
  "Ostatné plnenia v prenesení (§ 13b ods. 2)":
    "Andere Leistungen (§ 13b Abs. 2 Nr. 1, 2, 4 bis 12 UStG)",
  "Daň nesprávne uvedená na faktúre":
    "In Rechnungen unrichtig oder unberechtigt ausgewiesene Steuerbeträge",
  "Odpočet dane z faktúr iných podnikateľov":
    "Vorsteuerbeträge aus Rechnungen von anderen Unternehmern",
  "Odpočet dane z nadobudnutia tovaru z EÚ":
    "Vorsteuerbeträge aus dem innergemeinschaftlichen Erwerb von Gegenständen",
  "Odpočet zaplatenej dovoznej DPH": "Entstandene Einfuhrumsatzsteuer",
  "Odpočet dane z plnení podľa § 13b": "Vorsteuerbeträge aus Leistungen im Sinne des § 13b UStG",
  "Oprava odpočtu (§ 15a)": "Berichtigung des Vorsteuerabzugs (§ 15a UStG)",
  "Odpočet mimoriadnej zálohy (Sondervorauszahlung)":
    "Abzug der festgesetzten Sondervorauszahlung für Dauerfristverlängerung",
  "Zostávajúca záloha na DPH / nadmerný odpočet":
    "Verbleibende Umsatzsteuer-Vorauszahlung bzw. verbleibender Überschuss",
  "ustva::Plnenia": "Lieferungen und sonstige Leistungen",
  "ustva::Oslobodené plnenia": "Steuerfreie Umsätze",
  "ustva::Nezdaniteľné plnenia": "Nicht steuerbare Umsätze",
  "ustva::Nadobudnutie z EÚ": "Innergemeinschaftliche Erwerbe",
  "ustva::Daň platí príjemca": "Leistungsempfänger als Steuerschuldner",
  "ustva::Odpočet dane": "Abziehbare Vorsteuerbeträge",
  "ustva::Výsledok": "Ergebnis",

  // UStVA — výhrady
  "Dodanie do EÚ bez platného IČ DPH odberateľa z iného štátu EÚ — oslobodenie (KZ 41/21) ho vyžaduje.":
    "Lieferung in die EU ohne gültige USt-IdNr. des Abnehmers aus einem anderen EU-Staat — die Steuerbefreiung (KZ 41/21) setzt sie voraus.",
  "Plnenie s nulovou sadzbou bez prenesenia — ak je oslobodené, doplňte ho ručne do KZ 43 alebo 48.":
    "Umsatz mit 0 % ohne Steuerschuldumkehr — falls steuerfrei, bitte manuell in KZ 43 oder 48 eintragen.",
};
