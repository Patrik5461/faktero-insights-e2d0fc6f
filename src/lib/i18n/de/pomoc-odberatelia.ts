// Nemecký preklad manuálu v Pomoci (src/routes/pomoc.odberatelia.tsx). Kľúče vyrába pomoc-preklad.test.tsx.
export default {
  "Pomoc — Odberatelia — Faktero": "Hilfe — Kunden — Faktero",
  "Karta odberateľa vo Faktere: doplnenie údajov podľa IČO, cenová skupina, zľava, predvolená zákazka a mazanie.":
    "Die Kundenkarte in Faktero: Daten anhand der Firmen-ID (IČO) ergänzen, Preisgruppe, Rabatt, Standardprojekt und Löschen.",
  "Pomoc · Kontakty": "Hilfe · Kontakte",
  "Karta odberateľa, jeho ceny a zľavy a predvolená zákazka.":
    "Die Kundenkarte, Preise und Rabatte des Kunden und das Standardprojekt.",
  "Založenie odberateľa": "Kunden anlegen",
  "V <0>Kontakty → Odberatelia</0> stačí začať písať názov firmy alebo zadať IČO — Faktero doplní adresu, DIČ aj IČ DPH z registra. Údaje sa dajú prepísať.":
    "Unter <0>Kontakte → Kunden</0> genügt es, den Firmennamen einzutippen oder die Firmen-ID (IČO) einzugeben — Faktero ergänzt Adresse, Steuernummer (DIČ) und USt-IdNr. aus dem Register. Die Daten lassen sich überschreiben.",
  "Ak už odberateľ s rovnakým IČOm existuje, Faktero na to upozorní ešte pred uložením. Dva rovnaké kontakty znamenajú rozdelenú históriu faktúr.":
    "Gibt es bereits einen Kunden mit derselben IČO, weist Faktero noch vor dem Speichern darauf hin. Zwei gleiche Kontakte bedeuten eine geteilte Rechnungshistorie.",
  "<0>E-mail</0> vyplňte vždy, keď chcete posielať faktúry a ponuky z Faktera — bez neho sa odoslanie neponúkne.":
    "Füllen Sie die <0>E-Mail</0> immer aus, wenn Sie Rechnungen und Angebote aus Faktero versenden möchten — ohne sie wird der Versand nicht angeboten.",
  "Dodávatelia a spoločný adresár": "Lieferanten und gemeinsames Adressbuch",
  "Odberatelia aj <0>dodávatelia</0> sú v jednom adresári, ako v Pohode. Na karte kontaktu zaškrtnete <1>Odberateľ</1>, <2>Dodávateľ</2> alebo oboje — firma, ktorá vám dodáva aj od vás nakupuje, je v adresári raz.":
    "Kunden und <0>Lieferanten</0> stehen in einem Adressbuch, wie in Pohoda. Auf der Kontaktkarte kreuzen Sie <1>Kunde</1>, <2>Lieferant</2> oder beides an — ein Unternehmen, das Ihnen liefert und auch bei Ihnen kauft, steht nur einmal im Adressbuch.",
  "Pri faktúre, ponuke či objednávke sa ponúkajú len odberatelia. Pri <0>prijatej faktúre</0> vyberiete dodávateľa zo zoznamu a doplní sa jeho IČO, DIČ, IČ DPH aj IBAN. Nového dodávateľa z prijatej faktúry Faktero do adresára uloží samo (dá sa to odškrtnúť).":
    "Bei Rechnung, Angebot oder Bestellung werden nur Kunden angeboten. Bei einer <0>Eingangsrechnung</0> wählen Sie den Lieferanten aus der Liste, und seine IČO, DIČ, USt-IdNr. und IBAN werden ergänzt. Einen neuen Lieferanten aus einer Eingangsrechnung speichert Faktero selbst im Adressbuch (das lässt sich abwählen).",
  "Dodávateľov, od ktorých už máte prijaté faktúry, naplníte naraz: v Dodávateľoch kliknite na <0>Importovať</0> → <1>Načítať z prijatých faktúr</1>.":
    "Lieferanten, von denen Sie bereits Eingangsrechnungen haben, übernehmen Sie auf einmal: Klicken Sie unter Lieferanten auf <0>Importieren</0> → <1>Aus Eingangsrechnungen laden</1>.",
  "Import odberateľov a dodávateľov z Pohody a iných systémov":
    "Import von Kunden und Lieferanten aus Pohoda und anderen Systemen",
  "V <0>Odberateľoch</0> alebo <1>Dodávateľoch</1> kliknite na <2>Importovať</2> a vyberte súbor. Faktero rozpozná:":
    "Klicken Sie unter <0>Kunden</0> oder <1>Lieferanten</1> auf <2>Importieren</2> und wählen Sie die Datei. Faktero erkennt:",
  "<0>Pohoda</0> — XML export adresára (Súbor → Dátová komunikácia → XML export), XML export faktúr (odberatelia sa vyberú z nich) alebo tabuľku adresára uloženú do Excelu.":
    "<0>Pohoda</0> — XML-Export des Adressbuchs (Súbor → Dátová komunikácia → XML export), XML-Export von Rechnungen (die Kunden werden daraus entnommen) oder die nach Excel gespeicherte Adressbuchtabelle.",
  "<0>Money S3</0> — XML export adresára.": "<0>Money S3</0> — XML-Export des Adressbuchs.",
  "<0>SuperFaktúra, iDoklad, Fakturoid, KROS, Omega</0> a ďalšie — export klientov do CSV alebo Excelu. Stĺpce sa priradia podľa hlavičky; ak niektorý nesedí, zmeníte ho priamo v okne importu.":
    "<0>SuperFaktúra, iDoklad, Fakturoid, KROS, Omega</0> und weitere — Export der Kunden als CSV oder Excel. Die Spalten werden anhand der Kopfzeile zugeordnet; passt eine nicht, ändern Sie sie direkt im Importfenster.",
  "Pred importom uvidíte, koľko odberateľov sa založí a koľko už máte. Existujúci sa hľadajú podľa IČO, bez neho podľa názvu, a <0>nikdy sa neprepíšu</0> — ak chcete, doplnia sa im len prázdne údaje (napríklad e-mail alebo IČ DPH). Ten istý odberateľ v súbore viackrát sa založí raz.":
    "Vor dem Import sehen Sie, wie viele Kunden angelegt werden und wie viele Sie bereits haben. Bestehende werden anhand der IČO gesucht, ohne IČO anhand des Namens, und <0>niemals überschrieben</0> — auf Wunsch werden nur leere Angaben ergänzt (zum Beispiel E-Mail oder USt-IdNr.). Derselbe Kunde, der mehrmals in der Datei steht, wird einmal angelegt.",
  "Cenová skupina a zľava": "Preisgruppe und Rabatt",
  "Na karte odberateľa sa nastavuje, za koľko nakupuje:":
    "Auf der Kundenkarte wird festgelegt, zu welchen Konditionen der Kunde einkauft:",
  "<0>Cenová skupina</0> — spoločné podmienky pre viacerých odberateľov (veľkoobchod, stáli zákazníci).":
    "<0>Preisgruppe</0> — gemeinsame Konditionen für mehrere Kunden (Großhandel, Stammkunden).",
  "<0>Individuálna zľava v %</0> — platí len pre neho a <1>prebíja zľavu skupiny</1>; nesčítavajú sa.":
    "<0>Individueller Rabatt in %</0> — gilt nur für ihn und <1>hat Vorrang vor dem Gruppenrabatt</1>; sie werden nicht addiert.",
  "Konkrétne dohodnuté ceny na jednotlivé produkty sa zadávajú v <0>cenníku</0> a prebíjajú obe zľavy. Celé poradie vysvetľuje <1>manuál k cenníku</1>.":
    "Konkret vereinbarte Preise für einzelne Produkte geben Sie in der <0>Preisliste</0> ein; sie haben Vorrang vor beiden Rabatten. Die gesamte Reihenfolge erklärt das <1>Handbuch zur Preisliste</1>.",
  "Ak pre odberateľa robíte jednu dlhodobú prácu, nastavte mu <0>predvolenú zákazku</0>. Každý nový doklad ju potom predvyplní sám.":
    "Wenn Sie für einen Kunden eine langfristige Arbeit erledigen, legen Sie für ihn ein <0>Standardprojekt</0> fest. Jeder neue Beleg füllt es dann selbst vor.",
  "Je to najspoľahlivejší spôsob, ako sa vyhnúť tomu, že polovica dokladov zákazku nemá a vyhodnotenie práce je nepravdivé. Políčko sa zobrazí, až keď firma nejakú <0>zákazku</0> má.":
    "Das ist der zuverlässigste Weg zu vermeiden, dass die Hälfte der Belege kein Projekt hat und die Auswertung der Arbeit nicht stimmt. Das Feld erscheint erst, wenn das Unternehmen ein <0>Projekt</0> hat.",
  Mazanie: "Löschen",
  "Zmazaný odberateľ zmizne zo zoznamu, ale <0>faktúry ostávajú</0> — nesú si vlastný odpis údajov z času vystavenia. Preto premenovanie odberateľa spätne neprepíše staré doklady.":
    "Ein gelöschter Kunde verschwindet aus der Liste, aber <0>die Rechnungen bleiben</0> — sie tragen eine eigene Kopie der Daten zum Zeitpunkt der Ausstellung. Deshalb überschreibt eine Umbenennung des Kunden alte Belege nicht rückwirkend.",
  "Odberatelia v Pohode": "Kunden in Pohoda",
  "Adresár sa dá posielať do Pohody, takže tam odberateľ je aj vtedy, keď mu tento mesiac nič nefakturujete. Zmenený kontakt sa <0>prepíše</0>, nezaloží sa druhý.":
    "Das Adressbuch lässt sich an Pohoda senden, sodass der Kunde dort auch dann vorhanden ist, wenn Sie ihm diesen Monat nichts in Rechnung stellen. Ein geänderter Kontakt wird <0>überschrieben</0>, es wird kein zweiter angelegt.",
  "Zapína sa to v <0>Účtovníctvo → Prepojenie s Pohodou</0> — viac v <1>manuáli k Pohode</1>.":
    "Aktiviert wird das unter <0>Buchhaltung → Anbindung an Pohoda</0> — mehr im <1>Handbuch zu Pohoda</1>.",
  "Overenie IČ DPH vo VIES": "Prüfung der USt-IdNr. in VIES",
  "Pri odberateľovi z iného členského štátu je vedľa poľa IČ DPH tlačidlo <0>Overiť vo VIES</0>. Register Európskej komisie povie, či je číslo platné, a doplní názov firmy.":
    "Bei einem Kunden aus einem anderen Mitgliedstaat gibt es neben dem Feld USt-IdNr. die Schaltfläche <0>In VIES prüfen</0>. Das Register der Europäischen Kommission sagt, ob die Nummer gültig ist, und ergänzt den Firmennamen.",
  "Nie je to formalita: pri dodaní tovaru do EÚ je platné IČ DPH odberateľa <0>podmienkou oslobodenia od dane</0>. Každé overenie sa zapíše aj s dátumom, takže sa dá pri kontrole preukázať; po tridsiatich dňoch sa označí za staršie a pred ďalším dodaním sa oplatí overiť znova.":
    "Das ist keine Formalität: Bei Warenlieferungen in die EU ist eine gültige USt-IdNr. des Kunden <0>Voraussetzung für die Steuerbefreiung</0>. Jede Prüfung wird mit Datum gespeichert, sodass sie sich bei einer Prüfung nachweisen lässt; nach dreißig Tagen wird sie als älter markiert, und vor der nächsten Lieferung lohnt es sich, erneut zu prüfen.",
  "Keď je register nedostupný, Faktero to povie ako výpadok — nie ako neplatné IČ DPH. To sú dve rôzne veci a rozhodujú o tom, či faktúra smie ísť bez dane.":
    "Ist das Register nicht erreichbar, meldet Faktero das als Ausfall — nicht als ungültige USt-IdNr. Das sind zwei verschiedene Dinge, und sie entscheiden darüber, ob die Rechnung ohne Steuer hinausgehen darf.",
  "<0>Povinné číslo objednávky.</0> Keď partner chce na každom doklade číslo svojej objednávky, zaškrtnite to na jeho karte. Faktúra pre neho a doklad od neho v Nespracovaných potom bez čísla objednávky ukážu upozornenie — uložiť sa dajú aj tak.":
    "<0>Pflicht-Bestellnummer.</0> Wenn ein Partner auf jedem Beleg die Nummer seiner Bestellung haben möchte, haken Sie das auf seiner Karte an. Eine Rechnung für ihn und ein Beleg von ihm in Unverarbeitete zeigen dann ohne Bestellnummer einen Hinweis — speichern lassen sie sich trotzdem.",
} satisfies Record<string, string>;
