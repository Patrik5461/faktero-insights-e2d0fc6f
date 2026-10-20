// Pohyblivá úroková sadzba pri financovaní: formulár zmluvy (FormularZmluvy),
// panel sadzby a vypočítaného úroku (SadzbaZmluvy), detail kontokorentu a úveru
// a sekcia „Pohyblivá úroková sadzba“ v manuáli /pomoc/financovanie.
export default {
  /* Formulár */
  "Úroková sadzba": "Zinssatz",
  Pevná: "Fest",
  Pohyblivá: "Variabel",
  "Referenčný index": "Referenzindex",
  "Marža % p. a.": "Marge % p. a.",
  "Prirážka banky k indexu — tak, ako je v zmluve (po prípadnom zvýhodnení).":
    "Aufschlag der Bank auf den Index — so wie im Vertrag (nach etwaiger Vergünstigung).",
  "Dolná hranica indexu %": "Untergrenze des Index %",
  "bez hranice": "ohne Untergrenze",
  "Napr. 0, keď zmluva hovorí, že záporný index sa považuje za nulu. Prázdne = bez hranice.":
    "Z. B. 0, wenn der Vertrag einen negativen Index als null behandelt. Leer = ohne Untergrenze.",
  "Sadzba sa mení": "Zinssatz ändert sich",
  polročne: "halbjährlich",
  ročne: "jährlich",
  "Index sa určuje": "Index wird festgestellt",
  "Počet pracovných dní": "Anzahl der Arbeitstage",
  "pracovné dni pred začiatkom obdobia": "Arbeitstage vor Beginn der Periode",
  "priemer za predchádzajúci mesiac": "Durchschnitt des Vormonats",
  "Bežne „dva pracovné dni pred začiatkom obdobia fixácie“.":
    "Üblich: „zwei Arbeitstage vor Beginn der Zinsperiode“.",
  "Dnes: {index} {hodnota} % ({k}) + marža {marza} % = {sadzba} % p. a.":
    "Heute: {index} {hodnota} % ({k}) + Marge {marza} % = {sadzba} % p. a.",
  "priemer za {mesiac}": "Durchschnitt {mesiac}",
  "k {datum}": "zum {datum}",
  "Hodnota indexu sa načíta denne z ECB a ČNB; sadzba sa dopočíta pri uložení.":
    "Der Indexwert wird täglich von der EZB und der ČNB geladen; der Zinssatz wird beim Speichern berechnet.",
  "EURIBOR je verejne zadarmo len ako mesačný priemer, takže vypočítaná sadzba je odhad — skutočnú určuje banka. Na detaile zmluvy sa dá za každé obdobie zadať ručne.":
    "Der EURIBOR ist öffentlich und kostenlos nur als Monatsdurchschnitt verfügbar, daher ist der berechnete Zinssatz eine Schätzung — den tatsächlichen bestimmt die Bank. In den Vertragsdetails lässt er sich für jede Periode manuell eingeben.",
  "Zadajte maržu pohyblivej sadzby.": "Geben Sie die Marge des variablen Zinssatzes ein.",
  "Pri úveroch s EURIBORom banky takmer vždy počítajú „rok s 360 dňami“ (ACT/360) — skontrolujte zmluvu.":
    "Bei Krediten mit EURIBOR rechnen Banken fast immer mit „Jahr mit 360 Tagen“ (ACT/360) — prüfen Sie den Vertrag.",
  "Rámec platí od": "Rahmen gilt ab",
  "Deň podpisu alebo sprístupnenia rámca — od neho Faktero počíta úrok z čerpania.":
    "Tag der Unterzeichnung oder Bereitstellung des Rahmens — ab diesem Tag berechnet Faktero die Zinsen aus der Inanspruchnahme.",

  /* Detail zmluvy — sadzba a vypočítaný úrok */
  "Sadzbu sa nepodarilo načítať.": "Der Zinssatz konnte nicht geladen werden.",
  "Ručná sadzba zrušená, platí vypočítaná.": "Manueller Zinssatz entfernt, es gilt der berechnete.",
  "Sadzba za obdobie uložená.": "Zinssatz für die Periode gespeichert.",
  "Pevná sadzba {sadzba} p. a.": "Fester Zinssatz {sadzba} p. a.",
  "(za toto obdobie zadaná ručne)": "(für diese Periode manuell eingegeben)",
  "Hodnota indexu {index} ešte nie je načítaná — sadzba sa dopočíta po najbližšom stiahnutí sadzieb (denne ráno).":
    "Der Wert des Index {index} ist noch nicht geladen — der Zinssatz wird nach dem nächsten Abruf der Sätze berechnet (täglich morgens).",
  "Aktuálna sadzba: {sadzba} p. a. (zadaná ručne za obdobie {od} – {do})":
    "Aktueller Zinssatz: {sadzba} p. a. (manuell eingegeben für die Periode {od} – {do})",
  "Aktuálna sadzba: {index} {hodnota} ({k}) + marža {marza} = {sadzba} p. a.":
    "Aktueller Zinssatz: {index} {hodnota} ({k}) + Marge {marza} = {sadzba} p. a.",
  "Index je pod dolnou hranicou {floor}, počíta sa s hranicou.":
    "Der Index liegt unter der Untergrenze {floor}, gerechnet wird mit der Untergrenze.",
  "Obdobie fixácie {od} – {do}, deň fixingu {fixing}.":
    "Zinsperiode {od} – {do}, Fixing-Tag {fixing}.",
  "Odhad: EURIBOR je verejne zadarmo len ako mesačný priemer (ECB), zmluva ho však berie k dňu fixingu. Skutočný úrok určuje banka. Keď sadzbu poznáte (oznámenie banky, výpis), zadajte ju za obdobie ručne — prepíše vypočítanú.":
    "Schätzung: Der EURIBOR ist öffentlich und kostenlos nur als Monatsdurchschnitt (EZB) verfügbar, der Vertrag nimmt ihn jedoch zum Fixing-Tag. Die tatsächlichen Zinsen bestimmt die Bank. Wenn Sie den Zinssatz kennen (Mitteilung der Bank, Kontoauszug), geben Sie ihn für die Periode manuell ein — er ersetzt den berechneten.",
  "Predbežné: hodnota indexu k dňu fixingu ešte nie je zverejnená, použitá je posledná známa.":
    "Vorläufig: Der Indexwert zum Fixing-Tag ist noch nicht veröffentlicht, verwendet wird der letzte bekannte.",
  "Vypočítaný úrok a skutočnosť": "Berechnete Zinsen und Wirklichkeit",
  "Úrok z čerpania na konci každého dňa (zaúčtovaný zostatok a pohyby z banky) × sadzba platná v ten deň, {konvencia}. Rozdiel oproti úroku, ktorý banka strhla, je najlepšia kontrola, či sadzba a fixing sedia.":
    "Zinsen aus der Inanspruchnahme am Ende jedes Tages (gebuchter Saldo und Bankumsätze) × an diesem Tag gültiger Zinssatz, {konvencia}. Die Differenz zu den von der Bank belasteten Zinsen ist die beste Kontrolle, ob Zinssatz und Fixing stimmen.",
  "Zatiaľ nič na výpočet.": "Noch nichts zu berechnen.",
  "Priemerné čerpanie": "Durchschnittliche Inanspruchnahme",
  "Vypočítaný úrok": "Berechnete Zinsen",
  "Strhla banka": "Von der Bank belastet",
  "(predbežne)": "(vorläufig)",
  "(odhad)": "(Schätzung)",
  "niektoré dni bez sadzby": "einige Tage ohne Zinssatz",
  "Uloží sadzbu za obdobie fixácie tak, aby výpočet sedel so strhnutým úrokom.":
    "Speichert den Zinssatz für die Zinsperiode so, dass die Berechnung mit den belasteten Zinsen übereinstimmt.",
  "Prevziať sadzbu {s}": "Zinssatz {s} übernehmen",
  "História sadzby po obdobiach": "Zinssatzverlauf nach Perioden",
  Fixing: "Fixing",
  Index: "Index",
  hranica: "Untergrenze",
  "zadané ručne": "manuell eingegeben",
  pevná: "fest",
  "odhad z mesačného priemeru": "Schätzung aus Monatsdurchschnitt",
  vypočítané: "berechnet",
  predbežne: "vorläufig",
  "Zadajte sadzbu v % p. a.": "Geben Sie den Zinssatz in % p. a. ein.",
  "Zrušiť ručnú sadzbu": "Manuellen Zinssatz entfernen",
  "Zadať sadzbu ručne": "Zinssatz manuell eingeben",
  "Ručne zadaná sadzba (celková, teda index + marža) prepíše vypočítanú za celé obdobie fixácie — keď banka oznámi skutočnú sadzbu, alebo keď ju prevezmete zo strhnutého úroku.":
    "Ein manuell eingegebener Zinssatz (gesamt, also Index + Marge) ersetzt den berechneten für die gesamte Zinsperiode — wenn die Bank den tatsächlichen Zinssatz mitteilt oder wenn Sie ihn aus den belasteten Zinsen übernehmen.",
  "Zmluva nemá vybraný napojený účet — úrok sa nedá vypočítať.":
    "Für den Vertrag ist kein verbundenes Konto ausgewählt — die Zinsen lassen sich nicht berechnen.",
  "Banka neposiela zaúčtovaný zostatok účtu — bez neho sa čerpanie po dňoch spočítať nedá (disponibilný zostatok obsahuje aj nevyčerpaný rámec).":
    "Die Bank übermittelt keinen gebuchten Kontosaldo — ohne ihn lässt sich die tägliche Inanspruchnahme nicht berechnen (der verfügbare Saldo enthält auch den nicht ausgeschöpften Rahmen).",
  "Na účte zatiaľ nie sú žiadne pohyby z banky.": "Auf dem Konto gibt es noch keine Bankumsätze.",
  "{index} + marža {marza} % p. a.": "{index} + Marge {marza} % p. a.",
  "Splátkový kalendár je spočítaný so sadzbou platnou pri uložení zmluvy. Keď banka po zmene indexu oznámi novú splátku, zmluvu upravte a uložte — nezaplatené splátky sa prepočítajú s dnešnou sadzbou.":
    "Der Ratenplan ist mit dem beim Speichern des Vertrags gültigen Zinssatz berechnet. Wenn die Bank nach einer Indexänderung eine neue Rate mitteilt, bearbeiten und speichern Sie den Vertrag — offene Raten werden mit dem heutigen Zinssatz neu berechnet.",

  /* Manuál /pomoc/financovanie */
  "Pri novej zmluve zvoľte druh <0>Kontokorentný úver</0>. Polia splátkového kalendára sa skryjú a vyplníte <1>úverový rámec</1>, <2>účet</2>, na ktorom rámec je, <3>úrok % p. a.</3>, <4>poplatok za rámec ročne</4>, dokedy rámec platí a ako často banka úrok strhne. Pri pohyblivej sadzbe (napr. 1M EURIBOR + marža) zvoľte <5>Pohyblivá</5> — pozri časť Pohyblivá úroková sadzba nižšie.":
    "Wählen Sie beim neuen Vertrag die Art <0>Kontokorrentkredit</0>. Die Felder des Ratenplans werden ausgeblendet, und Sie füllen den <1>Kreditrahmen</1>, das <2>Konto</2>, auf dem der Rahmen besteht, <3>Zins % p. a.</3>, die <4>Rahmengebühr jährlich</4>, die Laufzeit des Rahmens und die Häufigkeit der Zinsbelastung aus. Bei einem variablen Zinssatz (z. B. 1M EURIBOR + Marge) wählen Sie <5>Variabel</5> — siehe Abschnitt Variabler Zinssatz unten.",
  "Nahratú zmluvu o kontokorente Faktero spozná samo — aj keď ju banka nazve „úver“: úver bez splátkového kalendára s rámcom k bežnému účtu je kontokorent. Vyčíta limit, sadzbu (aj referenčný index a maržu), poplatok, platnosť a IBAN účtu a podľa IBAN zmluvu priradí k napojenému účtu.":
    "Einen hochgeladenen Kontokorrentvertrag erkennt Faktero selbst — auch wenn die Bank ihn „Kredit“ nennt: Ein Kredit ohne Ratenplan mit einem Rahmen zum Girokonto ist ein Kontokorrentkredit. Faktero liest Limit, Zinssatz (auch Referenzindex und Marge), Gebühr, Laufzeit und IBAN des Kontos aus und ordnet den Vertrag anhand der IBAN dem verbundenen Konto zu.",
  "Pohyblivá úroková sadzba": "Variabler Zinssatz",
  "Veľa úverov a kontokorentov nemá pevný úrok, ale <0>referenčný index + maržu</0> — napríklad „1M EURIBOR + 4,3 % p. a.“. Index sa mení raz za obdobie fixácie (mesačne, štvrťročne…) a s ním aj úrok. Keby ste do zmluvy zapísali len maržu, Faktero by úrok počítalo príliš nízky.":
    "Viele Kredite und Kontokorrentkredite haben keinen festen Zins, sondern <0>Referenzindex + Marge</0> — zum Beispiel „1M EURIBOR + 4,3 % p. a.“. Der Index ändert sich einmal pro Zinsperiode (monatlich, vierteljährlich…) und mit ihm der Zins. Würden Sie nur die Marge eintragen, würde Faktero die Zinsen zu niedrig berechnen.",
  "V zmluve preto pri úrokovej sadzbe zvoľte <0>Pohyblivá</0> a vyplňte:":
    "Wählen Sie deshalb im Vertrag beim Zinssatz <0>Variabel</0> und füllen Sie aus:",
  "<0>Referenčný index</0> — 1M, 3M, 6M alebo 12M EURIBOR, €STR, alebo PRIBOR (1M, 3M, 6M, 1R) pri českých úveroch.":
    "<0>Referenzindex</0> — 1M, 3M, 6M oder 12M EURIBOR, €STR oder PRIBOR (1M, 3M, 6M, 1R) bei tschechischen Krediten.",
  "<0>Marža</0> — prirážka banky tak, ako je v zmluve (po prípadnom zvýhodnení).":
    "<0>Marge</0> — der Aufschlag der Bank so, wie er im Vertrag steht (nach etwaiger Vergünstigung).",
  "<0>Dolná hranica indexu</0> — keď zmluva hovorí, že záporný index sa považuje za nulu, zadajte 0. Bez hranice nechajte prázdne.":
    "<0>Untergrenze des Index</0> — wenn der Vertrag einen negativen Index als null behandelt, geben Sie 0 ein. Ohne Untergrenze lassen Sie das Feld leer.",
  "<0>Sadzba sa mení</0> a <1>index sa určuje</1> — napríklad mesačne, „2 pracovné dni pred začiatkom obdobia fixácie“ (to je najčastejšie znenie), alebo ako priemer za predchádzajúci mesiac.":
    "<0>Zinssatz ändert sich</0> und <1>Index wird festgestellt</1> — zum Beispiel monatlich, „2 Arbeitstage vor Beginn der Zinsperiode“ (die häufigste Formulierung) oder als Durchschnitt des Vormonats.",
  "<0>Výpočet úroku</0> — pri úveroch s EURIBORom banky takmer vždy počítajú „rok s 360 dňami a skutočný počet dní“, teda ACT/360. Pri rovnakej sadzbe vychádza úrok o 1,4 % vyšší než pri ACT/365.":
    "<0>Zinsberechnung</0> — bei Krediten mit EURIBOR rechnen Banken fast immer mit „Jahr mit 360 Tagen und tatsächlicher Anzahl der Tage“, also ACT/360. Beim gleichen Zinssatz fallen die Zinsen um 1,4 % höher aus als bei ACT/365.",
  "Nahratú zmluvu Faktero prečíta samo — index, maržu, dolnú hranicu, fixing aj spôsob výpočtu vyplní do týchto polí.":
    "Einen hochgeladenen Vertrag liest Faktero selbst — Index, Marge, Untergrenze, Fixing und Berechnungsmethode trägt es in diese Felder ein.",
  "Hodnoty indexov si Faktero každé ráno stiahne: <0>EURIBOR</0> z Európskej centrálnej banky, <1>€STR</1> tiež z ECB a <2>PRIBOR</2> z ČNB. Na detaile zmluvy uvidíte napríklad „Aktuálna sadzba: 1M EURIBOR 1,920 % (priemer za september 2026) + marža 4,30 % = 6,22 % p. a.“ a pod tým históriu sadzby po obdobiach.":
    "Die Indexwerte lädt Faktero jeden Morgen: <0>EURIBOR</0> von der Europäischen Zentralbank, <1>€STR</1> ebenfalls von der EZB und <2>PRIBOR</2> von der ČNB. In den Vertragsdetails sehen Sie zum Beispiel „Aktueller Zinssatz: 1M EURIBOR 1,920 % (Durchschnitt September 2026) + Marge 4,30 % = 6,22 % p. a.“ und darunter den Zinssatzverlauf nach Perioden.",
  "<0>Pozor, pri EURIBORe je to odhad.</0> Denný EURIBOR sa zadarmo strojovo získať nedá — verejne dostupný je len mesačný priemer. Zmluva však index berie k presnému dňu fixingu, takže sa vypočítaná sadzba môže od skutočnej líšiť o pár stotín percenta. Skutočný úrok vždy určuje banka. Keď index k dňu fixingu ešte nie je zverejnený, Faktero použije posledný známy a označí výsledok ako predbežný.":
    "<0>Achtung, beim EURIBOR ist das eine Schätzung.</0> Den täglichen EURIBOR gibt es nicht kostenlos maschinenlesbar — öffentlich verfügbar ist nur der Monatsdurchschnitt. Der Vertrag nimmt den Index jedoch zum genauen Fixing-Tag, daher kann der berechnete Zinssatz um einige Hundertstel Prozent vom tatsächlichen abweichen. Die tatsächlichen Zinsen bestimmt immer die Bank. Ist der Index zum Fixing-Tag noch nicht veröffentlicht, verwendet Faktero den letzten bekannten und kennzeichnet das Ergebnis als vorläufig.",
  "Preto sa dá sadzba za každé obdobie <0>zadať ručne</0> (ceruzka v histórii sadzby) — keď vám banka sadzbu oznámi, alebo keď ju chcete zosúladiť so skutočne strhnutým úrokom. Ručná sadzba prepíše vypočítanú za celé obdobie fixácie a dá sa vrátiť späť.":
    "Deshalb lässt sich der Zinssatz für jede Periode <0>manuell eingeben</0> (Stift im Zinssatzverlauf) — wenn die Bank Ihnen den Zinssatz mitteilt oder wenn Sie ihn mit den tatsächlich belasteten Zinsen abgleichen wollen. Der manuelle Zinssatz ersetzt den berechneten für die gesamte Zinsperiode und lässt sich wieder zurücknehmen.",
  "Pri kontokorente Faktero počíta aj <0>vypočítaný úrok</0> za každý mesiac — z čerpania na konci každého dňa (zostatok účtu a pohyby z banky) — a porovná ho s úrokom, ktorý banka naozaj strhla. Rozdiel je najlepšia kontrola: keď sedí na pár centov, sadzba aj fixing sú v poriadku. Keď nesedí, tlačidlom <1>Prevziať sadzbu</1> si uložíte sadzbu, ktorá zo strhnutého úroku vyplýva.":
    "Beim Kontokorrentkredit berechnet Faktero auch die <0>berechneten Zinsen</0> für jeden Monat — aus der Inanspruchnahme am Ende jedes Tages (Kontosaldo und Bankumsätze) — und vergleicht sie mit den Zinsen, die die Bank tatsächlich belastet hat. Die Differenz ist die beste Kontrolle: Stimmt sie auf wenige Cent, sind Zinssatz und Fixing in Ordnung. Stimmt sie nicht, speichern Sie mit der Schaltfläche <1>Zinssatz übernehmen</1> den Zinssatz, der sich aus den belasteten Zinsen ergibt.",
  "Pri splátkovom úvere s pohyblivou sadzbou sa kalendár počíta so sadzbou platnou pri uložení zmluvy. Keď banka po zmene indexu oznámi novú splátku, zmluvu otvorte a uložte — nezaplatené splátky sa prepočítajú s dnešnou sadzbou.":
    "Beim Ratenkredit mit variablem Zinssatz wird der Ratenplan mit dem beim Speichern des Vertrags gültigen Zinssatz berechnet. Wenn die Bank nach einer Indexänderung eine neue Rate mitteilt, öffnen und speichern Sie den Vertrag — offene Raten werden mit dem heutigen Zinssatz neu berechnet.",
};
