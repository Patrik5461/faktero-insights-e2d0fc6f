/* Vlna „na 100 %“ — web: české výkazy DPH (kľúče po slovensky), 404, prístupnosť. */
const slovnik: Record<string, string> = {
  "Hlavné menu": "Hauptmenü",
  Oznam: "Hinweis",
  Výber: "Auswahl",
  "Stránka sa nenašla — Faktero": "Seite nicht gefunden – Faktero",
  "Zabudli ste heslo do Faktera? Zadajte e-mail a pošleme vám odkaz na nastavenie nového hesla.":
    "Passwort für Faktero vergessen? Geben Sie Ihre E-Mail-Adresse ein und wir senden Ihnen einen Link zum Festlegen eines neuen Passworts.",
  "Výkazy sa nepodarilo zostaviť.": "Die Meldungen konnten nicht erstellt werden.",
  "Vyplňte kód finančného úradu (3 číslice, napr. 451 pre Prahu).":
    "Geben Sie den Code des Finanzamts ein (3 Ziffern, z. B. 451 für Prag).",
  "Firma nemá DIČ — doplňte ho v Nastaveniach firmy.":
    "Das Unternehmen hat keine Steuernummer (DIČ) — ergänzen Sie sie in den Unternehmenseinstellungen.",
  "Priznanie k DPH a kontrolné hlásenie zostavené z dokladov, v XML pre portál MOJE daně.":
    "MwSt.-Erklärung und Kontrollmeldung aus Ihren Belegen, als XML für das Portal MOJE daně.",
  "Finančný úrad (kód)": "Finanzamt (Code)",
  "Územné pracovisko (kód)": "Dienststelle (Code)",
  "CZ-NACE (hlavná činnosť)": "CZ-NACE (Haupttätigkeit)",
  "Podáva — meno": "Einreicher — Vorname",
  "Podáva — priezvisko": "Einreicher — Nachname",
  "Vzťah k firme": "Funktion im Unternehmen",
  "Kód predmetu plnenia (prenesenie daňovej povinnosti § 92a)":
    "Code des Leistungsgegenstands (Reverse-Charge § 92a)",
  "— nevybrané —": "— nicht ausgewählt —",
  "Kódy finančných úradov a pracovísk nájdete v číselníkoch na portáli MOJE daně (napr. 451 = Finanční úřad pro hlavní město Prahu). Kontrolné hlásenie podáva právnická osoba vždy za mesiac — pri štvrťročnom priznaní sa zostaví za každý mesiac zvlášť.":
    "Die Codes der Finanzämter und Dienststellen finden Sie in den Verzeichnissen des Portals MOJE daně (z. B. 451 = Finanzamt für die Hauptstadt Prag). Juristische Personen reichen die Kontrollmeldung immer monatlich ein — bei vierteljährlicher Erklärung wird sie für jeden Monat einzeln erstellt.",
  "Pred podaním doplňte ({n})": "Vor der Einreichung ergänzen ({n})",
  "DPHDP3 · sumy v celých korunách": "DPHDP3 · Beträge in ganzen Kronen",
  Riadne: "Ordentlich",
  "Riadne opravné": "Ordentlich, berichtigt",
  Dodatočné: "Nachträglich",
  "Dodatočné opravné": "Nachträglich, berichtigt",
  "r. {r}": "Z. {r}",
  "Súhrnné hlásenie": "Zusammenfassende Meldung",
  "DPHSHV · dodanie tovaru a služieb do EÚ · v celých korunách":
    "DPHSHV · Lieferungen und Leistungen in die EU · in ganzen Kronen",
  "V období nie sú žiadne dodávky do EÚ — súhrnné hlásenie sa nepodáva.":
    "Im Zeitraum gibt es keine Lieferungen in die EU — keine Zusammenfassende Meldung erforderlich.",
  "Odberateľ (IČ DPH)": "Kunde (USt-IdNr.)",
  "Kód plnenia": "Leistungscode",
  "0 – dodanie tovaru": "0 – Warenlieferung",
  "2 – trojstranný obchod": "2 – Dreiecksgeschäft",
  "Pri dodaní tovaru sa súhrnné hlásenie podáva za každý mesiac — prepnite obdobie na mesiac.":
    "Bei Warenlieferungen wird die Zusammenfassende Meldung monatlich abgegeben — stellen Sie den Zeitraum auf Monat um.",
  "Vyberte kód predmetu plnenia pre prenesenie daňovej povinnosti.":
    "Wählen Sie den Code des Leistungsgegenstands für Reverse-Charge.",
  "Kontrolné hlásenie — {mesic}": "Kontrollmeldung — {mesic}",
  "DPHKH1 · sumy na halier": "DPHKH1 · Beträge auf den Heller genau",
  "Tuzemské plnenia — základná sadzba, základ":
    "Inländische Umsätze — Regelsatz, Bemessungsgrundlage",
  "Tuzemské plnenia — základná sadzba, daň": "Inländische Umsätze — Regelsatz, Steuer",
  "Tuzemské plnenia — znížená sadzba, základ":
    "Inländische Umsätze — ermäßigter Satz, Bemessungsgrundlage",
  "Tuzemské plnenia — znížená sadzba, daň": "Inländische Umsätze — ermäßigter Satz, Steuer",
  "Nadobudnutie tovaru z EÚ — základná sadzba, základ":
    "Innergemeinschaftlicher Erwerb — Regelsatz, Bemessungsgrundlage",
  "Prijatie služby z EÚ (§ 9/1) — základ":
    "Bezogene Leistungen aus der EU (§ 9/1) — Bemessungsgrundlage",
  "Prijatie služby z EÚ (§ 9/1) — daň": "Bezogene Leistungen aus der EU (§ 9/1) — Steuer",
  "Prenesenie daňovej povinnosti — odberateľ, základ":
    "Reverse-Charge — Leistungsempfänger, Bemessungsgrundlage",
  "Prenesenie daňovej povinnosti — odberateľ, daň": "Reverse-Charge — Leistungsempfänger, Steuer",
  "Plnenie od osoby neusadenej v tuzemsku — základ":
    "Leistungen nicht ansässiger Unternehmer — Bemessungsgrundlage",
  "Plnenie od osoby neusadenej v tuzemsku — daň":
    "Leistungen nicht ansässiger Unternehmer — Steuer",
  "Dodanie tovaru do EÚ (§ 64)": "Innergemeinschaftliche Lieferungen (§ 64)",
  "Služby do EÚ (§ 9/1)": "Dienstleistungen in die EU (§ 9/1)",
  "Vývoz tovaru (§ 66)": "Ausfuhrlieferungen (§ 66)",
  "Prenesenie daňovej povinnosti — dodávateľ (§ 92a)":
    "Reverse-Charge — leistender Unternehmer (§ 92a)",
  "Trojstranný obchod — dodanie": "Dreiecksgeschäft — Lieferung",
  "Odpočet z tuzemska — základná sadzba, základ":
    "Vorsteuer Inland — Regelsatz, Bemessungsgrundlage",
  "Odpočet z tuzemska — základná sadzba, daň": "Vorsteuer Inland — Regelsatz, Steuer",
  "Odpočet z tuzemska — znížená sadzba, základ":
    "Vorsteuer Inland — ermäßigter Satz, Bemessungsgrundlage",
  "Odpočet z tuzemska — znížená sadzba, daň": "Vorsteuer Inland — ermäßigter Satz, Steuer",
  "Dovoz tovaru (colný úrad) — základ": "Einfuhr (Zollamt) — Bemessungsgrundlage",
  "Dovoz tovaru (colný úrad) — odpočet": "Einfuhr (Zollamt) — Vorsteuer",
  "Odpočet zo samovymerania — základná sadzba, základ":
    "Vorsteuer aus Selbstveranlagung — Regelsatz, Bemessungsgrundlage",
  "Odpočet zo samovymerania — základná sadzba, daň":
    "Vorsteuer aus Selbstveranlagung — Regelsatz, Steuer",
  "Odpočet dane celkom": "Vorsteuer gesamt",
  "Daň na výstupe celkom": "Umsatzsteuer gesamt",
  "A.1 Prenesenie daňovej povinnosti — dodávateľ": "A.1 Reverse-Charge — leistender Unternehmer",
  "A.2 Prijaté plnenia zo zahraničia": "A.2 Bezogene Leistungen aus dem Ausland",
  "A.4 Vystavené doklady nad 10 000 Kč": "A.4 Ausgangsbelege über 10 000 Kč",
  "A.5 Ostatné vystavené (súhrnne)": "A.5 Sonstige Ausgangsbelege (zusammengefasst)",
  "B.1 Prenesenie daňovej povinnosti — odberateľ": "B.1 Reverse-Charge — Leistungsempfänger",
  "B.2 Prijaté doklady nad 10 000 Kč": "B.2 Eingangsbelege über 10 000 Kč",
  "B.3 Ostatné prijaté (súhrnne)": "B.3 Sonstige Eingangsbelege (zusammengefasst)",
  "Doplňte DIČ pri doklade {doklady} — pri prenesení daňovej povinnosti je povinné.":
    "Ergänzen Sie die Steuernummer (DIČ) beim Beleg {doklady} — bei Reverse-Charge ist sie Pflicht.",
  "Doplňte DIČ pri dokladoch {doklady} — pri prenesení daňovej povinnosti je povinné.":
    "Ergänzen Sie die Steuernummer (DIČ) bei den Belegen {doklady} — bei Reverse-Charge ist sie Pflicht.",
  "mesiac::Január": "Januar",
  "mesiac::Február": "Februar",
  "mesiac::Marec": "März",
  "mesiac::Apríl": "April",
  "mesiac::Máj": "Mai",
  "mesiac::Jún": "Juni",
  "mesiac::Júl": "Juli",
  "mesiac::August": "August",
  "mesiac::September": "September",
  "mesiac::Október": "Oktober",
  "mesiac::November": "November",
  "mesiac::December": "Dezember",
};

export default slovnik;
