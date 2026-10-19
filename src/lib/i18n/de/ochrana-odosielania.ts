// Ochrana odosielania e-mailov (strážca), registrácia s jednorazovým e-mailom
// a admin stránka /admin/odosielanie.
export default {
  // hlášky strážcu (ochrana-odosielania.server.ts → HLASKY)
  "Odosielanie e-mailov je pre túto firmu dočasne pozastavené. Ozvite sa nám na podpora@faktero.sk.":
    "Der E-Mail-Versand ist für dieses Unternehmen vorübergehend gesperrt. Bitte kontaktieren Sie uns unter podpora@faktero.sk.",
  "E-mail sa nepodarilo odoslať, lebo obsahuje odkaz alebo text, ktorý vyzerá ako podvod. Ak ide o omyl, napíšte nám na podpora@faktero.sk.":
    "Die E-Mail wurde nicht gesendet, weil sie einen Link oder Text enthält, der nach Betrug aussieht. Falls es sich um einen Irrtum handelt, schreiben Sie uns an podpora@faktero.sk.",
  "Nová firma môže prvých 7 dní posielať e-maily najviac 10 adresátom denne. Ak potrebujete viac, napíšte nám na podpora@faktero.sk.":
    "Ein neues Unternehmen kann in den ersten 7 Tagen E-Mails an höchstens 10 Empfänger pro Tag senden. Wenn Sie mehr benötigen, schreiben Sie uns an podpora@faktero.sk.",
  "Nová firma môže prvých 7 dní poslať jeden e-mail či doklad najviac 3 adresátom. Ak potrebujete viac, napíšte nám na podpora@faktero.sk.":
    "Ein neues Unternehmen kann in den ersten 7 Tagen eine E-Mail bzw. einen Beleg an höchstens 3 Empfänger senden. Wenn Sie mehr benötigen, schreiben Sie uns an podpora@faktero.sk.",
  "Firma môže posielať e-maily najviac 200 adresátom za 24 hodín. Ak potrebujete viac, napíšte nám na podpora@faktero.sk.":
    "Ein Unternehmen kann E-Mails an höchstens 200 Empfänger innerhalb von 24 Stunden senden. Wenn Sie mehr benötigen, schreiben Sie uns an podpora@faktero.sk.",
  "Jeden e-mail či doklad sa dá poslať najviac 20 adresátom. Ak potrebujete viac, napíšte nám na podpora@faktero.sk.":
    "Eine E-Mail bzw. ein Beleg kann an höchstens 20 Empfänger gesendet werden. Wenn Sie mehr benötigen, schreiben Sie uns an podpora@faktero.sk.",
  "Odosielanie e-mailov je teraz nedostupné. Skúste to o chvíľu znova.":
    "Der E-Mail-Versand ist derzeit nicht verfügbar. Bitte versuchen Sie es gleich noch einmal.",

  // registrácia (overenie-emailu.server.ts, auth-chyby.ts)
  "Jednorazové (dočasné) e-mailové adresy sa na registráciu nedajú použiť. Použite trvalú adresu, napríklad firemnú.":
    "Wegwerf-E-Mail-Adressen können für die Registrierung nicht verwendet werden. Bitte verwenden Sie eine dauerhafte Adresse, zum Beispiel Ihre geschäftliche.",
  "Na doménu {domena} sa nedajú doručiť e-maily. Skontrolujte, či je adresa správna.":
    "An die Domain {domena} können keine E-Mails zugestellt werden. Bitte prüfen Sie, ob die Adresse korrekt ist.",
  "Túto e-mailovú adresu nemožno použiť. Jednorazové (dočasné) adresy neprijímame — použite trvalú, napríklad firemnú. Ak ide o omyl, napíšte nám na podpora@faktero.sk.":
    "Diese E-Mail-Adresse kann nicht verwendet werden. Wegwerf-Adressen akzeptieren wir nicht – bitte verwenden Sie eine dauerhafte, zum Beispiel Ihre geschäftliche. Falls es sich um einen Irrtum handelt, schreiben Sie uns an podpora@faktero.sk.",

  // admin — detail firmy a /admin/odosielanie
  "Odosielanie e-mailov": "E-Mail-Versand",
  "Pozastavené od {kedy}": "Gesperrt seit {kedy}",
  "Overená firma — stropy staršej firmy":
    "Geprüftes Unternehmen – Limits eines etablierten Unternehmens",
  "Bežné stropy podľa veku firmy": "Übliche Limits nach Alter des Unternehmens",
  "Zrušiť overenie": "Prüfung aufheben",
  "Overiť odosielanie": "Versand freigeben",
  "Zrušiť pozastavenie": "Sperre aufheben",
  "Pozastaviť odosielanie": "Versand sperren",
  "Pozastavenie zrušené": "Sperre aufgehoben",
  "Firmy s pozastaveným odosielaním a pokusy, ktoré zastavil strážca (stropy adresátov, podozrivý obsah).":
    "Unternehmen mit gesperrtem Versand und vom Wächter gestoppte Versuche (Empfängerlimits, verdächtiger Inhalt).",
  "Pozastavené firmy": "Gesperrte Unternehmen",
  "Žiadna firma nemá pozastavené odosielanie.": "Kein Unternehmen hat einen gesperrten Versand.",
  "Výstrahy (odoslané)": "Warnungen (gesendet)",
  "Zastavené pokusy": "Gestoppte Versuche",
  Zastavené: "Gestoppt",
  Výstrahy: "Warnungen",
  "Zatiaľ nič.": "Bisher nichts.",
  Kedy: "Wann",
  Adresátov: "Empfänger",
  "Predmet a detail": "Betreff und Detail",
  Ukážka: "Vorschau",
  "Overené firmy": "Geprüfte Unternehmen",
};
