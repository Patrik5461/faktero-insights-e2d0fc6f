// Nemecký preklad manuálu v Pomoci (src/routes/pomoc.nastavenia.tsx). Kľúče vyrába pomoc-preklad.test.tsx.
export default {
  "Pomoc — Nastavenia firmy — Faktero": "Hilfe — Unternehmenseinstellungen — Faktero",
  "Údaje firmy, logo a farba na faktúre, číslovanie dokladov a e-mailové šablóny — čo kde nastaviť a čo sa tým zmení.":
    "Unternehmensdaten, Logo und Farbe auf der Rechnung, Belegnummerierung und E-Mail-Vorlagen — was wo eingestellt wird und was sich dadurch ändert.",
  "Údaje firmy, vzhľad faktúry, číslovanie a e-mailové šablóny.":
    "Unternehmensdaten, Rechnungslayout, Nummerierung und E-Mail-Vorlagen.",
  "Pomoc · Nastavenia": "Hilfe · Einstellungen",
  "Nastavenia firmy": "Unternehmenseinstellungen",
  "Štyri obrazovky, ktoré sa oplatí prejsť hneď na začiatku: údaje firmy, číslovanie, vzhľad faktúry a e-mailové šablóny. Nastavia sa raz a potom už do nich nikto nechodí.":
    "Vier Bildschirme, die sich gleich zu Beginn lohnen: Unternehmensdaten, Nummerierung, Rechnungslayout und E-Mail-Vorlagen. Sie werden einmal eingerichtet, danach muss niemand mehr hinein.",
  "Údaje firmy": "Unternehmensdaten",
  "<0>Firma → Údaje</0> je jediné miesto, odkiaľ sa berú údaje na doklady. Čo je tu, to je na faktúre — meniť to na jednotlivom doklade sa nedá, a je to zámer: dve rôzne adresy na dvoch faktúrach tej istej firmy sú problém pri kontrole.":
    "<0>Unternehmen → Daten</0> ist die einzige Stelle, aus der die Daten für Belege übernommen werden. Was hier steht, steht auf der Rechnung — auf einem einzelnen Beleg lässt es sich nicht ändern, und das ist Absicht: zwei verschiedene Adressen auf zwei Rechnungen desselben Unternehmens sind bei einer Prüfung ein Problem.",
  "<0>Názov, IČO, DIČ, IČ DPH</0> — pri zakladaní firmy sa doplnia podľa IČO z registra, takže ich stačí skontrolovať.":
    "<0>Name, Firmen-ID (IČO), Steuernummer (DIČ), USt-IdNr.</0> — beim Anlegen des Unternehmens werden sie anhand der IČO aus dem Register ergänzt, Sie müssen sie also nur prüfen.",
  "<0>Adresa, e-mail, telefón, web</0> — tlačia sa v hlavičke dokladu.":
    "<0>Adresse, E-Mail, Telefon, Website</0> — werden im Kopf des Belegs gedruckt.",
  "<0>IBAN a SWIFT/BIC</0> — bez IBAN-u sa na faktúru nevytlačí platobný QR kód. Je to najčastejšia príčina, prečo QR na doklade chýba.":
    "<0>IBAN und SWIFT/BIC</0> — ohne IBAN wird kein Zahlungs-QR-Code auf die Rechnung gedruckt. Das ist der häufigste Grund, warum der QR-Code auf dem Beleg fehlt.",
  "<0>Mena</0> — predvolená mena nových dokladov. Na doklade sa dá zmeniť.":
    "<0>Währung</0> — Standardwährung neuer Belege. Auf dem Beleg lässt sie sich ändern.",
  "Sadzby DPH sa nenastavujú — Faktero ich ponúka podľa krajiny firmy (SR 23 / 19 / 5 / 0 %, ČR 21 / 12 / 0 %).":
    "MwSt.-Sätze werden nicht eingestellt — Faktero bietet sie je nach Land des Unternehmens an (SK 23 / 19 / 5 / 0 %, CZ 21 / 12 / 0 %).",
  "Číslovanie dokladov": "Belegnummerierung",
  "Číselné rady sa spravujú v <0>Nastavenia → Číselné rady</0>. Rad je šablóna čísla viazaná na druh dokladu — faktúra, zálohová faktúra, dobropis, doklad k prijatej platbe, cenová ponuka, prijatá objednávka, objednávka u dodávateľa a pokladničný doklad.":
    "Nummernkreise werden unter <0>Einstellungen → Nummernkreise</0> verwaltet. Ein Nummernkreis ist eine Nummernvorlage, die an eine Belegart gebunden ist — Rechnung, Anzahlungsrechnung, Gutschrift, Steuerbeleg zur Zahlung, Angebot, eingegangene Bestellung, Bestellung beim Lieferanten und Kassenbeleg.",
  "<0>Pri vystavovaní si rad vyberiete</0> — rozbaľovacie menu je na faktúre, cenovej ponuke, prijatej objednávke, objednávke u dodávateľa, pokladničnom doklade aj na šablóne opakovanej faktúry. Predvolený rad je prvý, takže kto nič nemení, nič navyše nerobí. Doklad si uloží, z ktorého radu číslo dostal.":
    "<0>Beim Ausstellen wählen Sie den Nummernkreis</0> — das Auswahlmenü gibt es auf der Rechnung, dem Angebot, der eingegangenen Bestellung, der Bestellung beim Lieferanten, dem Kassenbeleg und auf der Vorlage der wiederkehrenden Rechnung. Der Standard-Nummernkreis steht an erster Stelle, wer also nichts ändert, hat keinen Mehraufwand. Der Beleg speichert, aus welchem Nummernkreis er seine Nummer erhalten hat.",
  "Na jeden druh môžete mať <0>viac radov</0> (pobočka, prevádzka, oddelený rad) a pri vystavovaní faktúry si vyberiete, z ktorého sa číslo vezme. Jeden rad je <1>predvolený</1> — z neho číslujú cesty, ktoré sa nepýtajú: appka, API aj opakované faktúry.":
    "Für eine Belegart können Sie <0>mehrere Nummernkreise</0> haben (Filiale, Betriebsstätte, separater Kreis) und beim Ausstellen der Rechnung wählen, aus welchem die Nummer stammt. Ein Nummernkreis ist <1>Standard</1> — aus ihm nummerieren die Wege, die nicht nachfragen: App, API und wiederkehrende Rechnungen.",
  "Tvar čísla sa vyberá zo <0>zoznamu vzorov</0>, kde je pri každom rovno vidieť výsledné číslo — 20260001, 202609001 (mesačný reset), 2026/001 a podobne. Predpona sa prispôsobí druhu dokladu, takže zálohová faktúra ponúka „ZF…“ a pokladňa „PD…“.":
    "Das Nummernformat wählen Sie aus einer <0>Liste von Mustern</0>, bei denen jeweils direkt die resultierende Nummer zu sehen ist — 20260001, 202609001 (monatlicher Reset), 2026/001 und ähnlich. Das Präfix passt sich der Belegart an, die Anzahlungsrechnung bietet also „ZF…“ und die Kasse „PD…“ an.",
  "Keď vám žiadny vzor nesedí, vyberte <0>Vlastná šablóna…</0> a napíšte si číslo tak, ako ho chcete mať — aj s medzerami či vlastným textom. Doplní sa len poradie, keď ho vynecháte (na koniec ako {NNNN}), a jednomiestne {N} sa rozšíri na dve číslice, aby po deviatich dokladoch nepretieklo; formulár to povie vopred. V šablóne sa dajú použiť tokeny <1>{YYYY}</1> rok, <2>{YY}</2> rok dvojčíslím, <3>{MM}</3> mesiac a <4>{NN}</4> až <5>{NNNNNN}</5> poradie, kde počet písmen N určuje počet číslic. Text okolo tokenov je predpona, napríklad <6>TT{YYYY}{NNN}</6> → <7>TT2026001</7>. Keď je v šablóne mesiac, poradie sa resetuje mesačne, inak ročne — obrazovka to pri každom rade ukáže aj s prvým číslom.":
    "Wenn kein Muster passt, wählen Sie <0>Eigene Vorlage…</0> und schreiben die Nummer so, wie Sie sie haben möchten — auch mit Leerzeichen oder eigenem Text. Ergänzt wird nur die laufende Nummer, wenn Sie sie weglassen (am Ende als {NNNN}), und ein einstelliges {N} wird auf zwei Ziffern erweitert, damit es nach neun Belegen nicht überläuft; das Formular weist vorab darauf hin. In der Vorlage können Sie die Token <1>{YYYY}</1> Jahr, <2>{YY}</2> zweistelliges Jahr, <3>{MM}</3> Monat und <4>{NN}</4> bis <5>{NNNNNN}</5> laufende Nummer verwenden, wobei die Anzahl der Buchstaben N die Anzahl der Ziffern bestimmt. Der Text um die Token ist das Präfix, zum Beispiel <6>TT{YYYY}{NNN}</6> → <7>TT2026001</7>. Enthält die Vorlage den Monat, wird die laufende Nummer monatlich zurückgesetzt, sonst jährlich — der Bildschirm zeigt das bei jedem Nummernkreis samt der ersten Nummer an.",
  "Číslo sa neskladá počítaním riadkov, ale z radu — vďaka tomu nevznikne diera, keď sa doklad zmaže, a dve faktúry vystavené naraz nedostanú to isté číslo. Rad, z ktorého už doklady visia, sa <0>zmazať nedá</0>: dá sa len vypnúť, aby sa prestal ponúkať.":
    "Die Nummer wird nicht durch Zählen von Zeilen gebildet, sondern aus dem Nummernkreis — dadurch entsteht keine Lücke, wenn ein Beleg gelöscht wird, und zwei gleichzeitig ausgestellte Rechnungen erhalten nicht dieselbe Nummer. Ein Nummernkreis, an dem bereits Belege hängen, lässt sich <0>nicht löschen</0>: Er kann nur deaktiviert werden, damit er nicht mehr angeboten wird.",
  "Keď ste rady nikdy nenastavovali, nič sa nemení — pri prvom doklade sa rad založí presne z tvaru, ktorý ste mali dovtedy.":
    "Wenn Sie nie Nummernkreise eingerichtet haben, ändert sich nichts — beim ersten Beleg wird der Nummernkreis genau im bisherigen Format angelegt.",
  "Faktúry vystavené v telefóne bez signálu si číslo rezervujú dopredu. Keď taká faktúra dorazí neskôr, zapadne presne na svoje miesto.":
    "Rechnungen, die auf dem Telefon ohne Empfang ausgestellt werden, reservieren ihre Nummer im Voraus. Kommt eine solche Rechnung später an, fügt sie sich genau an ihrer Stelle ein.",
  "<0>Nastavenia → Vzhľad faktúry</0> mení PDF, ktoré vidí odberateľ:":
    "<0>Einstellungen → Rechnungslayout</0> ändert das PDF, das der Kunde sieht:",
  "<0>Logo firmy</0> — nahrá sa raz a je na každom doklade.":
    "<0>Firmenlogo</0> — wird einmal hochgeladen und erscheint auf jedem Beleg.",
  "<0>Farba akcentu</0> — čiary a nadpisy v doklade.":
    "<0>Akzentfarbe</0> — Linien und Überschriften im Beleg.",
  "<0>Pätička dokladu</0> — miesto na zápis v obchodnom registri, poznámku o prenesení daňovej povinnosti alebo poďakovanie.":
    "<0>Belegfußzeile</0> — Platz für den Handelsregistereintrag, einen Hinweis auf Reverse-Charge oder einen Dank.",
  "Zmena sa prejaví na novo vygenerovaných PDF. Doklad, ktorý už odišiel e-mailom, sa spätne neprekresľuje.":
    "Die Änderung wirkt sich auf neu erzeugte PDFs aus. Ein Beleg, der bereits per E-Mail verschickt wurde, wird nachträglich nicht neu gezeichnet.",
  "<0>Nastavenia → E-mailové šablóny</0> určujú, čo príde odberateľovi spolu s PDF — zvlášť pre faktúru, ponuku aj upomienku. Do textu sa dajú vložiť premenné (číslo dokladu, suma, splatnosť), takže sa nič neprepisuje ručne.":
    "<0>Einstellungen → E-Mail-Vorlagen</0> bestimmen, was der Kunde zusammen mit dem PDF erhält — getrennt für Rechnung, Angebot und Mahnung. In den Text lassen sich Variablen einfügen (Belegnummer, Betrag, Fälligkeit), sodass nichts manuell umgeschrieben werden muss.",
  "<0>Meno odosielateľa</0> a <1>Odpovedať na (Reply-To)</1> sa nastavujú pri údajoch firmy. Odosiela sa z adresy Faktera, ale odpoveď príde vám — to je dôvod, prečo Reply-To netreba nechať prázdne.":
    "<0>Absendername</0> und <1>Antworten an (Reply-To)</1> werden bei den Unternehmensdaten eingestellt. Gesendet wird von einer Faktero-Adresse, die Antwort kommt aber bei Ihnen an — deshalb sollte Reply-To nicht leer bleiben.",
  "<0>Odosielanie z vlastnej adresy.</0> V <1>Nastavenia → Firma</1> nastavíte vlastný SMTP server (Gmail, Microsoft 365, WebSupport, Seznam či server vašej domény). Faktúry, upomienky, cenové ponuky, samofaktúry a podklady pre účtovníka potom prídu z vašej adresy, napr. faktury@vasafirma.sk. Nastaviť to môže majiteľ alebo admin firmy; po uložení príde skúšobný mail a zapne sa len vtedy, keď prejde. Heslo je uložené zašifrované — pri Gmaile a Microsoft 365 použite heslo aplikácie. Keby váš server niekedy zlyhal, mail odíde cez Faktero a chyba sa ukáže pri nastavení.":
    "<0>Versand von eigener Adresse.</0> Unter <1>Einstellungen → Unternehmen</1> richten Sie einen eigenen SMTP-Server ein (Gmail, Microsoft 365, WebSupport, Seznam oder den Server Ihrer Domain). Rechnungen, Mahnungen, Angebote, Gutschriften im Gutschriftverfahren und Unterlagen für den Buchhalter kommen dann von Ihrer Adresse, z. B. faktury@vasafirma.sk. Einrichten kann das der Inhaber oder Admin des Unternehmens; nach dem Speichern kommt eine Test-E-Mail, und die Funktion wird nur aktiviert, wenn sie ankommt. Das Passwort wird verschlüsselt gespeichert — bei Gmail und Microsoft 365 verwenden Sie ein App-Passwort. Sollte Ihr Server einmal ausfallen, geht die E-Mail über Faktero hinaus und der Fehler wird in den Einstellungen angezeigt.",
  "Shoptet a Zásielkovňa": "Shoptet und Zásielkovňa",
  "V <0>Nastavenia → E-shop a doprava</0> pripojíte Shoptet a Zásielkovňu. Nastaviť to môže majiteľ alebo admin firmy; tokeny a heslá sú uložené zašifrované.":
    "Unter <0>Einstellungen → E-Shop und Versand</0> verbinden Sie Shoptet und Zásielkovňa. Einrichten kann das der Inhaber oder Admin des Unternehmens; Tokens und Passwörter werden verschlüsselt gespeichert.",
  "<0>Shoptet</0> — súkromný API token (Shoptet tarif Premium, v administrácii Prepojenia → API partneri; stačí skupina Objednávky na čítanie). Potom sa na tej istej stránke načítajú objednávky za zvolené obdobie a z vybraných vystavíte faktúry: odberateľ s IČO a IČ DPH, položky, doprava a zľavy so sumami presne z obchodu, číslo objednávky na faktúre. Zaplatená objednávka sa označí ako uhradená, dobierka má splatnosť v deň vystavenia. Tá istá objednávka faktúru druhýkrát nedostane.":
    "<0>Shoptet</0> — privater API-Token (Shoptet-Tarif Premium, in der Administration unter Prepojenia → API partneri; die Gruppe Bestellungen mit Lesezugriff genügt). Danach werden auf derselben Seite die Bestellungen für den gewählten Zeitraum geladen, und aus den ausgewählten stellen Sie Rechnungen aus: Kunde mit IČO und USt-IdNr., Positionen, Versand und Rabatte mit Beträgen exakt aus dem Shop, Bestellnummer auf der Rechnung. Eine bezahlte Bestellung wird als bezahlt markiert, Nachnahme hat die Fälligkeit am Tag der Ausstellung. Dieselbe Bestellung erhält keine zweite Rechnung.",
  "<0>Zásielkovňa</0> — API heslo z klientskej sekcie Zásielkovne. Na detaile faktúry je potom tlačidlo <1>Poslať cez Zásielkovňu</1>: výdajné miesto vyberiete na mape (alebo zadáte id dopravcu pri doručení na adresu), hmotnosť a dobierku vo výške faktúry. Štítok stiahnete ako PDF a stav zásielky si viete kedykoľvek obnoviť. Vybrané dobierky nahráte z exportu faktúr Packety v <2>Účtovníctvo → Výpis z platobnej brány</2>.":
    "<0>Zásielkovňa</0> — API-Passwort aus dem Kundenbereich von Zásielkovňa. In der Rechnungsdetailansicht gibt es dann die Schaltfläche <1>Über Zásielkovňa senden</1>: Die Abholstelle wählen Sie auf der Karte (oder geben bei Zustellung an die Adresse die Spediteur-ID ein), dazu Gewicht und Nachnahme in Höhe der Rechnung. Das Etikett laden Sie als PDF herunter, den Sendungsstatus können Sie jederzeit aktualisieren. Eingezogene Nachnahmen laden Sie aus dem Rechnungsexport von Packeta unter <2>Buchhaltung → Auszug des Zahlungsanbieters</2> hoch.",
  "Fakturácia, kniha jázd, alebo oboje": "Fakturierung, Fahrtenbuch oder beides",
  "V <0>Nastaveniach účtu</0> sa prepína, čo v aplikácii vidíte: fakturačný systém, knihu jázd, alebo oboje. Voľba mení celé menu — kto vedie len jazdy, nemá dôvod pozerať sa na faktúry.":
    "In den <0>Kontoeinstellungen</0> legen Sie fest, was Sie in der Anwendung sehen: das Fakturierungssystem, das Fahrtenbuch oder beides. Die Auswahl ändert das gesamte Menü — wer nur Fahrten erfasst, braucht keine Rechnungen zu sehen.",
  "Prepnúť sa dá kedykoľvek a o dáta sa tým nepríde. Ceny sú na <0>cenníku</0>.":
    "Umschalten können Sie jederzeit, Daten gehen dabei nicht verloren. Die Preise stehen in der <0>Preisliste</0>.",
  "Kto smie nastavenia meniť": "Wer Einstellungen ändern darf",
  "Údaje firmy, vzhľad dokladu a číslovanie mení <0>majiteľ a administrátor</0>. Účtovník vedie doklady v plnom rozsahu, ale do nastavení firmy, bankových účtov ani API kľúčov nevidí.":
    "Unternehmensdaten, Beleglayout und Nummerierung ändern <0>Inhaber und Administrator</0>. Der Buchhalter führt die Belege in vollem Umfang, sieht aber weder die Unternehmenseinstellungen noch Bankkonten oder API-Schlüssel.",
  "Podrobne je to v manuáli <0>Role a prístupy</0>.":
    "Ausführlich steht das im Handbuch <0>Rollen und Zugriffe</0>.",
  "Postavenie k DPH": "Umsatzsteuerlicher Status",
  "V údajoch firmy sa zaškrtáva <0>Firma je platiteľ DPH</0> a vyberá typ registrácie — § 4, § 4b alebo § 5 pre platiteľa, § 7, § 7a alebo bez registrácie pre ostatných. Z registra sa ťahá len IČ DPH, paragraf v ňom nie je.":
    "In den Unternehmensdaten aktivieren Sie <0>Unternehmen ist umsatzsteuerpflichtig</0> und wählen die Art der Registrierung — § 4, § 4b oder § 5 für umsatzsteuerpflichtige Unternehmen, § 7, § 7a oder ohne Registrierung für die übrigen. Aus dem Register wird nur die USt-IdNr. übernommen, der Paragraf steht dort nicht.",
  "Voľba rozhoduje o tom, či sa v dokladoch ponúkajú sadzby DPH a aká veta pribudne na faktúru. Podrobnosti sú v <0>manuáli k DPH</0>.":
    "Die Auswahl entscheidet, ob in den Belegen MwSt.-Sätze angeboten werden und welcher Hinweis auf der Rechnung erscheint. Einzelheiten stehen im <0>Handbuch zur MwSt.</0>.",
  "Bankové účty firmy": "Bankkonten des Unternehmens",
  "Účtov môže byť viac — jeden je predvolený a pri vystavovaní faktúry sa dá prehodiť. Faktúra si vybraný účet zapamätá, takže neskoršia zmena predvoleného účtu staré doklady neprepíše.":
    "Es kann mehrere Konten geben — eines ist Standard und lässt sich beim Ausstellen der Rechnung wechseln. Die Rechnung merkt sich das gewählte Konto, sodass eine spätere Änderung des Standardkontos alte Belege nicht überschreibt.",
} satisfies Record<string, string>;
