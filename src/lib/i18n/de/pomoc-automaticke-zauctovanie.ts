// Preklad manuálu v Pomoci (src/routes/pomoc.automaticke-zauctovanie.tsx). Kľúče vyrába pomoc-preklad.test.tsx.
export default {
  "Autopilot, ktorý doklady zaúčtuje sám — a vie, kedy sa má zastaviť.":
    "Ein Autopilot, der Belege selbst kontiert — und weiß, wann er anhalten muss.",
  "Každý nový doklad — prijatá faktúra, bloček aj vystavená faktúra — dostane do minúty návrh zaúčtovania: <0>predkontáciu, členenie DPH, riadok kontrolného výkazu</0>, prípadne stredisko a činnosť. Nezáleží na tom, či prišiel e-mailom, zo skenera, z importu alebo ste ho napísali ručne.":
    "Jeder neue Beleg — Eingangsrechnung, Kassenbon und Ausgangsrechnung — erhält innerhalb einer Minute einen Kontierungsvorschlag: <0>Vorkontierung, USt-Gliederung, Zeile des Kontrollberichts</0>, gegebenenfalls Kostenstelle und Tätigkeit. Es spielt keine Rolle, ob er per E-Mail, vom Scanner, aus einem Import kam oder von Ihnen von Hand erfasst wurde.",
  "Predkontácia sa hľadá v tomto poradí — prvý zdroj, ktorý zaberie, vyhráva:":
    "Die Vorkontierung wird in dieser Reihenfolge gesucht — die erste Quelle, die greift, gewinnt:",
  "<0>Zvyk partnera</0> — keď ste aspoň tri z posledných desiatich dokladov od toho istého partnera zaúčtovali väčšinou rovnako. Istota je podiel zhody (najviac 98 %).":
    "<0>Gewohnheit beim Partner</0> — wenn Sie mindestens drei der letzten zehn Belege desselben Partners überwiegend gleich kontiert haben. Die Sicherheit ist der Anteil der Übereinstimmung (höchstens 98 %).",
  "<0>AI</0> (prijaté faktúry a bločky) — vyberá výhradne z vašich predkontácií a povie, prečo. Kód, ktorý vo vašom číselníku nie je, sa zahodí.":
    "<0>KI</0> (Eingangsrechnungen und Kassenbons) — wählt ausschließlich aus Ihren Vorkontierungen und sagt, warum. Ein Code, der nicht in Ihrem Verzeichnis steht, wird verworfen.",
  "<0>Členenie DPH a kontrolný výkaz sa AI nepýta nikdy.</0> Odvodia sa z režimu dane na doklade: tuzemsko s odpočtom (PD, B.2), bloček (B.3), bez nároku na odpočet (PN), prenesenie daňovej povinnosti, nadobudnutie tovaru a služby z EÚ (B.1), opravný doklad (C.2), osobitná úprava či firma, ktorá nie je platiteľ DPH.":
    "<0>Die USt-Gliederung und den Kontrollbericht fragt die KI nie.</0> Sie werden aus dem Steuerregime des Belegs abgeleitet: Inland mit Vorsteuerabzug (PD, B.2), Kassenbon (B.3), ohne Vorsteuerabzug (PN), Reverse Charge, innergemeinschaftlicher Erwerb und Leistungen aus der EU (B.1), Korrekturbeleg (C.2), Sonderregelung oder ein Unternehmen, das nicht umsatzsteuerpflichtig ist.",
  "Režimy autopilota": "Autopilot-Modi",
  "<0>Vypnutý</0> — Faktero samo nič nenavrhuje; návrh si vyžiadate na doklade.":
    "<0>Aus</0> — Faktero schlägt selbst nichts vor; den Vorschlag fordern Sie am Beleg an.",
  "<0>Bezpečný</0> (predvolený) — samo zaúčtuje doklady, ktoré sedia na pravidlo alebo na ustálený zvyk s istotou aspoň 95 %. Návrhy od AI čakajú na vás.":
    "<0>Sicher</0> (Standard) — kontiert selbst Belege, die zu einer Regel oder einer festen Gewohnheit mit einer Sicherheit von mindestens 95 % passen. KI-Vorschläge warten auf Sie.",
  "<0>Plný</0> — navyše zaúčtuje aj návrhy od AI s istotou aspoň 90 %.":
    "<0>Voll</0> — kontiert zusätzlich KI-Vorschläge mit einer Sicherheit von mindestens 90 %.",
  "Režim a limit sumy nastaví majiteľ alebo admin firmy na stránke <0>Zaúčtovanie na kontrolu</0> alebo pri pravidlách účtovania. Po zapnutí sa týka len nových dokladov — staré sa samé nezaúčtujú.":
    "Modus und Betragslimit stellt der Inhaber oder Admin des Unternehmens auf der Seite <0>Kontierung zur Prüfung</0> oder bei den Kontierungsregeln ein. Nach dem Einschalten betrifft es nur neue Belege — alte werden nicht von selbst kontiert.",
  "Kedy doklad čaká na vás": "Wann ein Beleg auf Sie wartet",
  "Doklad sa nezaúčtuje sám nikdy, keď:": "Ein Beleg wird nie von selbst kontiert, wenn:",
  "súčet položiek alebo základ s DPH nesedí so sumou dokladu,":
    "die Summe der Positionen oder Netto plus USt nicht mit dem Belegbetrag übereinstimmt,",
  "ide o prenesenie či plnenie z EÚ a IČ DPH partnera nemá platné overenie vo VIES,":
    "es sich um Reverse Charge oder eine EU-Leistung handelt und die USt-IdNr. des Partners keine gültige Prüfung in VIES hat,",
  "suma je nad limitom firmy (predvolene 5 000 €),":
    "der Betrag über dem Limit des Unternehmens liegt (standardmäßig 5 000 €),",
  "je to prvý doklad od tohto partnera,": "es der erste Beleg von diesem Partner ist,",
  "chýba predkontácia alebo sa nedá určiť členenie DPH,":
    "die Vorkontierung fehlt oder die USt-Gliederung nicht bestimmt werden kann,",
  "je odovzdaný do účtovníctva alebo zamknutý — taký sa vôbec nemení.":
    "er an die Buchhaltung übergeben oder gesperrt ist — ein solcher wird gar nicht geändert.",
  "Ručne zaúčtovaný doklad automat nikdy neprepíše. Hodnoty, ktoré na doklade už sú, majú vždy prednosť pred návrhom.":
    "Einen manuell kontierten Beleg überschreibt der Automat nie. Werte, die bereits am Beleg stehen, haben immer Vorrang vor dem Vorschlag.",
  "Stránka Na kontrolu": "Die Seite Zur Prüfung",
  "V <0>Účtovníctvo → Zaúčtovanie na kontrolu</0> sú všetky nezaúčtované doklady s návrhom, zdrojom a dôvodom, prečo čakajú. Filtrujete podľa druhu, blokátora a zdroja, vyberiete a potvrdíte návrhy naraz.":
    "Unter <0>Buchhaltung → Kontierung zur Prüfung</0> stehen alle nicht kontierten Belege mit Vorschlag, Quelle und dem Grund, warum sie warten. Sie filtern nach Art, Hindernis und Quelle, wählen aus und bestätigen die Vorschläge auf einmal.",
  "Tlačidlo <0>Navrhnúť zaúčtovanie pre nezaúčtované</0> pripraví návrhy aj pre doklady spred zapnutia — nič pritom nezaúčtuje.":
    "Die Schaltfläche <0>Kontierung für nicht kontierte vorschlagen</0> bereitet Vorschläge auch für Belege von vor dem Einschalten vor — kontiert dabei nichts.",
  "Na detaile dokladu": "Am Beleg",
  "Automaticky zaúčtovaný doklad má štítok <0>Zaúčtované automaticky · pravidlo X / zvyk 98 % / AI 91 %</0> so zdôvodnením. Tlačidlom <1>Zmeniť</1> zaúčtovanie zrušíte, kódy upravíte a zaúčtujete znova. Nezaúčtovaný doklad ukáže návrh s blokátormi a tlačidlo Potvrdiť návrh.":
    "Ein automatisch kontierter Beleg trägt das Etikett <0>Automatisch kontiert · Regel X / Gewohnheit 98 % / KI 91 %</0> mit Begründung. Mit <1>Ändern</1> heben Sie die Kontierung auf, passen die Codes an und kontieren erneut. Ein nicht kontierter Beleg zeigt den Vorschlag mit Hindernissen und die Schaltfläche Vorschlag bestätigen.",
  "Keď rovnakú opravu u toho istého partnera urobíte druhýkrát, Faktero ponúkne <0>vytvoriť pravidlo</0> s predvyplnenými podmienkami. Každá oprava sa zapíše do histórie dokladu.":
    "Wenn Sie dieselbe Korrektur beim selben Partner zum zweiten Mal vornehmen, bietet Faktero an, <0>eine Regel anzulegen</0> — mit vorausgefüllten Bedingungen. Jede Korrektur wird in der Belegchronik festgehalten.",
  "Bankové pohyby": "Bankbewegungen",
  "<0>Pravidlo účtovania</0> (istota 100 %) — podľa partnera, textu, spôsobu úhrady, predmetu či odosielateľa e-mailu, krajiny, variabilného symbolu alebo typu dokladu. Pravidlá spravujete v <1>Účtovníctvo → Pravidlá účtovania</1>.":
    "<0>Buchungsregel</0> (Sicherheit 100 %) — nach Partner, Text, Zahlungsart, Betreff oder Absender der E-Mail, Land, variablem Symbol oder Belegtyp. Regeln verwalten Sie unter <1>Buchhaltung → Buchungsregeln</1>.",
  "Pohyby sa zaúčtujú pri vývoze výpisu do Pohody: pravidlo pre banku (účet, smer, protistrana) má prednosť, spárovaný pohyb dostane predvolenú predkontáciu pre banku. Pri nespárovaných pohyboch sa AI nepýta. Pravidlo pre banku s výsledkom <0>Spárované bez dokladu</0> (poplatky, mzdy, odvody) vybaví pohyb hneď, ako príde z banky alebo z nahratého výpisu — pozri <1>Banka</1>.":
    "Bankbewegungen werden beim Export des Kontoauszugs nach Pohoda gebucht: Die Bankregel (Konto, Richtung, Gegenpartei) hat Vorrang, eine zugeordnete Bewegung erhält die Standard-Vorkontierung für die Bank. Bei nicht zugeordneten Bewegungen wird die KI nicht gefragt. Eine Bankregel mit dem Ergebnis <0>Ohne Beleg zugeordnet</0> (Gebühren, Löhne, Abgaben) erledigt die Bewegung sofort, wenn sie von der Bank oder aus einem hochgeladenen Kontoauszug kommt — siehe <1>Bank</1>.",
};
