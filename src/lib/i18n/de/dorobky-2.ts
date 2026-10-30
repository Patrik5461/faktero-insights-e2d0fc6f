// Dorobky 2 (30. 10. 2026): daňový režim podľa odberateľa, výkazy, storno dokladu k platbe, zvonček, vrátenie z iného programu, Excel, prístupnosť.
export default {
  // Daňový režim podľa odberateľa (faktúra do EÚ a mimo EÚ) — formulár faktúry a API.
  "Odberateľ mimo EÚ — vývoz tovaru alebo služba mimo EÚ":
    "Kunde außerhalb der EU — Ausfuhr von Waren oder Leistung außerhalb der EU",
  "Vývoz tovaru (oslobodené podľa § 47)": "Ausfuhr von Waren (steuerfrei)",
  "Služba mimo EÚ (miesto dodania podľa § 15 ods. 1)":
    "Leistung außerhalb der EU (Leistungsort beim Kunden)",
  "Vývoz tovaru ide do priznania (r. 13 a 15), služba s miestom dodania mimo EÚ do priznania nepatrí.":
    "Die Ausfuhr von Waren gehört in die Voranmeldung, eine Leistung mit Leistungsort außerhalb der EU wird als nicht steuerbar gemeldet.",
  "Odberateľ z krajiny {krajina} nemá IČ DPH — ako spotrebiteľovi mu fakturujete s DPH. Ak ste za rok prekročili 10 000 € predaja spotrebiteľom v celej EÚ alebo ste prihlásený do OSS, zapnite Predaj spotrebiteľovi v EÚ (OSS). Ak ide o firmu, doplňte jej IČ DPH v karte odberateľa.":
    "Der Kunde aus {krajina} hat keine USt-IdNr. — als Verbraucher stellen Sie ihm USt. in Rechnung. Wenn Sie im Jahr 10 000 € Verkäufe an Verbraucher in der gesamten EU überschritten haben oder für OSS registriert sind, aktivieren Sie „Verkauf an Verbraucher in der EU (OSS)“. Ist es ein Unternehmen, ergänzen Sie seine USt-IdNr. in der Kundenkarte.",
  "Odberateľ má IČ DPH iného štátu EÚ ({ic}), faktúra však nie je nastavená ako dodanie do EÚ. Firme z EÚ sa DPH zvyčajne neúčtuje — tovar je oslobodený podľa § 43, pri službe daň prizná odberateľ.":
    "Der Kunde hat eine USt-IdNr. eines anderen EU-Staates ({ic}), die Rechnung ist aber nicht als Lieferung in die EU eingestellt. Einem Unternehmen aus der EU wird in der Regel keine USt. berechnet — Waren sind steuerfrei, bei Leistungen schuldet der Kunde die Steuer.",
  "Odberateľ je mimo EÚ ({krajina}), faktúra však nie je nastavená ako vývoz ani služba mimo EÚ. DPH sa mu zvyčajne neúčtuje.":
    "Der Kunde sitzt außerhalb der EU ({krajina}), die Rechnung ist aber weder als Ausfuhr noch als Leistung außerhalb der EU eingestellt. USt. wird ihm in der Regel nicht berechnet.",
  "Nastaviť dodanie do EÚ": "Lieferung in die EU einstellen",
  "Nastaviť plnenie mimo EÚ": "Leistung außerhalb der EU einstellen",
  "Odberateľ má IČ DPH iného štátu EÚ ({ic}) — faktúra je bez DPH: služba s miestom dodania u odberateľa (§ 15 ods. 1), daň prizná odberateľ (prenesenie daňovej povinnosti). Veta o tom sa vytlačí na faktúru.":
    "Der Kunde hat eine USt-IdNr. eines anderen EU-Staates ({ic}) — die Rechnung ist ohne USt.: Leistung mit Leistungsort beim Kunden, die Steuer schuldet der Kunde (Reverse-Charge). Der Hinweis wird auf die Rechnung gedruckt.",
  "Odberateľ má IČ DPH iného štátu EÚ ({ic}) — faktúra je bez DPH ako trojstranný obchod.":
    "Der Kunde hat eine USt-IdNr. eines anderen EU-Staates ({ic}) — die Rechnung ist ohne USt. als Dreiecksgeschäft.",
  "Odberateľ má IČ DPH iného štátu EÚ ({ic}) — faktúra je bez DPH: dodanie tovaru do iného členského štátu oslobodené podľa § 43. Veta o tom sa vytlačí na faktúru.":
    "Der Kunde hat eine USt-IdNr. eines anderen EU-Staates ({ic}) — die Rechnung ist ohne USt.: steuerfreie innergemeinschaftliche Lieferung. Der Hinweis wird auf die Rechnung gedruckt.",
  "Odberateľ je mimo EÚ ({krajina}) — faktúra je bez DPH: služba s miestom dodania mimo EÚ (§ 15 ods. 1). Veta o tom sa vytlačí na faktúru.":
    "Der Kunde sitzt außerhalb der EU ({krajina}) — die Rechnung ist ohne USt.: Leistung mit Leistungsort außerhalb der EU. Der Hinweis wird auf die Rechnung gedruckt.",
  "Odberateľ je mimo EÚ ({krajina}) — faktúra je bez DPH: vývoz tovaru oslobodený podľa § 47. Doklad o vývoze (colné vyhlásenie) si odložte.":
    "Der Kunde sitzt außerhalb der EU ({krajina}) — die Rechnung ist ohne USt.: steuerfreie Ausfuhr. Bewahren Sie den Ausfuhrnachweis (Zollanmeldung) auf.",
  "Z položiek nevieme, či ide o tovar — navrhli sme službu. Ak dodávate tovar, zmeňte druh plnenia nižšie.":
    "Aus den Positionen ist nicht erkennbar, ob es Waren sind — wir haben eine Leistung vorgeschlagen. Wenn Sie Waren liefern, ändern Sie die Art der Leistung unten.",
  'Daňový režim: bez poľa reverse_charge ho Faktero určí podľa odberateľa. Firma s IČ DPH iného štátu EÚ dostane faktúru bez DPH ako dodanie do EÚ (reverse_charge_type "eu_b2b"), odberateľ mimo EÚ ako vývoz ("export"); tovar alebo službu povie eu_plnenie ("tovar", "sluzba"; predvolene tovar). Ak niektorá položka nesie nenulovú sadzbu DPH, režim sa nemení — počíta sa s tým, že DPH ste účtovali zámerne. Režim nastavíte aj sami: "reverse_charge": true s reverse_charge_type ("domestic_69", "eu_b2b", "export"), alebo "reverse_charge": false pre tuzemskú DPH.':
    'Steuerregime: Ohne das Feld reverse_charge bestimmt es Faktero nach dem Kunden. Ein Unternehmen mit USt-IdNr. eines anderen EU-Staates erhält eine Rechnung ohne USt. als Lieferung in die EU (reverse_charge_type "eu_b2b"), ein Kunde außerhalb der EU als Ausfuhr ("export"); Ware oder Leistung gibt eu_plnenie an ("tovar", "sluzba"; Standard: Ware). Trägt eine Position einen USt.-Satz ungleich null, bleibt das Regime unverändert — es wird angenommen, dass Sie die USt. bewusst berechnet haben. Sie können das Regime auch selbst setzen: "reverse_charge": true mit reverse_charge_type ("domestic_69", "eu_b2b", "export") oder "reverse_charge": false für die inländische USt.',
  // Vorsteuer ohne USt-IdNr. des Lieferanten (DPH-Meldungen) und Storno des Steuerbelegs zur Zahlung (POHODA).
  "Chýba IČ DPH dodávateľa — bez neho sa DPH odpočítať nedá, faktúra preto nie je v odpočte priznania (r. 18–21) ani v časti B.2. Doplňte IČ DPH dodávateľa na faktúre.":
    "Die USt-IdNr. des Lieferanten fehlt — ohne sie ist kein Vorsteuerabzug möglich, daher ist die Rechnung weder im Vorsteuerabzug der Erklärung (Z. 18–21) noch in Teil B.2 enthalten. Ergänzen Sie die USt-IdNr. des Lieferanten auf der Rechnung.",
  "Doklad označený pre B.2 nemá číslo alebo IČ DPH dodávateľa — nie je v odpočte priznania ani v kontrolnom výkaze. Doplňte ich, alebo doklad preraďte do B.3 (zjednodušená faktúra).":
    "Der für B.2 markierte Beleg hat keine Nummer oder keine USt-IdNr. des Lieferanten — er ist weder im Vorsteuerabzug der Erklärung noch in der Kontrollmeldung enthalten. Ergänzen Sie sie oder ordnen Sie den Beleg B.3 (vereinfachte Rechnung) zu.",
  "Daňový doklad k platbe {cislo} je už v Pohode ako interný doklad. Interný doklad sa cez XML stornovať nedá, preto storno do Pohody nepošleme. Po stornovaní tu ho zrušte aj v Pohode: Účtovníctvo → Interné doklady, nájdite doklad {cislo} a zvoľte Záznam → Storno. Stornovať doklad vo Fakteri?":
    "Der Steuerbeleg zur Zahlung {cislo} ist in POHODA bereits als interner Beleg erfasst. Ein interner Beleg lässt sich per XML nicht stornieren, daher senden wir kein Storno an POHODA. Stornieren Sie ihn nach dem Storno hier auch in POHODA: Účtovníctvo → Interné doklady, Beleg {cislo} suchen und Záznam → Storno wählen. Beleg in Faktero stornieren?",
  // Glocke (notifications.ts) und Zurückholen von Belegen aus anderen Programmen als Pohoda (stav-odovzdania.ts).
  "{termin} {vozidlo}: platnosť skončila": "{termin} {vozidlo}: abgelaufen",
  "{termin} {vozidlo}: platnosť končí dnes": "{termin} {vozidlo}: läuft heute ab",
  "{termin} {vozidlo}: platnosť končí o 1 deň": "{termin} {vozidlo}: läuft in 1 Tag ab",
  "{termin} {vozidlo}: platnosť končí o {dni} dni": "{termin} {vozidlo}: läuft in {dni} Tagen ab",
  "{termin} {vozidlo}: platnosť končí o {dni} dní": "{termin} {vozidlo}: läuft in {dni} Tagen ab",
  "{nazov} · platnosť do {datum}": "{nazov} · gültig bis {datum}",
  "platnosť do {datum}": "gültig bis {datum}",
  "zvoncek::vozidla": "des Fahrzeugs",
  "Z účtu {ucet} sa nesťahujú pohyby": "Vom Konto {ucet} werden keine Umsätze abgerufen",
  "Z účtu sa nesťahujú pohyby": "Vom Konto werden keine Umsätze abgerufen",
  "naposledy {naposledy} · {chyba}": "zuletzt {naposledy} · {chyba}",
  "Súhlas banky na čítanie pohybov vypršal — obnovte ho (Obnoviť súhlas).":
    "Die Zustimmung der Bank zum Abruf der Umsätze ist abgelaufen — erneuern Sie sie (Zustimmung erneuern).",
  "Súhlas s prístupom k účtu už neplatí — obnovte ho (Obnoviť súhlas).":
    "Die Zustimmung zum Kontozugriff gilt nicht mehr — erneuern Sie sie (Zustimmung erneuern).",
  "Banka odmietla prístup k pohybom (401) — ak to trvá, obnovte súhlas.":
    "Die Bank hat den Zugriff auf die Umsätze abgelehnt (401) — wenn es anhält, erneuern Sie die Zustimmung.",
  "Banka je dočasne nedostupná — pohyby sa skúsia stiahnuť znova.":
    "Die Bank ist vorübergehend nicht erreichbar — die Umsätze werden erneut abgerufen.",
  "Pohyby sa nepodarilo stiahnuť.": "Die Umsätze konnten nicht abgerufen werden.",
  "{prijemca} · {dovod}": "{prijemca} · {dovod}",
  "Neznámy príjemca · {dovod}": "Unbekannter Empfänger · {dovod}",
  "nesprávne číslo účtu": "falsche Kontonummer",
  "účet je zrušený": "das Konto ist aufgelöst",
  "účet je zablokovaný": "das Konto ist gesperrt",
  "na účte nie je táto platba povolená": "diese Zahlung ist auf dem Konto nicht zulässig",
  "suma prekračuje povolený limit": "der Betrag überschreitet das zulässige Limit",
  "nedostatok prostriedkov na účte": "keine ausreichende Deckung auf dem Konto",
  "duplicitná platba": "doppelte Zahlung",
  "neznámy príkazca": "unbekannter Auftraggeber",
  "neplatný formát platby": "ungültiges Zahlungsformat",
  "dôvod neuviedol klient": "kein Grund vom Kunden angegeben",
  "dôvod neuviedla banka": "kein Grund von der Bank angegeben",
  "nesprávny kód banky (BIC)": "falscher Bankcode (BIC)",
  "chýbajú údaje vyžadované predpismi": "gesetzlich vorgeschriebene Angaben fehlen",
  "zrušené na žiadosť klienta": "auf Wunsch des Kunden storniert",
  "podozrenie na podvod": "Betrugsverdacht",
  "banka platbu zamietla": "die Bank hat die Zahlung abgelehnt",
  "odoslanie zlyhalo": "Senden fehlgeschlagen",
  "platnosť karty vypršala": "die Karte ist abgelaufen",
  "platba vypršala": "die Zahlung ist abgelaufen",
  "banka neodpovedala včas": "die Bank hat nicht rechtzeitig geantwortet",
  "platba bola zrušená": "die Zahlung wurde storniert",
  "platba bola vrátená": "die Zahlung wurde erstattet",
  "overenie platby (3-D Secure) zlyhalo": "die Zahlungsbestätigung (3-D Secure) ist fehlgeschlagen",
  "neznámy stav": "unbekannter Status",
  "Zmeškaná lehota: {druh}": "Frist versäumt: {druh}",
  "Blíži sa lehota: {druh}": "Frist läuft bald ab: {druh}",
  "{odosielatel} · {predmet} · lehota {datum}": "{odosielatel} · {predmet} · Frist {datum}",
  "{odosielatel} · lehota {datum}": "{odosielatel} · Frist {datum}",
  "{predmet} · lehota {datum}": "{predmet} · Frist {datum}",
  "lehota {datum}": "Frist {datum}",
  "{odberatel} ponuku prijal — dá sa premeniť na faktúru.":
    "{odberatel} hat das Angebot angenommen — es kann in eine Rechnung umgewandelt werden.",
  "Odberateľ ponuku prijal — dá sa premeniť na faktúru.":
    "Der Kunde hat das Angebot angenommen — es kann in eine Rechnung umgewandelt werden.",
  "{odberatel}: {poznamka}": "{odberatel}: {poznamka}",
  "Odberateľ: {poznamka}": "Kunde: {poznamka}",
  "{odberatel} ponuku zamietol.": "{odberatel} hat das Angebot abgelehnt.",
  "Odberateľ ponuku zamietol.": "Der Kunde hat das Angebot abgelehnt.",
  // Vrátenie dokladu z iného programu než Pohoda (stav-odovzdania.ts).
  "Vrátené z účtovníctva ({program}) — opravte doklad a odovzdajte ho znova":
    "Aus der Buchhaltung ({program}) zurückgeholt — korrigieren Sie den Beleg und übergeben Sie ihn erneut",
  "Poslať opravu do účtovníctva ({program})": "Korrektur an die Buchhaltung ({program}) senden",
  "Faktúra sa vráti z účtovníctva ({program}), aby sa dala opraviť a odovzdať znova":
    "Die Rechnung wird aus der Buchhaltung ({program}) zurückgeholt, damit sie korrigiert und erneut übergeben werden kann",
  "Doklad je odovzdaný do účtovníctva ({program}) — zmeny sa tam už neprenesú.":
    "Der Beleg wurde an die Buchhaltung ({program}) übergeben — Änderungen werden dort nicht mehr übernommen.",
  // Export der Firmendaten (Papierkorb im Paket), Link „Zum Inhalt springen“.
  "Preskočiť na obsah": "Zum Inhalt springen",
  "Doklady a karty z koša balík nevynechá — sú v samostatnom priečinku „kos“ a do hlavných súborov sa nezapočítavajú. Zmazaná faktúra mohla byť už vystavená a zaúčtovaná, preto ju archivujte rovnako ako ostatné doklady.":
    "Belege und Karten aus dem Papierkorb lässt das Paket nicht aus — sie liegen im eigenen Ordner „kos“ und werden in den Hauptdateien nicht mitgezählt. Eine gelöschte Rechnung kann bereits ausgestellt und gebucht worden sein, archivieren Sie sie daher wie alle anderen Belege.",
  "kôš — faktúry": "Papierkorb — Rechnungen",
  "kôš — položky faktúr": "Papierkorb — Rechnungspositionen",
  "kôš — prijaté faktúry": "Papierkorb — Eingangsrechnungen",
  "kôš — doklady": "Papierkorb — Belege",
  "kôš — iné doklady": "Papierkorb — sonstige Belege",
  "kôš — odberatelia": "Papierkorb — Kunden",
  "kôš — produkty": "Papierkorb — Produkte",
  "kôš — pokladňa": "Papierkorb — Kasse",
  "kôš — banka": "Papierkorb — Bank",
  "kôš — jazdy": "Papierkorb — Fahrten",
  "kôš — zákazky": "Papierkorb — Aufträge",
};
