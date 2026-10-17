// Nemecký preklad manuálu v Pomoci (src/routes/pomoc.pokladna.tsx). Kľúče vyrába pomoc-preklad.test.tsx.
export default {
  "Pomoc — Pokladňa a doklady — Faktero": "Hilfe — Kasse und Belege — Faktero",
  "Pokladňa vo Faktere: stav hotovosti, pokladničné doklady, bločky, spôsob platby a načítanie eKasa QR kódu.":
    "Die Kasse in Faktero: Bargeldbestand, Kassenbelege, Kassenbons, Zahlungsart und Einlesen des eKasa-QR-Codes.",
  "Pomoc · Pokladňa": "Hilfe · Kasse",
  "Pokladňa, doklady a eKasa": "Kasse, Belege und eKasa",
  "Koľko máte v hotovosti, odkiaľ sa to číslo berie a ako z bločku dostať údaje bez prepisovania.":
    "Wie viel Bargeld Sie haben, woher diese Zahl kommt und wie Sie die Daten von einem Kassenbon ohne Abtippen übernehmen.",
  "Čo pokladňa robí": "Was die Kasse macht",
  "<0>Pokladňa</0> odpovedá na otázku, koľko máte v hotovosti a ako sa k tomu číslu prišlo. Stav skladá z <1>dvoch zdrojov</1>:":
    "Die <0>Kasse</0> beantwortet die Frage, wie viel Bargeld Sie haben und wie diese Zahl zustande kommt. Den Bestand setzt sie aus <1>zwei Quellen</1> zusammen:",
  "<0>pokladničné doklady</0> — vklady, výbery, tržby, ktoré nemajú vlastný doklad,":
    "<0>Kassenbelege</0> — Einlagen, Entnahmen, Einnahmen, die keinen eigenen Beleg haben,",
  "<0>doklady zaplatené hotovosťou</0> z evidencie výdavkov (bločky).":
    "<0>bar bezahlte Belege</0> aus der Ausgabenerfassung (Kassenbons).",
  "Doklad zaplatený <0>kartou alebo prevodom</0> je výdavok, ale hotovosť neuberá. Toto rozlíšenie je jadro celého výpočtu — bez neho by pokladňa ukazovala mínus.":
    "Ein Beleg, der <0>per Karte oder Überweisung</0> bezahlt wurde, ist eine Ausgabe, mindert aber nicht das Bargeld. Diese Unterscheidung ist der Kern der gesamten Berechnung — ohne sie würde die Kasse ein Minus zeigen.",
  "Spôsob platby na doklade": "Zahlungsart auf dem Beleg",
  "Pri každom doklade v <0>Doklady → Nový doklad</0> vyberte <1>Platené</1>: hotovosťou, kartou alebo prevodom.":
    "Wählen Sie bei jedem Beleg unter <0>Belege → Neuer Beleg</0> die Option <1>Bezahlt</1>: bar, per Karte oder per Überweisung.",
  "Ak spôsob nevyplníte, Faktero berie doklad ako hotovostný — to je pri bločkoch najčastejší prípad. Keď vám pokladňa vychádza nižšie, než by mala, prvé miesto, kam sa pozrieť, sú doklady zaplatené kartou označené ako hotovostné.":
    "Wenn Sie die Zahlungsart nicht angeben, behandelt Faktero den Beleg als Barbeleg — bei Kassenbons ist das der häufigste Fall. Wenn Ihr Kassenbestand niedriger ausfällt, als er sollte, prüfen Sie zuerst per Karte bezahlte Belege, die als bar markiert sind.",
  "Priamo v pokladni pridávate príjmy a výdaje, ktoré nemajú vlastný doklad — vklad majiteľa, odvod tržby do banky, drobný nákup bez bločku.":
    "Direkt in der Kasse erfassen Sie Einnahmen und Ausgaben, die keinen eigenen Beleg haben — eine Einlage des Inhabers, die Abführung der Einnahmen an die Bank, einen kleinen Einkauf ohne Kassenbon.",
  "Číslujú sa v tvare <0>PD{rok}{poradie}</0>. Suma je vždy kladná, smer určuje druh pohybu.":
    "Sie werden im Format <0>PD{rok}{poradie}</0> nummeriert. Der Betrag ist immer positiv, die Richtung bestimmt die Art der Bewegung.",
  "<0>Hotovostný bloček sa do pokladne neprepisuje.</0> Pokladňa ho číta priamo z evidencie dokladov. Jedna suma, jedno miesto na opravu, žiadna synchronizácia — keby ste bloček zapísali aj ako pokladničný doklad, hotovosť by odišla dvakrát.":
    "<0>Ein Bar-Kassenbon wird nicht in die Kasse übertragen.</0> Die Kasse liest ihn direkt aus der Belegerfassung. Ein Betrag, eine Stelle zum Korrigieren, keine Synchronisierung — würden Sie den Kassenbon zusätzlich als Kassenbeleg erfassen, würde das Bargeld doppelt abgehen.",
  "Priebeh a zostatok": "Verlauf und Saldo",
  "Tabuľka ukazuje pohyby vybraného mesiaca a pri každom <0>priebežný zostatok</0>. Nad ňou je zostatok na začiatku obdobia, aby stav sedel aj pri prezeraní starších mesiacov.":
    "Die Tabelle zeigt die Bewegungen des gewählten Monats und bei jeder den <0>laufenden Saldo</0>. Darüber steht der Saldo zu Beginn des Zeitraums, damit der Bestand auch beim Durchsehen älterer Monate stimmt.",
  "V rámci jedného dňa idú <0>príjmy pred výdavkami</0>. Inak by sa mohlo stať, že bloček zoradený pred vklad ukáže v ten deň mínus, hoci v pokladni nikdy nechýbalo.":
    "Innerhalb eines Tages kommen <0>Einnahmen vor Ausgaben</0>. Sonst könnte ein Kassenbon, der vor einer Einlage einsortiert ist, an diesem Tag ein Minus zeigen, obwohl in der Kasse nie etwas gefehlt hat.",
  "<0>Záporná pokladňa je vždy chyba v evidencii</0> — v hotovosti sa do mínusu ísť nedá. Faktero na ňu upozorní; hľadajte chýbajúci vklad alebo doklad označený zlým spôsobom platby.":
    "<0>Eine negative Kasse ist immer ein Erfassungsfehler</0> — mit Bargeld kann man nicht ins Minus gehen. Faktero weist darauf hin; suchen Sie nach einer fehlenden Einlage oder einem Beleg mit falscher Zahlungsart.",
  "Načítanie bločku z eKasa QR kódu": "Kassenbon über den eKasa-QR-Code einlesen",
  "Každý bloček z eKasy má QR kód a v ňom identifikátor dokladu. Faktero ten identifikátor prečíta a doklad si vypýta priamo z Finančnej správy — teda z toho istého miesta, kde si doklad overuje aj ich vlastná aplikácia „Overenie pokladničného dokladu“. Späť príde predajca, IČO, dátum, sumy, sadzby DPH <0>aj jednotlivé položky</0>, presne tak, ako ich predajca odoslal. Nič sa nehádá z fotky.":
    "Jeder Kassenbon aus eKasa hat einen QR-Code mit der Kennung des Belegs. Faktero liest diese Kennung aus und ruft den Beleg direkt bei der Finanzverwaltung (Finančná správa) ab — also an derselben Stelle, an der auch deren eigene App „Overenie pokladničného dokladu“ den Beleg prüft. Zurück kommen Verkäufer, Firmen-ID (IČO), Datum, Beträge, MwSt.-Sätze <0>und die einzelnen Positionen</0>, genau so, wie der Verkäufer sie übermittelt hat. Nichts wird aus dem Foto geraten.",
  "Stačí bločok odfotiť v <0>Skeneri dokladov</0> alebo v <1>Doklady → Nový doklad</1>; QR kód sa hľadá aj na fotke, takže netreba mieriť zvlášť naň. Odfoťte doklad celý.":
    "Fotografieren Sie den Kassenbon einfach im <0>Belegscanner</0> oder unter <1>Belege → Neuer Beleg</1>; der QR-Code wird auch auf dem Foto gesucht, Sie müssen also nicht gezielt darauf zielen. Fotografieren Sie den ganzen Beleg.",
  "<0>Keď QR kód nie je alebo sa nedá prečítať</0> — pokrčený bloček, vyblednutá termopáska, zahraničný doklad — údaje sa prečítajú z fotky. To je odhad, nie úradný údaj, a Faktero to pri doklade aj napíše. Vtedy si skontrolujte hlavne dátum a sumu.":
    "<0>Wenn kein QR-Code vorhanden ist oder er sich nicht lesen lässt</0> — zerknitterter Kassenbon, verblasstes Thermopapier, ausländischer Beleg —, werden die Daten aus dem Foto gelesen. Das ist eine Schätzung, keine amtliche Angabe, und Faktero vermerkt das auch beim Beleg. Prüfen Sie dann vor allem Datum und Betrag.",
  "Doklad sa vo Finančnej správe nemusí nájsť ani vtedy, keď ho predajca ešte neodoslal — pokladnica v režime offline ho posiela až dodatočne. Skúste to o pár hodín neskôr.":
    "Der Beleg wird bei der Finanzverwaltung unter Umständen auch dann nicht gefunden, wenn der Verkäufer ihn noch nicht übermittelt hat — eine Kasse im Offline-Modus sendet ihn erst nachträglich. Versuchen Sie es ein paar Stunden später erneut.",
  "<0>Spôsob úhrady sa z bločku prečítať väčšinou nedá.</0> Pokladnica ho do eKasy posielať nemusí a väčšina ho neposiela — na doklade býva vytlačený, ale do údajov sa nedostane. Keď ho doklad nesie, Faktero ho predvolí; inak si po naskenovaní vyberiete hotovosť, kartu alebo prevod. Nie je to formalita: z pokladne uberá len doklad platený hotovosťou.":
    "<0>Die Zahlungsart lässt sich aus dem Kassenbon meist nicht auslesen.</0> Die Kasse muss sie nicht an eKasa senden, und die meisten senden sie nicht — auf dem Beleg ist sie zwar gedruckt, in die Daten gelangt sie aber nicht. Enthält der Beleg sie, setzt Faktero sie vor; sonst wählen Sie nach dem Scannen bar, Karte oder Überweisung. Das ist keine Formalität: Die Kasse mindert nur ein bar bezahlter Beleg.",
  "Položky sa ukladajú k dokladu tak, ako prišli, aj s rozpisom DPH po sadzbách. Bloček ich má často viac naraz — jedna sadzba by doklad popísala nesprávne.":
    "Die Positionen werden so, wie sie gekommen sind, zum Beleg gespeichert, samt MwSt.-Aufschlüsselung nach Sätzen. Ein Kassenbon hat oft mehrere gleichzeitig — ein einziger Satz würde den Beleg falsch abbilden.",
  "Pokladňa a uzávierka": "Kasse und Abschluss",
  "Pokladničný doklad je daňový záznam ako faktúra, takže platí aj naň <0>uzamknutie období</0>. Po uzamknutí sa v ňom už nedá meniť dátum, suma ani popis.":
    "Ein Kassenbeleg ist ein steuerlicher Datensatz wie eine Rechnung, daher gilt auch für ihn die <0>Periodensperre</0>. Nach dem Sperren lassen sich Datum, Betrag und Beschreibung nicht mehr ändern.",
  "Pokladňa pre účtovníčku": "Kasse für die Buchhalterin",
  "Pokladničné doklady sú súčasťou mesačných podkladov aj priameho prepojenia s Pohodou — idú ako príjmové a výdavkové doklady. Pozrite si <0>manuál k Pohode</0>.":
    "Kassenbelege sind Teil der monatlichen Unterlagen und auch der direkten Pohoda-Anbindung — sie gehen als Einnahme- und Ausgabebelege hinüber. Siehe das <0>Handbuch zu Pohoda</0>.",
  "Rozpis DPH sa k nim <0>nedopĺňa</0>: pohyb v pokladni sadzbu nemá a vymyslená by bola tichá chyba v priznaní. Doklady s DPH sú prijaté doklady a faktúry.":
    "Eine MwSt.-Aufschlüsselung wird bei ihnen <0>nicht ergänzt</0>: Eine Kassenbewegung hat keinen Steuersatz, und ein erfundener wäre ein stiller Fehler in der Steuererklärung. Belege mit MwSt. sind Eingangsbelege und Rechnungen.",
  "Zaokrúhľovanie na päť centov": "Rundung auf fünf Cent",
  "Pri platbe v hotovosti sa celková suma zaokrúhľuje na <0>päť centov</0> — tak to od 1. 7. 2022 ukladá zákon o cenách, lebo jedno- a dvojcentové mince sa už nevydávajú. Keď na faktúre vyberiete hotovosť, Faktero prepne zaokrúhlenie samo a rozdiel (najviac dva centy) je vidieť v súčtoch.":
    "Bei Barzahlung wird der Gesamtbetrag auf <0>fünf Cent</0> gerundet — so schreibt es seit dem 1. 7. 2022 das slowakische Preisgesetz (zákon o cenách) vor, weil Ein- und Zwei-Cent-Münzen nicht mehr ausgegeben werden. Wenn Sie auf der Rechnung Barzahlung wählen, stellt Faktero die Rundung selbst um, und die Differenz (höchstens zwei Cent) ist in den Summen sichtbar.",
  "Platba v hotovosti nad <0>5 000 €</0> je medzi podnikateľmi zakázaná (zákon č. 394/2012 Z. z.) — pri takej sume sa objaví upozornenie.":
    "Barzahlungen über <0>5 000 €</0> sind zwischen Unternehmern verboten (Gesetz Nr. 394/2012 Z. z.) — bei einem solchen Betrag erscheint ein Hinweis.",
} satisfies Record<string, string>;
