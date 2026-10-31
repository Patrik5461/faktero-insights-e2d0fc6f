// Stav eFaktúry na webe (zoznam, detail, Odoslané, Doručenia, zvonček) — tie isté vety ako appka (efs.*).
export default {
  "Odberateľ eFaktúru prijal": "Kunde hat die E-Rechnung angenommen",
  "Odberateľ eFaktúru zamietol": "Kunde hat die E-Rechnung abgelehnt",
  "Odberateľ nie je zaregistrovaný v sieti Peppol. Pošlite mu faktúru inak (napríklad e-mailom); ak sa zaregistruje do 15 dní, dá sa poslať znova.":
    "Der Kunde ist nicht im Peppol-Netz registriert. Senden Sie die Rechnung auf anderem Weg (z. B. per E-Mail); registriert er sich innerhalb von 15 Tagen, kann sie erneut gesendet werden.",
  "Odberateľ je v sieti Peppol, ale tento druh dokladu cez eFaktúru neprijíma.":
    "Der Kunde ist im Peppol-Netz, nimmt diese Belegart aber nicht als E-Rechnung an.",
  "Faktúra neprešla kontrolou formátu eFaktúry. Chyby ukáže detail faktúry na webe.":
    "Die Rechnung hat die Formatprüfung der E-Rechnung nicht bestanden. Die Fehler zeigt das Rechnungsdetail im Web.",
  "Systém odberateľa faktúru technicky odmietol.":
    "Das System des Kunden hat die Rechnung technisch abgelehnt.",
  "Adresár siete Peppol bol nedostupný. Skúste ju odoslať znova neskôr.":
    "Das Peppol-Verzeichnis war nicht erreichbar. Versuchen Sie es später erneut.",
  "Doručenie zlyhalo ani po opakovaných pokusoch. Skúste ju odoslať znova neskôr.":
    "Die Zustellung ist auch nach wiederholten Versuchen fehlgeschlagen. Versuchen Sie es später erneut.",
  "Firma nemá zapnutú eFaktúru. Zapnete ju na webe v časti eFaktúra.":
    "Die Firma hat die E-Rechnung nicht aktiviert. Sie können sie im Web unter E-Rechnung einschalten.",
  "Faktúra s týmto číslom už eFaktúrou odišla. Pod tým istým číslom ju poslať znova nemožno — vystavte opravný doklad alebo faktúru s novým číslom.":
    "Eine Rechnung mit dieser Nummer wurde bereits als E-Rechnung gesendet. Unter derselben Nummer kann sie nicht erneut gesendet werden — stellen Sie einen Korrekturbeleg oder eine Rechnung mit neuer Nummer aus.",
  "Služba eFaktúry bola dočasne nedostupná. Skúste ju odoslať znova neskôr.":
    "Der E-Rechnungsdienst war vorübergehend nicht erreichbar. Versuchen Sie es später erneut.",
  "Služba eFaktúry faktúru neprijala.": "Der E-Rechnungsdienst hat die Rechnung nicht angenommen.",
  "Odberateľ faktúru v eFaktúre zamietol. Dohodnite sa s ním a v prípade potreby vystavte opravný doklad.":
    "Der Kunde hat die Rechnung im E-Rechnungsnetz abgelehnt. Sprechen Sie mit ihm und stellen Sie bei Bedarf einen Korrekturbeleg aus.",
  "Odberateľ má k faktúre otázku.": "Der Kunde hat eine Rückfrage zur Rechnung.",
  "Odberateľ faktúru spracúva.": "Der Kunde bearbeitet die Rechnung.",
  "Prijatá s výhradou.": "Unter Vorbehalt angenommen.",
  "Odberateľ ju označil ako zaplatenú.": "Der Kunde hat sie als bezahlt markiert.",
  "Podrobnosti: {text}": "Details: {text}",
  "Pokusov o doručenie": "Zustellversuche",
  "eFaktúra neodišla": "E-Rechnung nicht versendet",
  "eFaktúra zamietnutá": "E-Rechnung abgelehnt",
  "Odoslať znova": "Erneut senden",
  "Odoslať eFaktúru znova": "E-Rechnung erneut senden",
  "Odberateľ zamietol eFaktúru {cislo}": "Kunde hat die E-Rechnung {cislo} abgelehnt",
  "Odberateľ zamietol eFaktúru": "Kunde hat die E-Rechnung abgelehnt",
  "eFaktúra {cislo} neodišla": "E-Rechnung {cislo} wurde nicht versendet",
  "{odberatel} · {dovod}": "{odberatel} · {dovod}",
  "{dovod}": "{dovod}",
} satisfies Record<string, string>;
