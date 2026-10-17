// Preklady pre nemeckú e-faktúru (XRechnung, ZUGFeRD), Leitweg-ID a hranice Kleinunternehmer (§ 19 UStG).
export default {
  "Stiahnuť XRechnung (XML)": "XRechnung (XML) herunterladen",
  "XRechnung sa nedá vystaviť: {chyby}": "Die XRechnung kann nicht erstellt werden: {chyby}",
  "Zálohová faktúra nie je daňový doklad — XRechnung sa k nej nevystavuje.":
    "Eine Proformarechnung ist keine Rechnung im Sinne des UStG – dafür wird keine XRechnung erstellt.",
  "XRechnung sa vystavuje len pre firmu so sídlom v Nemecku.":
    "Die XRechnung wird nur für Unternehmen mit Sitz in Deutschland erstellt.",
  "Faktúra sa nenašla.": "Die Rechnung wurde nicht gefunden.",
  "Firma sa nenašla.": "Das Unternehmen wurde nicht gefunden.",

  // Kontroly pred vydaním XRechnung / ZUGFeRD
  "Dobropis aj opravná faktúra musia obsahovať číslo pôvodnej faktúry.":
    "Gutschrift und Rechnungskorrektur müssen die Nummer der ursprünglichen Rechnung enthalten.",
  "Doplňte mesto firmy.": "Bitte den Ort Ihres Unternehmens ergänzen.",
  "Doplňte PSČ firmy.": "Bitte die Postleitzahl Ihres Unternehmens ergänzen.",
  "Doplňte mesto odberateľa.": "Bitte den Ort des Kunden ergänzen.",
  "Doplňte PSČ odberateľa.": "Bitte die Postleitzahl des Kunden ergänzen.",
  "Pri prenesení daňovej povinnosti, dodaní do EÚ a vývoze musí mať firma USt-IdNr.":
    "Bei Reverse-Charge, innergemeinschaftlicher Lieferung und Ausfuhr muss Ihre USt-IdNr. angegeben sein.",
  "Dodanie do EÚ potrebuje IČ DPH odberateľa.":
    "Für eine innergemeinschaftliche Lieferung wird die USt-IdNr. des Kunden benötigt.",
  "Pri prenesení daňovej povinnosti musí mať odberateľ IČ DPH alebo registračné číslo.":
    "Bei Reverse-Charge braucht der Kunde eine USt-IdNr. oder eine Registernummer.",
  "Na úhradu prevodom chýba IBAN firmy.": "Für die Zahlung per Überweisung fehlt Ihre IBAN.",
  "IBAN firmy nie je platný.": "Die IBAN Ihres Unternehmens ist ungültig.",
  "XRechnung vyžaduje telefón firmy — doplňte ho v údajoch firmy.":
    "Die XRechnung verlangt eine Telefonnummer Ihres Unternehmens – bitte in den Firmendaten ergänzen.",
  "XRechnung vyžaduje e-mail firmy — doplňte ho v údajoch firmy.":
    "Die XRechnung verlangt eine E-Mail-Adresse Ihres Unternehmens – bitte in den Firmendaten ergänzen.",
  "XRechnung vyžaduje elektronickú adresu firmy (e-mail).":
    "Die XRechnung verlangt eine elektronische Adresse Ihres Unternehmens (E-Mail).",
  "XRechnung vyžaduje elektronickú adresu odberateľa — doplňte jeho e-mail.":
    "Die XRechnung verlangt eine elektronische Adresse des Kunden – bitte seine E-Mail-Adresse ergänzen.",

  // Kontakt
  "Leitweg-ID (len pre úrady — do XRechnung)": "Leitweg-ID (nur Behörden – für die XRechnung)",

  // Kleinunternehmer § 19 UStG
  "Kleinunternehmer (§ 19 UStG) — hranica obratu": "Kleinunternehmer (§ 19 UStG) – Umsatzgrenze",
  "Obrat za rok {minuly} bol {suma} — viac ako 25 000 €. V roku {rok} už nemôžete fakturovať ako Kleinunternehmer; prepnite režim DPH na Regelbesteuerung.":
    "Der Umsatz {minuly} betrug {suma} – mehr als 25.000 €. Im Jahr {rok} dürfen Sie nicht mehr als Kleinunternehmer abrechnen; stellen Sie die Besteuerung auf Regelbesteuerung um.",
  "Obrat v roku {rok} je {suma} — prekročil 100 000 €. Od faktúry, ktorou ste hranicu prekročili, musíte fakturovať s DPH (§ 19 Abs. 1 UStG).":
    "Der Umsatz {rok} beträgt {suma} und hat 100.000 € überschritten. Ab der Rechnung, mit der die Grenze überschritten wurde, müssen Sie mit Umsatzsteuer abrechnen (§ 19 Abs. 1 UStG).",
  "Obrat v roku {rok} je {suma} — blíži sa k 100 000 €. Faktúra, ktorou hranicu prekročíte, už musí byť s DPH.":
    "Der Umsatz {rok} beträgt {suma} und nähert sich 100.000 €. Die Rechnung, mit der Sie die Grenze überschreiten, muss bereits Umsatzsteuer enthalten.",
  "Obrat v roku {rok} je {suma} — viac ako 25 000 €. Tento rok ostávate Kleinunternehmer, od 1. 1. {buduci} už fakturujete s DPH.":
    "Der Umsatz {rok} beträgt {suma} – mehr als 25.000 €. In diesem Jahr bleiben Sie Kleinunternehmer, ab dem 1.1.{buduci} rechnen Sie mit Umsatzsteuer ab.",
  "Obrat v roku {rok} je {suma} — blíži sa k 25 000 €. Ak ich prekročí, od 1. 1. {buduci} už nebudete Kleinunternehmer.":
    "Der Umsatz {rok} beträgt {suma} und nähert sich 25.000 €. Wird die Grenze überschritten, sind Sie ab dem 1.1.{buduci} kein Kleinunternehmer mehr.",
};
