// Tankkarten (Shell, DKV, Eurowag, OMV): Fuhrpark → Tankkarten, Fahrzeugkosten und Hilfe.
export default {
  "Palivové karty — Faktero": "Tankkarten — Faktero",
  "Palivové karty": "Tankkarten",
  "Nákupy palivovými kartami: tankovania s tachometrom k vozidlám, náklady vozidiel a mesačná faktúra ako prijatá faktúra s rozpisom. Karty s API (Shell) sa načítajú samy, pri kartách bez API (Up Déjeuner) nahráte mesačný výpis.":
    "Einkäufe mit Tankkarten: Tankvorgänge mit Kilometerstand zu den Fahrzeugen, Fahrzeugkosten und die Monatsrechnung als Eingangsrechnung mit Aufstellung. Karten mit API (Shell) werden automatisch übernommen, bei Karten ohne API (Up Déjeuner) laden Sie die Monatsabrechnung hoch.",
  "Odpojiť {nazov}? Zmaže sa prihlásenie a evidencia nákupov kartou. Tankovania a prijaté faktúry ostanú.":
    "{nazov} trennen? Die Zugangsdaten und die Liste der Karteneinkäufe werden gelöscht. Tankvorgänge und Eingangsrechnungen bleiben erhalten.",
  "Uložené — upravených nákupov: {n}": "Gespeichert — geänderte Einkäufe: {n}",
  "Pri {n} nákupoch kartou je vo Fakteri aj bloček z pumpy s rovnakým dňom a sumou. Daňovým dokladom je faktúra od vydavateľa karty — bloček nezaúčtujte, inak bude náklad aj DPH dvakrát.":
    "Bei {n} Karteneinkäufen gibt es in Faktero auch einen Tankstellenbeleg mit gleichem Tag und Betrag. Steuerbeleg ist die Rechnung des Kartenausstellers — buchen Sie den Beleg nicht, sonst sind Aufwand und Vorsteuer doppelt.",
  "Pripojené karty": "Verbundene Karten",
  "Zatiaľ žiadna. Vyberte poskytovateľa nižšie.": "Noch keine. Wählen Sie unten einen Anbieter.",
  "Payer number": "Payer-Nummer",
  "Client ID": "Client-ID",
  "Client secret": "Client Secret",
  "Account number": "Kontonummer (Account number)",
  "Posledná synchronizácia": "Letzte Synchronisierung",
  "Mesačná faktúra ako prijatá faktúra": "Monatsrechnung als Eingangsrechnung",
  "Len tankovania, bez dokladov": "Nur Tankvorgänge, ohne Belege",
  "Každú noc": "Jede Nacht",
  "Synchronizovať teraz": "Jetzt synchronisieren",
  "Upraviť prístup": "Zugang bearbeiten",
  "Pripojiť palivovú kartu": "Tankkarte verbinden",
  "Dokumentácia API": "API-Dokumentation",
  "Karty a vozidlá": "Karten und Fahrzeuge",
  "Karta sa k vozidlu priradí sama podľa ŠPZ, ktorú má vydavateľ pri karte. Kartu vodiča alebo kartu bez ŠPZ priraďte ručne.":
    "Die Karte wird dem Fahrzeug automatisch über das Kennzeichen zugeordnet, das der Aussteller zur Karte führt. Fahrerkarten oder Karten ohne Kennzeichen ordnen Sie manuell zu.",
  "Vozidlo karty {karta}": "Fahrzeug der Karte {karta}",
  "Posledné nákupy kartou": "Letzte Karteneinkäufe",
  Nákup: "Einkauf",
  Tachometer: "Kilometerstand",
  "čaká na faktúru": "wartet auf Rechnung",
  "aj bloček": "auch Beleg",
  "Priebeh synchronizácie": "Synchronisierungsverlauf",
  Nové: "Neu",
  Obmedzené: "Eingeschränkt",
  Vypnuté: "Ausgeschaltet",
  Pripravujeme: "In Vorbereitung",
  "Pripojenie funguje a je uložené": "Die Verbindung funktioniert und ist gespeichert",
  "Upraviť prístup — {nazov}": "Zugang bearbeiten — {nazov}",
  "Pripojiť {nazov}": "{nazov} verbinden",
  "nechať uložené": "gespeicherten Wert behalten",
  "Overiť a uložiť": "Prüfen und speichern",
  "Bločky a prijaté faktúry, pri ktorých je vybrané toto vozidlo, a nákupy palivovou kartou. Sumy bez DPH.":
    "Belege und Eingangsrechnungen mit diesem Fahrzeug sowie Tankkarteneinkäufe. Beträge netto.",
  "palivová karta": "Tankkarte",
  Prostredie: "Umgebung",
  "Ostré (api.shell.com)": "Produktiv (api.shell.com)",
  "Testovacie (api-test.shell.com)": "Test (api-test.shell.com)",
  "ColCo kód": "ColCo-Code",
  "IČO dodávateľa na faktúre": "Firmennummer (IČO) des Lieferanten auf der Rechnung",
  "Číslo platiteľa z faktúry Shell (napr. SK00123456).":
    "Zahlernummer von der Shell-Rechnung (z. B. SK00123456).",
  "Len ak chcete načítať iba jeden účet platiteľa. Prázdne = všetky účty.":
    "Nur wenn Sie nur ein Konto des Zahlers laden möchten. Leer = alle Konten.",
  "Kód spoločnosti Shell, ktorá kartu vydala. Vyplňte, len ak ho Shell uviedol pri vydaní prístupu.":
    "Code der Shell-Gesellschaft, die die Karte ausgestellt hat. Nur ausfüllen, wenn Shell ihn beim Zugang angegeben hat.",
  "IČO spoločnosti Shell z hlavičky faktúry — prijaté faktúry ho dostanú do adresára.":
    "Firmennummer der Shell-Gesellschaft aus dem Rechnungskopf — die Eingangsrechnungen erhalten sie für das Adressbuch.",
  "Prístup do API vydáva Shell na požiadanie: v Shell Card Online alebo cez obchodníka požiadajte o B2B Mobility API (Transaction Data a Invoice). Shell pošle e-mailom client ID a client secret. Payer number nájdete na faktúre Shell alebo v Shell Card Online.":
    "Den API-Zugang vergibt Shell auf Anfrage: Beantragen Sie in Shell Card Online oder über Ihren Ansprechpartner die B2B Mobility API (Transaction Data und Invoice). Shell sendet Client-ID und Client Secret per E-Mail. Die Payer-Nummer steht auf der Shell-Rechnung oder in Shell Card Online.",
  "DKV má API portál (Azure API Management) s rozhraniami Transaction Service (vyúčtované aj nevyúčtované transakcie), Masterdata Service (karty, boxy) a Toll Service. Zákazník sa zaregistruje na api-portal.dkv-mobility.com, požiada o odber produktu Transaction Service a DKV ho priradí k svojmu zákazníckemu číslu. Faktúry cez API nie sú — prichádzajú e-mailom (PDF/e-faktúra) a spracujú sa ako prijaté doklady.":
    "DKV hat ein API-Portal (Azure API Management) mit Transaction Service (abgerechnete und nicht abgerechnete Transaktionen), Masterdata Service (Karten, Boxen) und Toll Service. Kunden registrieren sich auf api-portal.dkv-mobility.com, abonnieren das Produkt Transaction Service und DKV ordnet es ihrer Kundennummer zu. Rechnungen gibt es nicht per API — sie kommen per E-Mail (PDF/E-Rechnung) und werden als Eingangsbelege verarbeitet.",
  "Eurowag dáva dáta o transakciách v klientskej zóne a na požiadanie cez API — prístup treba vyžiadať u obchodníka Eurowag.":
    "Eurowag stellt Transaktionsdaten im Kundenbereich und auf Anfrage per API bereit — den Zugang beantragen Sie bei Ihrem Eurowag-Ansprechpartner.",
  "Karty OMV patria do siete Routex; transakcie sú v portáli OMV eSolutions, export dát cez API alebo súbor treba vyžiadať u OMV.":
    "OMV-Karten gehören zum Routex-Netz; die Transaktionen sind im Portal OMV eSolutions, einen Datenexport per API oder Datei beantragen Sie bei OMV.",
  "Palivové karty (Shell)": "Tankkarten (Shell)",
  "Vo <0>Vozovom parku → Palivové karty</0> pripojíte kartu Shell. Od Shellu potrebujete prístup k B2B Mobility API (client ID a client secret, vydáva ich Shell na požiadanie) a payer number z faktúry. Pripojiť ju smie majiteľ alebo správca firmy; prístupové údaje sú uložené zašifrované a späť sa už neukážu.":
    "Unter <0>Fuhrpark → Tankkarten</0> verbinden Sie die Shell-Karte. Von Shell brauchen Sie Zugang zur B2B Mobility API (Client-ID und Client Secret, Shell vergibt sie auf Anfrage) und die Payer-Nummer von der Rechnung. Verbinden darf sie der Inhaber oder ein Administrator der Firma; die Zugangsdaten werden verschlüsselt gespeichert und nicht mehr angezeigt.",
  "Nákupy kartou sa načítajú každú noc aj tlačidlom <0>Synchronizovať teraz</0> (pri prvom pripojení za posledné 3 mesiace). Karta sa k vozidlu priradí sama podľa ŠPZ, ktorú má Shell pri karte; kartu vodiča priradíte ručne. Tankovanie sa zapíše k vozidlu aj so stavom tachometra, ktorý vodič zadal pri platbe, a nákup sa pripočíta k nákladom vozidla.":
    "Karteneinkäufe werden jede Nacht und über die Schaltfläche <0>Jetzt synchronisieren</0> geladen (beim ersten Verbinden für die letzten 3 Monate). Die Karte wird dem Fahrzeug automatisch über das Kennzeichen zugeordnet, das Shell zur Karte führt; Fahrerkarten ordnen Sie manuell zu. Der Tankvorgang wird beim Fahrzeug mit dem Kilometerstand gespeichert, den der Fahrer beim Bezahlen eingegeben hat, und der Einkauf zu den Fahrzeugkosten gezählt.",
  "Účtovným dokladom je <0>faktúra od Shellu</0>, nie jednotlivé tankovania — pri nákupe kartou je daňovým dokladom faktúra vydavateľa karty. Každá faktúra sa preto založí ako jedna prijatá faktúra s rozpisom nákupov po riadkoch (dátum, palivo, ŠPZ, pumpa). Poplatky za karty dorovná samostatný riadok, aby suma sedela s faktúrou. Nákupy v zahraničí idú do nákladu celou sumou, lebo cudziu DPH si doma neodpočítate.":
    "Buchungsbeleg ist die <0>Rechnung von Shell</0>, nicht der einzelne Tankvorgang — beim Kauf mit Karte ist die Rechnung des Kartenausstellers der Steuerbeleg. Jede Rechnung wird deshalb als eine Eingangsrechnung mit einer Zeile pro Einkauf angelegt (Datum, Kraftstoff, Kennzeichen, Tankstelle). Kartengebühren gleicht eine eigene Zeile aus, damit der Betrag mit der Rechnung übereinstimmt. Einkäufe im Ausland gehen mit dem vollen Betrag in den Aufwand, weil ausländische Umsatzsteuer im Inland nicht abziehbar ist.",
  "Keď sú všetky nákupy na faktúre z jedného auta, dostane faktúra aj vozidlo a pri aute s odpočtom 50 % sa DPH rozdelí sama. Faktúra za viac áut s kráteným odpočtom má v internej poznámke rozpis po autách na kontrolu.":
    "Stammen alle Einkäufe einer Rechnung von einem Fahrzeug, erhält die Rechnung auch das Fahrzeug, und bei einem Fahrzeug mit 50 % Vorsteuerabzug wird die Steuer automatisch aufgeteilt. Eine Rechnung für mehrere Fahrzeuge mit gekürztem Abzug enthält in der internen Notiz eine Aufstellung nach Fahrzeugen zur Kontrolle.",
  "Ak tú istú faktúru Shell už vo Fakteri máte (prišla e-mailom alebo ste ju nahrali), druhá sa nezaloží — nákupy sa len prepoja na existujúcu. Bloček z pumpy s rovnakým dňom a sumou sa označí ako <0>aj bloček</0>: nezaúčtujte ho, inak bude náklad aj DPH dvakrát. Kto chce z karty len tankovania bez dokladov, prepne pri karte <1>Len tankovania, bez dokladov</1>.":
    "Ist dieselbe Shell-Rechnung bereits in Faktero (per E-Mail erhalten oder hochgeladen), wird keine zweite angelegt — die Einkäufe werden nur mit der vorhandenen verknüpft. Ein Tankstellenbeleg mit gleichem Tag und Betrag wird als <0>auch Beleg</0> markiert: Buchen Sie ihn nicht, sonst sind Aufwand und Vorsteuer doppelt. Wer von der Karte nur Tankvorgänge ohne Belege möchte, stellt bei der Karte <1>Nur Tankvorgänge, ohne Belege</1> ein.",
  "Karty DKV, Eurowag a OMV pripravujeme; pri každej je na stránke napísané, ako u vydavateľa získať prístup k údajom.":
    "Karten von DKV, Eurowag und OMV sind in Vorbereitung; bei jeder steht auf der Seite, wie Sie beim Aussteller Zugang zu den Daten erhalten.",
};
