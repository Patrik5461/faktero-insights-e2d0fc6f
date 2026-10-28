// Zápis cez API (prijaté faktúry, bločky, prenos kontaktov, cenník, firmy, banka) a MCP.
export default {
  Cenník: "Preisliste",
  "Firmy a používatelia": "Unternehmen und Benutzer",
  "Hromadný prenos adresára (do 1000)": "Sammelübernahme des Adressbuchs (bis 1000)",
  "Hromadný prenos adresára": "Sammelübernahme des Adressbuchs",
  "Prenesie odberateľov aj dodávateľov z iného programu naraz. Páruje podľa external_id, potom IČO, bez IČO podľa mena. Existujúci kontakt sa len doplní o prázdne polia; s update_existing: true sa prepíše. Odpoveď povie, čo sa založilo, doplnilo alebo ostalo bez zmeny, a chyby po riadkoch.":
    "Übernimmt Kunden und Lieferanten aus einem anderen Programm auf einmal. Zugeordnet wird nach external_id, dann nach Firmen-ID, ohne Firmen-ID nach Namen. Ein bestehender Kontakt wird nur um leere Felder ergänzt; mit update_existing: true wird er überschrieben. Die Antwort sagt, was angelegt, ergänzt oder unverändert blieb, und nennt Fehler je Zeile.",
  "Zapísať prijatú faktúru (aj so súborom)": "Eingangsrechnung erfassen (auch mit Datei)",
  "Úprava, úhrada (payment_date), zaúčtovanie": "Änderung, Zahlung (payment_date), Verbuchung",
  "Zapísať bloček": "Kassenbeleg erfassen",
  "Úprava bločku": "Kassenbeleg ändern",
  "Pridať účet bez napojenia na banku": "Konto ohne Bankanbindung hinzufügen",
  "Preniesť pohyby na taký účet (do 2000)": "Umsätze auf ein solches Konto übertragen (bis 2000)",
  "Zápis prijatej faktúry": "Erfassung einer Eingangsrechnung",
  "Sumy pošlite buď ako položky (ceny bez DPH, sadzba v %), alebo ako amount_total (+ amount_without_vat a vat_amount). Dodávateľ sa založí v adresári, ak tam nie je. S external_id je opakované volanie bezpečné; bez neho sa tá istá faktúra (IČO + číslo + suma) druhýkrát nezaloží (409). Súbor (PDF, JPG, PNG) ide ako base64 do 14 MB. Bez accounting.booked príde faktúra nezaúčtovaná.":
    "Beträge senden Sie entweder als Positionen (Nettopreise, Steuersatz in %) oder als amount_total (+ amount_without_vat und vat_amount). Der Lieferant wird im Adressbuch angelegt, falls er fehlt. Mit external_id ist ein wiederholter Aufruf sicher; ohne sie wird dieselbe Rechnung (Firmen-ID + Nummer + Betrag) kein zweites Mal angelegt (409). Die Datei (PDF, JPG, PNG) geht als base64 bis 14 MB. Ohne accounting.booked kommt die Rechnung unverbucht an.",
  "Úhradu zapíšete cez PUT s payment_date. Bloček: issue_date, total_amount (s DPH), vat_breakdown [{ rate, base, vat }] a payment_method (hotovost, karta, prevod) — hotovosť sa započíta do pokladne, ak nepošlete cash_register: false.":
    "Die Zahlung erfassen Sie per PUT mit payment_date. Kassenbeleg: issue_date, total_amount (brutto), vat_breakdown [{ rate, base, vat }] und payment_method (hotovost, karta, prevod) — Bargeld wird in die Kasse gerechnet, sofern Sie nicht cash_register: false senden.",
  "Prenos bankového účtu": "Übernahme eines Bankkontos",
  "Pre banku, ku ktorej sa Faktero nepripojí, alebo pri prechode z iného programu: POST /bank-accounts založí účet (IBAN, mena, zostatok) a pohyby naň pošlete dávkou. Každý pohyb má mať reference (jedinečné id z banky); bez neho ho Faktero odvodí z dátumu, sumy a symbolov, takže opakované odoslanie nič nezdvojí. Na účet napojený priamo na banku pohyby cez API poslať nejde — vedie ich banka.":
    "Für eine Bank, an die sich Faktero nicht anbindet, oder beim Wechsel aus einem anderen Programm: POST /bank-accounts legt das Konto an (IBAN, Währung, Saldo), und die Umsätze senden Sie als Stapel. Jeder Umsatz sollte eine reference haben (eindeutige ID der Bank); ohne sie leitet Faktero sie aus Datum, Betrag und Symbolen ab, sodass ein wiederholtes Senden nichts verdoppelt. Auf ein direkt angebundenes Bankkonto lassen sich per API keine Umsätze senden — die führt die Bank.",
  "Produkty a služby (q = hľadanie)": "Produkte und Leistungen (q = Suche)",
  "Pridať do cenníka": "Zur Preisliste hinzufügen",
  "Detail produktu": "Produktdetail",
  "Úprava produktu": "Produkt ändern",
  "Cena je bez DPH. S external_id sa ten istý produkt druhýkrát nezaloží — vhodné na synchronizáciu z e-shopu či skladového programu.":
    "Der Preis ist netto. Mit external_id wird dasselbe Produkt kein zweites Mal angelegt — geeignet für die Synchronisation aus einem Onlineshop oder Lagerprogramm.",
  "Firmy, ku ktorým kľúč smie": "Unternehmen, auf die der Schlüssel zugreifen darf",
  "Založiť firmu (kľúč účtu)": "Unternehmen anlegen (Kontoschlüssel)",
  "Detail firmy": "Unternehmensdetail",
  "Úprava údajov firmy": "Unternehmensdaten ändern",
  "Používatelia a čakajúce pozvánky": "Benutzer und offene Einladungen",
  "Pozvať používateľa (kľúč účtu)": "Benutzer einladen (Kontoschlüssel)",
  "Pre účtovné kancelárie a integrátorov: kľúčom pre viac firiem založíte firmu nového klienta (stanete sa jej vlastníkom a kľúč k nej hneď smie) a pozvete do nej používateľov — účtovníka (accountant), admina alebo zamestnanca. Pozvánka príde e-mailom a platí 14 dní; v odpovedi je aj odkaz na prijatie. Firmu zakladať a pozývať smie len kľúč pre viac firiem, ktorého majiteľ je vo firme vlastník alebo admin — obyčajný firemný kľúč nie.":
    "Für Steuerbüros und Integratoren: Mit dem Schlüssel für mehrere Unternehmen legen Sie das Unternehmen eines neuen Mandanten an (Sie werden Inhaber, und der Schlüssel darf sofort darauf zugreifen) und laden Benutzer ein — Buchhalter (accountant), Admin oder Mitarbeiter. Die Einladung kommt per E-Mail und gilt 14 Tage; die Antwort enthält auch den Annahmelink. Unternehmen anlegen und einladen darf nur ein Schlüssel für mehrere Unternehmen, dessen Inhaber im Unternehmen Inhaber oder Admin ist — ein gewöhnlicher Unternehmensschlüssel nicht.",
  "Nástroje: faktúry a ich detail, faktúry po splatnosti, vystavenie faktúry, označenie úhrady, odberatelia aj ich hromadný prenos, cenové ponuky, cenník, prijaté faktúry a bločky (aj ich zápis a úhrada), bankové účty a pohyby (aj prenos na účet bez napojenia), založenie firmy, používatelia a pozvánky.":
    "Werkzeuge: Rechnungen und ihr Detail, überfällige Rechnungen, Rechnung ausstellen, Zahlung markieren, Kunden und ihre Sammelübernahme, Angebote, Preisliste, Eingangsrechnungen und Kassenbelege (auch erfassen und bezahlen), Bankkonten und Umsätze (auch Übernahme auf ein Konto ohne Anbindung), Unternehmen anlegen, Benutzer und Einladungen.",
  "Asistent nič nemaže a nič neposiela odberateľom — faktúru vystaví, ale odoslanie e-mailom či ako eFaktúru je na vás. Jediný e-mail, ktorý odíde, je pozvánka používateľa, keď o ňu výslovne požiadate. Zapisujúce nástroje sú označené, aby si ich klient dal potvrdiť.":
    "Der Assistent löscht nichts und sendet nichts an Kunden — er stellt die Rechnung aus, das Versenden per E-Mail oder als E-Rechnung liegt bei Ihnen. Die einzige E-Mail, die hinausgeht, ist eine Benutzereinladung, wenn Sie ausdrücklich darum bitten. Schreibende Werkzeuge sind gekennzeichnet, damit der Client sie bestätigen lässt.",
  "čítať faktúry, odberateľov, ponuky, cenník, prijaté faktúry, bločky a bankové pohyby,":
    "Rechnungen, Kunden, Angebote, Preisliste, Eingangsrechnungen, Kassenbelege und Bankumsätze lesen,",
  "vystaviť faktúru, zapísať prijatú faktúru či bloček, založiť odberateľa, produkt alebo firmu, preniesť kontakty a bankové pohyby, označiť úhradu a pozvať používateľa.":
    "eine Rechnung ausstellen, eine Eingangsrechnung oder einen Kassenbeleg erfassen, einen Kunden, ein Produkt oder ein Unternehmen anlegen, Kontakte und Bankumsätze übernehmen, eine Zahlung markieren und einen Benutzer einladen.",
  "Prenos dát a zápis dokladov cez API": "Datenübernahme und Erfassung von Belegen per API",
  "API nielen číta, ale aj zapisuje — hodí sa pri prechode z iného programu aj pri trvalom napojení e-shopu, skladu či účtovnej kancelárie:":
    "Die API liest nicht nur, sie schreibt auch — nützlich beim Wechsel aus einem anderen Programm wie bei einer dauerhaften Anbindung eines Onlineshops, Lagers oder Steuerbüros:",
  "<0>Prijaté faktúry a bločky</0> — zapíšete ich aj so súborom (PDF, fotka), dodávateľ sa sám založí v adresári. Úhradu a zaúčtovanie doplníte úpravou.":
    "<0>Eingangsrechnungen und Kassenbelege</0> — Sie erfassen sie auch mit Datei (PDF, Foto), der Lieferant wird im Adressbuch automatisch angelegt. Zahlung und Verbuchung ergänzen Sie per Änderung.",
  "<0>Adresár</0> — naraz prenesiete až 1000 odberateľov a dodávateľov. Existujúci kontakt sa nezdvojí, len sa doplní.":
    "<0>Adressbuch</0> — Sie übernehmen bis zu 1000 Kunden und Lieferanten auf einmal. Ein bestehender Kontakt wird nicht verdoppelt, nur ergänzt.",
  "<0>Cenník</0> — produkty a služby, ktoré sa dajú synchronizovať napríklad z e-shopu.":
    "<0>Preisliste</0> — Produkte und Leistungen, die sich etwa aus einem Onlineshop synchronisieren lassen.",
  "<0>Bankové účty</0> — účet banky, ku ktorej sa Faktero nepripojí, založíte cez API a pohyby naň posielate dávkami. Duplicity sa preskočia.":
    "<0>Bankkonten</0> — ein Konto einer Bank, an die sich Faktero nicht anbindet, legen Sie per API an und senden die Umsätze stapelweise. Duplikate werden übersprungen.",
  "<0>Firmy a používatelia</0> — kľúčom pre viac firiem založíte firmu nového klienta a pozvete do nej účtovníka či kolegu (pozvánka príde e-mailom).":
    "<0>Unternehmen und Benutzer</0> — mit dem Schlüssel für mehrere Unternehmen legen Sie das Unternehmen eines neuen Mandanten an und laden einen Buchhalter oder Kollegen ein (die Einladung kommt per E-Mail).",
  "Pri každom zápise môžete poslať vlastné <0>external_id</0> — opakované odoslanie potom nič nezdvojí. Nič sa cez API nemaže; faktúra sa dá len stornovať. Presný tvar údajov je v <1>API dokumentácii</1>.":
    "Bei jedem Schreibvorgang können Sie eine eigene <0>external_id</0> senden — ein wiederholtes Senden verdoppelt dann nichts. Per API wird nichts gelöscht; eine Rechnung lässt sich nur stornieren. Das genaue Datenformat steht in der <1>API-Dokumentation</1>.",
  "Faktero sa dá napojiť na AI asistenta cez <0>MCP</0> (Model Context Protocol). Asistent potom odpovie, kto vám dlhuje, nájde faktúru, vystaví novú, zapíše prijatú faktúru či bloček, založí odberateľa, produkt alebo firmu, prenesie kontakty a bankové pohyby, označí úhradu, pozve kolegu alebo pozrie pohyby na účte. Nič nemaže a nič neposiela odberateľom.":
    "Faktero lässt sich über <0>MCP</0> (Model Context Protocol) mit einem KI-Assistenten verbinden. Der Assistent beantwortet dann, wer Ihnen Geld schuldet, findet eine Rechnung, stellt eine neue aus, erfasst eine Eingangsrechnung oder einen Kassenbeleg, legt einen Kunden, ein Produkt oder ein Unternehmen an, übernimmt Kontakte und Bankumsätze, markiert eine Zahlung, lädt einen Kollegen ein oder sieht sich die Kontobewegungen an. Er löscht nichts und sendet nichts an Kunden.",
};
