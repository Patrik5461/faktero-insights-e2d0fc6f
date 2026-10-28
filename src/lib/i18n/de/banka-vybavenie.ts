// Detail einer Bankbewegung, „ohne Beleg erledigt“, Transaktionssteuer und Bankregeln.
export default {
  "Pohyb sa nepodarilo načítať.": "Die Bewegung konnte nicht geladen werden.",
  "Pohyb je označený ako transakčná daň.": "Die Bewegung ist als Transaktionssteuer markiert.",
  "Pohyb je označený ako spárovaný bez dokladu.":
    "Die Bewegung ist als ohne Beleg zugeordnet markiert.",
  "Označenie zrušené, pohyb je znovu medzi nespárovanými.":
    "Markierung aufgehoben, die Bewegung ist wieder unter den nicht zugeordneten.",
  "Zrušiť párovanie pohybu s dokladom {cislo}?":
    "Zuordnung der Bewegung zum Beleg {cislo} aufheben?",
  "Odpárovať od pohybu všetky doklady ({n})?": "Alle Belege ({n}) von der Bewegung trennen?",
  Odpárovať: "Zuordnung aufheben",
  "Nepodarilo sa odpárovať: {doklady}": "Zuordnung konnte nicht aufgehoben werden: {doklady}",
  "Detail pohybu": "Details der Bewegung",
  "IBAN protistrany": "IBAN der Gegenseite",
  "Typ platby": "Zahlungsart",
  "Spárovaný pohyb": "Zugeordnete Bewegung",
  "Nespárovaný pohyb": "Nicht zugeordnete Bewegung",
  "Spolu {spolu} z {z}": "Insgesamt {spolu} von {z}",
  "Odpárovať všetky doklady": "Alle Belege trennen",
  "Označené pravidlom „{nazov}“.": "Durch die Regel „{nazov}“ markiert.",
  "Označené ručne.": "Manuell markiert.",
  "Označené automaticky podľa popisu banky.": "Automatisch anhand der Bankbeschreibung markiert.",
  "Vo výpise do Pohody dostane predkontáciu pre transakčnú daň.":
    "Im Kontoauszug für Pohoda erhält sie die Vorkontierung für die Transaktionssteuer.",
  "Zrušiť označenie": "Markierung aufheben",
  "napr. mzda 10/2026": "z. B. Lohn 10/2026",
  "Pohyb nemá doklad": "Bewegung hat keinen Beleg",
  "Označiť ako transakčná daň": "Als Transaktionssteuer markieren",
  "Vytvoriť pravidlo z tohto pohybu": "Regel aus dieser Bewegung erstellen",
  "Bez dokladu": "Ohne Beleg",
  "Spárované bez dokladu": "Ohne Beleg zugeordnet",
  "Transakčná daň": "Transaktionssteuer",
  Párovanie: "Zuordnung",
  spárované: "zugeordnet",
  detail: "Details",
  "Za vybavené bez dokladu sa označilo {n} starších pohybov.":
    "{n} ältere Bewegungen wurden als ohne Beleg erledigt markiert.",
  Ktorýkoľvek: "Beliebig",
  Nedefinované: "Nicht festgelegt",
  "Pohyb sa pri príchode z banky označí za vybavený a nebude čakať na doklad — poplatky banky, mzdy, odvody poisťovniam. Predkontácia je potom nepovinná a použije sa vo výpise do Pohody.":
    "Die Bewegung wird beim Eingang von der Bank als erledigt markiert und wartet nicht auf einen Beleg — Bankgebühren, Löhne, Sozialabgaben. Die Vorkontierung ist dann optional und wird im Kontoauszug für Pohoda verwendet.",
  "Poznámka k pohybu": "Notiz zur Bewegung",
  "napr. Odvody #MM-1/YYYY#": "z. B. Abgaben #MM-1/YYYY#",
  "Transakčná daň (zákon 235/2024 Z. z.) nemá doklad. Založte si v Pohode predkontáciu s účtami podľa vašej osnovy (nákladový účet dane a bankový účet) a napíšte sem jej skratku.":
    "Die Transaktionssteuer (Gesetz 235/2024 Slg.) hat keinen Beleg. Legen Sie in Pohoda eine Vorkontierung mit Konten nach Ihrem Kontenplan an (Aufwandskonto der Steuer und Bankkonto) und tragen Sie hier ihr Kürzel ein.",
  "Vyplňte aspoň jednu podmienku — účet, smer, typ pohybu, IBAN protistrany, VS alebo protistranu.":
    "Füllen Sie mindestens eine Bedingung aus — Konto, Richtung, Bewegungsart, IBAN der Gegenseite, VS oder Gegenseite.",
  "Pravidlo „Spárované bez dokladu“ nemôže mať podmienku na typ pohybu — nechajte ho „Akýkoľvek“.":
    "Die Regel „Ohne Beleg zugeordnet“ darf keine Bedingung auf die Bewegungsart haben — lassen Sie „Beliebig“.",
  "Pravidlo „Spárované bez dokladu“ potrebuje IBAN protistrany, VS alebo protistranu.":
    "Die Regel „Ohne Beleg zugeordnet“ braucht die IBAN der Gegenseite, einen VS oder die Gegenseite.",
  // Manuál /pomoc/banka — sekcia „transakcie“
  "<0>Pohyb bez dokladu.</0> Kliknutím na stav v stĺpci Párovanie sa otvorí detail pohybu. Poplatok banky, mzdu či odvod poisťovni označíte tlačidlom <1>Pohyb nemá doklad</1> (aj s poznámkou) — medzi nespárovanými sa potom neukazuje. Pri spárovanom pohybe detail ukáže všetky doklady so súčtom „Spolu X z Y“ a dajú sa odpárovať aj naraz.":
    "<0>Bewegung ohne Beleg.</0> Ein Klick auf den Status in der Spalte Zuordnung öffnet die Details der Bewegung. Bankgebühren, Löhne oder Sozialabgaben markieren Sie mit der Schaltfläche <1>Bewegung hat keinen Beleg</1> (auch mit Notiz) — unter den nicht zugeordneten erscheint sie dann nicht mehr. Bei einer zugeordneten Bewegung zeigen die Details alle Belege mit der Summe „Insgesamt X von Y“, und sie lassen sich auch auf einmal trennen.",
  "<0>Transakčná daň.</0> Pohyby, ktoré banka sama nazve transakčnou daňou (zákon 235/2024 Z. z.), Faktero označí samo, ostatné tlačidlom <1>Označiť ako transakčná daň</1>. Vo výpise do Pohody dostanú predkontáciu, ktorú nastavíte v <2>predkontáciách</2> pri označení „Transakčná daň“.":
    "<0>Transaktionssteuer.</0> Bewegungen, die die Bank selbst als Transaktionssteuer bezeichnet (Gesetz 235/2024 Slg.), markiert Faktero automatisch, andere mit der Schaltfläche <1>Als Transaktionssteuer markieren</1>. Im Kontoauszug für Pohoda erhalten sie die Vorkontierung, die Sie in den <2>Vorkontierungen</2> bei der Kennzeichnung „Transaktionssteuer“ festlegen.",
  "<0>Pravidlá pre opakované pohyby.</0> V detaile pohybu kliknite na <1>Vytvoriť pravidlo z tohto pohybu</1> — predvyplní IBAN protistrany, smer a variabilný symbol s výsledkom „Spárované bez dokladu“. Pravidlo zaberie pri každom novom pohybe z banky aj z nahratého výpisu a po uložení vybaví aj staršie nespárované pohyby.":
    "<0>Regeln für wiederkehrende Bewegungen.</0> Klicken Sie in den Details der Bewegung auf <1>Regel aus dieser Bewegung erstellen</1> — sie füllt IBAN der Gegenseite, Richtung und VS mit dem Ergebnis „Ohne Beleg zugeordnet“ vor. Die Regel greift bei jeder neuen Bewegung von der Bank und aus einem hochgeladenen Kontoauszug und erledigt nach dem Speichern auch ältere nicht zugeordnete Bewegungen.",
};
