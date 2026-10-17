// Nemecký preklad manuálu v Pomoci (src/routes/pomoc.zakazky.tsx). Kľúče vyrába pomoc-preklad.test.tsx.
export default {
  "Pomoc — Zákazky — Faktero": "Hilfe — Projekte — Faktero",
  "Zákazky vo Faktere: sledovanie výnosov, nákladov a marže jednej práce naprieč faktúrami, skladom a jazdami.":
    "Projekte in Faktero: Erlöse, Kosten und Marge eines Auftrags über Rechnungen, Lager und Fahrten hinweg verfolgen.",
  "Pomoc · Zákazky": "Hilfe · Projekte",
  "Zákazky vo Faktere": "Projekte in Faktero",
  "Zákazka spája faktúry, sklad a jazdy do jedného čísla: zarobili ste na tejto práci, alebo nie?":
    "Ein Projekt fasst Rechnungen, Lager und Fahrten in einer Zahl zusammen: Haben Sie an diesem Auftrag verdient oder nicht?",
  "Načo sú zákazky": "Wozu Projekte",
  "Zákazka je jedna práca, jedna stavba, jeden projekt. Odpovedá na otázku, ktorú účtovníctvo nevie: <0>zarobili sme na tomto konkrétnom prípade?</0>":
    "Ein Projekt ist ein Auftrag, eine Baustelle, ein Vorhaben. Es beantwortet die Frage, die die Buchhaltung nicht beantworten kann: <0>Haben wir an genau diesem Fall verdient?</0>",
  "Faktero k zákazke zbiera výnosy aj náklady z celého systému — vydané faktúry, prijaté faktúry, materiál zo skladu a jazdy — a spočíta zisk a maržu.":
    "Faktero sammelt zum Projekt Erlöse und Kosten aus dem gesamten System — Ausgangsrechnungen, Eingangsrechnungen, Material aus dem Lager und Fahrten — und berechnet Gewinn und Marge.",
  "Založenie zákazky": "Projekt anlegen",
  "V <0>Zákazky → Nová zákazka</0> stačí názov. Číslo pridelí Faktero samo v tvare <1>ZAK{rok}{poradie}</1>.":
    "Unter <0>Projekte → Neues Projekt</0> genügt ein Name. Die Nummer vergibt Faktero selbst im Format <1>ZAK{rok}{poradie}</1>.",
  "Nepovinne pridajte:": "Optional ergänzen Sie:",
  "<0>odberateľa</0> — potom sa zákazka dá nastaviť ako jeho predvolená,":
    "<0>Kunde</0> — dann lässt sich das Projekt als sein Standardprojekt festlegen,",
  "<0>začiatok a predpokladaný koniec</0>,": "<0>Beginn und voraussichtliches Ende</0>,",
  "<0>plánované výnosy a náklady</0> — bez nich vidíte len skutočnosť, s nimi aj to, ako ďaleko ste od plánu.":
    "<0>geplante Erlöse und Kosten</0> — ohne sie sehen Sie nur die Ist-Werte, mit ihnen auch, wie weit Sie vom Plan entfernt sind.",
  "<0>manažéra zákazky</0> (projektového manažéra) — vyberá sa na detaile zákazky z ľudí vo firme. Keď v <1>schvaľovaní dokladov</1> dáte do cesty „manažér zákazky dokladu“, doklady na tejto zákazke bude schvaľovať on.":
    "<0>Projektmanager</0> — wird in der Projektdetailansicht aus den Personen im Unternehmen ausgewählt. Wenn Sie in der <1>Belegfreigabe</1> „Projektmanager des Belegs“ in den Freigabeweg aufnehmen, gibt er die Belege dieses Projekts frei.",
  "Priradenie dokladov": "Belege zuordnen",
  "Výber zákazky sa objaví na faktúre, prijatej faktúre, cenovej ponuke, prijatej objednávke, skladovom pohybe aj jazde — ale <0>až vtedy, keď firma nejakú zákazku má</0>. Kým nie je založená ani jedna, políčko sa nezobrazuje, aby zbytočne nezavadzalo.":
    "Die Projektauswahl erscheint auf Rechnung, Eingangsrechnung, Angebot, eingegangener Bestellung, Lagerbewegung und Fahrt — aber <0>erst, wenn das Unternehmen ein Projekt hat</0>. Solange keines angelegt ist, wird das Feld nicht angezeigt, damit es nicht unnötig stört.",
  "Odberateľovi sa dá nastaviť <0>predvolená zákazka</0>. Nový doklad ju potom predvyplní sám — to je najspoľahlivejší spôsob, ako sa vyhnúť tomu, že polovica dokladov zákazku nemá.":
    "Für einen Kunden lässt sich ein <0>Standardprojekt</0> festlegen. Ein neuer Beleg füllt es dann automatisch vor — das ist der zuverlässigste Weg, zu vermeiden, dass die Hälfte der Belege kein Projekt hat.",
  "Do <0>uzavretej</0> zákazky sa nové doklady priradiť nedajú. Výnimkou je pohyb, ktorý vznikol z faktúry — ten prejde vždy, aby sa faktúra nezasekla.":
    "Einem <0>abgeschlossenen</0> Projekt können keine neuen Belege zugeordnet werden. Ausgenommen ist eine Bewegung, die aus einer Rechnung entstanden ist — sie geht immer durch, damit die Rechnung nicht hängen bleibt.",
  "Ako sa počíta zisk": "So wird der Gewinn berechnet",
  "<0>Výnosy</0> sú sumy bez DPH z vydaných faktúr priradených k zákazke. Dobropis sa odpočítava. <1>Zálohová faktúra sa nepočíta</1> — záloha nie je výnos, výnosom sa stane až vyúčtovacia faktúra. Koncepty a zrušené faktúry sa preskakujú.":
    "<0>Erlöse</0> sind die Nettobeträge (ohne MwSt.) der dem Projekt zugeordneten Ausgangsrechnungen. Gutschriften werden abgezogen. <1>Anzahlungsrechnungen werden nicht gezählt</1> — eine Anzahlung ist kein Erlös, zum Erlös wird erst die Schlussrechnung. Entwürfe und stornierte Rechnungen werden übersprungen.",
  "<0>Náklady</0> sú tri:": "Es gibt drei Arten von <0>Kosten</0>:",
  "<0>materiál zo skladu</0> — výdaje ocenené váženou nákupnou cenou, nie predajnou,":
    "<0>Material aus dem Lager</0> — Warenausgänge, bewertet zum gewogenen Einkaufspreis, nicht zum Verkaufspreis,",
  "<0>prijaté faktúry</0> priradené k zákazke, sumy bez DPH,":
    "<0>Eingangsrechnungen</0>, die dem Projekt zugeordnet sind, Nettobeträge (ohne MwSt.),",
  "<0>doprava</0> — jazdy priradené k zákazke, spotrebované litre × cena paliva.":
    "<0>Transport</0> — dem Projekt zugeordnete Fahrten, verbrauchte Liter × Kraftstoffpreis.",
  "<0>Objednávka u dodávateľa nie je náklad.</0> Objednaný tovar sa nákladom stane až jeho výdajom zo skladu. V detaile zákazky ju vidíte len informatívne.":
    "<0>Eine Bestellung beim Lieferanten ist kein Kostenposten.</0> Bestellte Ware wird erst mit ihrem Warenausgang aus dem Lager zu Kosten. In der Projektdetailansicht sehen Sie sie nur zur Information.",
  "Prečo mi doprava vychádza nula": "Warum ist mein Transport null",
  "Na výpočet dopravy treba dve veci a obe chýbajú najčastejšie:":
    "Für die Berechnung des Transports braucht es zwei Dinge, und beide fehlen am häufigsten:",
  "<0>spotrebu vozidla</0> v <1>Jazdy → Vozidlá</1>,":
    "den <0>Verbrauch des Fahrzeugs</0> unter <1>Fahrten → Fahrzeuge</1>,",
  "<0>aspoň jedno tankovanie</0>, z ktorého Faktero zoberie cenu paliva.":
    "<0>mindestens eine Tankung</0>, aus der Faktero den Kraftstoffpreis übernimmt.",
  "Cena sa berie najprv z tankovaní daného vozidla, potom z ktoréhokoľvek vozidla firmy. Kým nie je ani jedno, doprava vyjde nula.":
    "Der Preis wird zuerst aus den Tankungen des jeweiligen Fahrzeugs genommen, dann aus einem beliebigen Fahrzeug des Unternehmens. Solange es keine gibt, ist der Transport null.",
  "Uzavretie a zrušenie": "Abschließen und Stornieren",
  "Hotovú zákazku <0>uzavrite</0>. Ostane v prehľade s konečným ziskom, ale nové doklady sa na ňu už nepriradia. Uzavretie sa dá vrátiť.":
    "Ein fertiges Projekt <0>schließen</0> Sie ab. Es bleibt mit dem endgültigen Gewinn in der Übersicht, neue Belege werden ihm aber nicht mehr zugeordnet. Das Abschließen lässt sich rückgängig machen.",
  "<0>Zmazať sa dá len zákazka bez dokladov.</0> Ak sú na ňu naviazané faktúry alebo pohyby, Faktero mazanie odmietne — inak by tie doklady stratili súvislosť.":
    "<0>Löschen lässt sich nur ein Projekt ohne Belege.</0> Sind Rechnungen oder Bewegungen damit verknüpft, lehnt Faktero das Löschen ab — sonst verlören diese Belege ihren Zusammenhang.",
  "Zákazky v Pohode": "Projekte in Pohoda",
  "Zákazky sa dajú posielať aj do Pohody a faktúra tam potom nesie zákazku, takže je z účtovníctva vidieť výnos po zákazkách. Zapína sa to vo <0>Účtovníctvo → Prepojenie s Pohodou</0>, podrobnosti sú v <1>manuáli k Pohode</1>.":
    "Projekte lassen sich auch an Pohoda übertragen; die Rechnung trägt dort dann das Projekt, sodass in der Buchhaltung der Erlös je Projekt sichtbar ist. Aktiviert wird das unter <0>Buchhaltung → Anbindung an Pohoda</0>, Details finden Sie im <1>Handbuch zu Pohoda</1>.",
  "Zákazka odchádza <0>raz</0> — Pohoda ju vie založiť, ale nie prepísať. Keď jej neskôr zmeníte názov, prepíšte ho aj tam.":
    "Ein Projekt wird <0>einmal</0> übertragen — Pohoda kann es anlegen, aber nicht überschreiben. Wenn Sie später seinen Namen ändern, ändern Sie ihn auch dort.",
} satisfies Record<string, string>;
