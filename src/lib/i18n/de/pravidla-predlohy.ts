// Pravidlá účtovania (e-mail, krajina, VS, pokladňa, rozúčtovanie), predlohy zaúčtovania, účtovné položky a zaokrúhlenie.
export default {
  "E-mail odosielateľa obsahuje": "E-Mail des Absenders enthält",
  "Variabilný symbol (stály, napr. zmluva)": "Verwendungszweck/VS (fest, z. B. Vertrag)",
  "Bez krajiny na doklade platí krajina vašej firmy; VS sa porovnáva len podľa číslic.":
    "Ohne Land auf dem Beleg gilt das Land Ihrer Firma; der VS wird nur nach Ziffern verglichen.",
  "Z dokladu:": "Aus dem Beleg:",
  "e-mail {x}": "E-Mail {x}",
  "VS {x}": "VS {x}",
  "Pokladňa (hotovostný bloček)": "Kasse (Barbeleg)",
  "Rozúčtovanie na položky: doklad sa pri odovzdaní rozdelí na časti s vlastnou predkontáciou v tomto pomere — sumy sa dopočítajú z rozpisu DPH dokladu.":
    "Aufteilung: Der Beleg wird bei der Übergabe in Teile mit eigener Vorkontierung in diesem Verhältnis aufgeteilt — die Beträge werden aus der USt-Aufstellung des Belegs berechnet.",
  "Zmazať predlohu „{nazov}“? Doklady, na ktoré ste ju použili, sa nezmenia.":
    "Vorlage „{nazov}“ löschen? Belege, auf die Sie sie angewendet haben, bleiben unverändert.",
  "Predloha zmazaná.": "Vorlage gelöscht.",
  "Predloha je pomenované zaúčtovanie bez podmienky — napríklad „Nákup PHM – platba kartou“. Sama sa nepoužije; v zaúčtovaní dokladu ju vyberiete cez „Použiť predlohu…“ a doplní predkontáciu, členenie, pokladňu, rad aj poznámku naraz.":
    "Eine Vorlage ist eine benannte Kontierung ohne Bedingung — z. B. „Tanken – Kartenzahlung“. Sie wird nie automatisch angewendet; beim Kontieren eines Belegs wählen Sie sie über „Vorlage anwenden…“ und sie füllt Vorkontierung, Gliederung, Kasse, Nummernkreis und Notiz auf einmal aus.",
  "Nová predloha": "Neue Vorlage",
  "Zatiaľ žiadna predloha.": "Noch keine Vorlage.",
  Predloha: "Vorlage",
  Predlohy: "Vorlagen",
  Pre: "Für",
  "Predloha uložená.": "Vorlage gespeichert.",
  "Predloha pridaná.": "Vorlage hinzugefügt.",
  "Upraviť predlohu": "Vorlage bearbeiten",
  "napr. Nákup PHM – platba kartou": "z. B. Tanken – Kartenzahlung",
  "Ponúkať pri": "Anbieten bei",
  "Predloha zaúčtovania": "Kontierungsvorlage",
  "Použiť predlohu…": "Vorlage anwenden…",
  "Pre tohto dodávateľa už pravidlo je — otvorí sa na úpravu":
    "Für diesen Lieferanten gibt es schon eine Regel — sie wird zur Bearbeitung geöffnet",
  "Ďalší podobný doklad sa zaúčtuje sám": "Der nächste ähnliche Beleg wird automatisch kontiert",
  "Upraviť pravidlo „{nazov}“": "Regel „{nazov}“ bearbeiten",
  "Upraviť pravidlo": "Regel bearbeiten",
  "Vytvoriť pravidlo z tohto dokladu": "Regel aus diesem Beleg erstellen",
  "Zaokrúhlenie zvlášť pre kladné a záporné (prázdne = spoločná predkontácia vyššie)":
    "Rundung getrennt für positiv und negativ (leer = gemeinsame Vorkontierung oben)",
  "Kladné (napr. 548100)": "Positiv (z. B. 548100)",
  "Záporné (napr. 648100)": "Negativ (z. B. 648100)",
  "Predkontácia kladného zaokrúhlenia": "Vorkontierung der positiven Rundung",
  "Predkontácia záporného zaokrúhlenia": "Vorkontierung der negativen Rundung",
  "Členenie DPH kladného zaokrúhlenia": "USt-Gliederung der positiven Rundung",
  "Členenie DPH záporného zaokrúhlenia": "USt-Gliederung der negativen Rundung",
  "Členenie KV kladného zaokrúhlenia": "Kontrollmeldungs-Gliederung der positiven Rundung",
  "Členenie KV záporného zaokrúhlenia": "Kontrollmeldungs-Gliederung der negativen Rundung",
  "KV: nezadané": "KM: nicht angegeben",
  "Kladné je, keď je suma dokladu vyššia než súčet položiek, záporné naopak. Pri exporte do Pohody sa vyberie podľa znamienka rozdielu.":
    "Positiv ist es, wenn der Belegbetrag höher als die Summe der Positionen ist, negativ umgekehrt. Beim Export nach Pohoda wird nach dem Vorzeichen der Differenz gewählt.",
  "Typ platby": "Zahlungsart",
  "Všetky platby": "Alle Zahlungsarten",
  "Všetky doklady": "Alle Belege",
  "Pri doklade s rovnakým typom a platbou sa táto položka ponúkne medzi prvými — napr. „Nákup PHM – platba kartou“ len pri bločku platenom kartou.":
    "Bei einem Beleg mit gleicher Art und Zahlung wird diese Position zuerst angeboten — z. B. „Tanken – Kartenzahlung“ nur bei einem mit Karte bezahlten Kassenbon.",
  "Krajina dodávateľa": "Land des Lieferanten",
  "Krajina je dvojpísmenový kód, napr. SK alebo CZ.":
    "Das Land ist ein zweibuchstabiger Code, z. B. SK oder CZ.",
  "Variabilný symbol musí mať číslice.": "Der Verwendungszweck/VS muss Ziffern enthalten.",
  "Rozúčtovanie nesedí — časti musia dať spolu 100 % a každá potrebuje predkontáciu.":
    "Die Aufteilung stimmt nicht — die Teile müssen zusammen 100 % ergeben und jeder braucht eine Vorkontierung.",
  "Vyplňte aspoň jednu podmienku — IČO, názov dodávateľa, typ, spôsob úhrady, používateľa, e-mail, krajinu alebo variabilný symbol.":
    "Füllen Sie mindestens eine Bedingung aus — IČO, Lieferantenname, Art, Zahlungsart, Benutzer, E-Mail, Land oder Verwendungszweck.",
  "Predloha potrebuje názov.": "Die Vorlage braucht einen Namen.",
  "Názov má najviac 120 znakov.": "Der Name hat höchstens 120 Zeichen.",
  "Vyplňte aspoň jednu vec, ktorú má predloha doplniť.":
    "Füllen Sie mindestens eine Angabe aus, die die Vorlage ergänzen soll.",
  "Poznámka má najviac 240 znakov.": "Die Notiz hat höchstens 240 Zeichen.",
  // Manuál Automatické zaúčtovanie — sekcia o pravidlách a predlohách.
  "Pravidlá, predlohy a pravidlo z dokladu": "Regeln, Vorlagen und Regel aus dem Beleg",
  "Pravidlo platí, keď na doklad sedia všetky vyplnené podmienky: dodávateľ (IČO alebo časť názvu), typ faktúry, spôsob úhrady, kto doklad nahral, predmet e-mailu, <0>e-mail odosielateľa</0> (napr. <1>@telekom.sk</1>), <2>krajina dodávateľa</2> (bez nej na doklade platí krajina vašej firmy) a pri prijatej faktúre <3>stály variabilný symbol</3> — zmluva s operátorom či energiami. Pravidlo podľa partnera alebo VS má prednosť pred ostatnými.":
    "Eine Regel gilt, wenn auf den Beleg alle ausgefüllten Bedingungen zutreffen: Lieferant (IČO oder Teil des Namens), Rechnungsart, Zahlungsart, wer den Beleg hochgeladen hat, E-Mail-Betreff, <0>E-Mail des Absenders</0> (z. B. <1>@telekom.sk</1>), <2>Land des Lieferanten</2> (ohne Angabe auf dem Beleg gilt das Land Ihrer Firma) und bei Eingangsrechnungen ein <3>fester Verwendungszweck (VS)</3> — Vertrag mit Telefon- oder Energieanbieter. Eine Regel nach Partner oder VS hat Vorrang vor den übrigen.",
  "Okrem predkontácie, členenia DPH a KV vie pravidlo bločku nastaviť <0>pokladňu</0> a doklad <1>rozúčtovať pomerom</1> (napr. 80 % náklad s odpočtom, 20 % bez odpočtu) — sumy sa dopočítajú pri odovzdaní z rozpisu DPH.":
    "Neben Vorkontierung, USt- und KM-Gliederung kann eine Regel beim Kassenbon die <0>Kasse</0> festlegen und den Beleg <1>im Verhältnis aufteilen</1> (z. B. 80 % Aufwand mit Vorsteuerabzug, 20 % ohne) — die Beträge werden bei der Übergabe aus der USt-Aufstellung berechnet.",
  "<0>Predloha</0> (záložka Predlohy v Pravidlách účtovania) je pomenované zaúčtovanie bez podmienky, napríklad „Nákup PHM – platba kartou“. Sama sa nepoužije — pri doklade ju vyberiete cez „Použiť predlohu…“ a doplní kódy, pokladňu, rad aj poznámku naraz.":
    "Eine <0>Vorlage</0> (Reiter Vorlagen in den Kontierungsregeln) ist eine benannte Kontierung ohne Bedingung, z. B. „Tanken – Kartenzahlung“. Sie wird nie automatisch angewendet — beim Beleg wählen Sie sie über „Vorlage anwenden…“ und sie füllt Codes, Kasse, Nummernkreis und Notiz auf einmal aus.",
  "V Nespracovaných dokladoch (vedľa tlačidla Vytvoriť) a pri zaúčtovaní prijatej faktúry či bločku je <0>Vytvoriť pravidlo z tohto dokladu</0>: predvyplní dodávateľa, kódy a ponúkne e-mail a VS z dokladu. Keď podobné pravidlo už máte, otvorí sa to — nevznikne druhé.":
    "In den unverarbeiteten Belegen (neben der Schaltfläche Erstellen) und beim Kontieren einer Eingangsrechnung oder eines Kassenbons gibt es <0>Regel aus diesem Beleg erstellen</0>: Sie füllt Lieferant und Codes vor und bietet E-Mail und VS aus dem Beleg an. Gibt es schon eine ähnliche Regel, wird diese geöffnet — es entsteht keine zweite.",
};
