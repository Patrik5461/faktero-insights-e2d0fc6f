// Párovanie iných dokladov (predpis, výmer, pokuta…) s pohybmi na účte.
export default {
  "platba odišla na IBAN z dokladu": "Zahlung ging an die IBAN aus dem Beleg",
  "zaplatené v lehote": "fristgerecht bezahlt",
  "rovnako dobre sedí aj iná dvojica": "ein anderes Paar passt genauso gut",
  "Spárovať pohyb s dokladom „{nazov}“?": "Buchung mit dem Beleg „{nazov}“ zuordnen?",
  "Spárované, doklad je zaplatený.": "Zugeordnet, der Beleg ist bezahlt.",
  "Spárovať s iným dokladom": "Mit sonstigem Beleg zuordnen",
  "Iný doklad (predpis, výmer, pokuta…), ktorý tento pohyb uhrádza":
    "Sonstiger Beleg (Beitragsvorschreibung, Bescheid, Bußgeld…), den diese Buchung bezahlt",
  "Žiadny nezaplatený iný doklad na úhradu.": "Kein unbezahlter sonstiger Beleg zur Zahlung.",
  sedí: "passt",
  "lehota {d}": "Frist {d}",
  "iný doklad": "sonstiger Beleg",
  "Iný doklad uhradený týmto pohybom": "Mit dieser Buchung bezahlter sonstiger Beleg",
  "Vybrať platbu v detaile": "Zahlung im Detail auswählen",
  "Pohyb z účtu, ktorý by k dokladu sedel, sme zatiaľ nenašli. V detaile dokladu ho vyberiete ručne, alebo označíte „Zaplatené bez pohybu“.":
    "Eine passende Kontobewegung wurde noch nicht gefunden. Im Belegdetail wählen Sie sie manuell aus oder markieren „Ohne Buchung bezahlt“.",
  "Pohyby sa nepodarilo načítať.": "Buchungen konnten nicht geladen werden.",
  "Spárovať doklad s pohybom {suma} z {datum}?": "Beleg mit der Buchung {suma} vom {datum} zuordnen?",
  "Suma pohybu ({suma}) nesedí so sumou dokladu. Spárovať aj tak?":
    "Der Betrag der Buchung ({suma}) stimmt nicht mit dem Beleg überein. Trotzdem zuordnen?",
  "Zaplatené bez pohybu z účtu {datum}.": "Ohne Kontobewegung bezahlt am {datum}.",
  "Zrušiť označenie „Zaplatené bez pohybu“?": "Markierung „Ohne Buchung bezahlt“ aufheben?",
  "Označenie zrušené.": "Markierung aufgehoben.",
  "Pohyb z účtu, ktorý by k dokladu sedel, sme zatiaľ nenašli.":
    "Eine passende Kontobewegung wurde noch nicht gefunden.",
  "Doplňte lehotu, variabilný symbol alebo IBAN — podľa nich sa platba hľadá v banke.":
    "Ergänzen Sie Frist, Verwendungszweck (VS) oder IBAN — danach wird die Zahlung in der Bank gesucht.",
  "Vybrať pohyb z účtu": "Kontobewegung auswählen",
  "Zaplatené bez pohybu": "Ohne Buchung bezahlt",
  "Dátum úhrady (napr. v hotovosti na pošte)": "Zahlungsdatum (z. B. bar bei der Post)",
  "Doklad je označený ako zaplatený.": "Der Beleg ist als bezahlt markiert.",
  "Hľadať protistranu, VS, popis": "Gegenpartei, VS, Beschreibung suchen",
  "Hľadať pohyb": "Buchung suchen",
  "V okolí lehoty nie je žiadny voľný odchádzajúci pohyb.": "Rund um die Frist gibt es keine freie ausgehende Buchung.",
  "variabilný symbol": "Verwendungszweck (VS)",
  "Variabilný symbol (nepovinné)": "Verwendungszweck (VS, optional)",
  "IBAN na úhradu (nepovinné)": "IBAN zur Zahlung (optional)",
  "Doplniť prázdne polia z tejto prílohy (aj VS a IBAN)": "Leere Felder aus diesem Anhang ergänzen (auch VS und IBAN)",
  // Manuál Pomoc → Doklady → Iné doklady.
  "<0>Platba.</0> Pri predpise poistného, platobnom výmere či pokute AI prečíta aj <1>variabilný symbol</1> a <2>IBAN</2> na úhradu. Faktero potom v Banke hľadá odchádzajúcu platbu s rovnakou sumou okolo lehoty a nájdenú vám najprv <3>navrhne</3> — ikonkou banky pri doklade, pásom nad zoznamom a v detaile v karte <4>Platba</4>; spáruje sa až po kliknutí na <5>Spárovať</5>. Pohyb vyberiete aj ručne cez <6>Vybrať pohyb z účtu</6>, doklad zaplatený v hotovosti označíte <7>Zaplatené bez pohybu</7> a v detaile pohybu v Banke ho priradíte cez <8>Spárovať s iným dokladom</8>. Filter <9>Platba</9> ukáže spárované, nájdené a nenájdené.":
    "<0>Zahlung.</0> Bei Beitragsvorschreibungen, Zahlungsbescheiden oder Bußgeldern liest die KI auch den <1>Verwendungszweck (VS)</1> und die <2>IBAN</2> zur Zahlung. Faktero sucht dann in der Bank eine ausgehende Zahlung mit gleichem Betrag rund um die Frist und <3>schlägt</3> sie Ihnen zuerst vor — mit dem Bank-Symbol beim Beleg, einem Streifen über der Liste und im Detail in der Karte <4>Zahlung</4>; zugeordnet wird erst nach Klick auf <5>Zuordnen</5>. Die Buchung wählen Sie auch manuell über <6>Kontobewegung auswählen</6>, einen bar bezahlten Beleg markieren Sie mit <7>Ohne Buchung bezahlt</7>, und im Buchungsdetail in der Bank ordnen Sie ihn über <8>Mit sonstigem Beleg zuordnen</8> zu. Der Filter <9>Zahlung</9> zeigt zugeordnete, gefundene und nicht gefundene.",
};
