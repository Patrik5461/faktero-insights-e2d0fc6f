// Nemecký preklad manuálu v Pomoci (src/routes/pomoc.opakovane.tsx). Kľúče vyrába pomoc-preklad.test.tsx.
export default {
  "Pomoc — Opakované faktúry — Faktero": "Hilfe — Wiederkehrende Rechnungen — Faktero",
  "Opakované faktúry vo Faktere: interval, automatické vystavovanie, odosielanie a pozastavenie.":
    "Wiederkehrende Rechnungen in Faktero: Intervall, automatische Ausstellung, Versand und Pausieren.",
  "Paušály a pravidelné platby, ktoré sa vystavia samy.":
    "Pauschalen und regelmäßige Zahlungen, die sich selbst ausstellen.",
  "Načo sú opakované faktúry": "Wozu wiederkehrende Rechnungen dienen",
  "Na pravidelnú fakturáciu, ktorá sa nemení — paušál, prenájom, servisná zmluva. Šablónu nastavíte raz a Faktero z nej vystavuje faktúry samo.":
    "Für regelmäßige Abrechnungen, die sich nicht ändern — Pauschale, Miete, Wartungsvertrag. Die Vorlage richten Sie einmal ein, und Faktero stellt daraus die Rechnungen selbst aus.",
  "Nastavenie šablóny": "Vorlage einrichten",
  "V <0>Opakované → Nová</0> zadajte odberateľa, položky, interval a <1>dátum najbližšieho vystavenia</1>.":
    "Geben Sie unter <0>Wiederkehrend → Neu</0> den Kunden, die Positionen, das Intervall und das <1>Datum der nächsten Ausstellung</1> ein.",
  "Faktúra sa vystaví v ten deň a dátum sa posunie o interval ďalej. Pri mesačnom intervale sa deň drží tak, aby dával zmysel: šablóna nastavená na 31. sa vo februári vystaví posledný februárový deň, nie začiatkom marca.":
    "Die Rechnung wird an diesem Tag ausgestellt und das Datum um das Intervall weitergeschoben. Bei monatlichem Intervall wird der Tag sinnvoll beibehalten: Eine auf den 31. eingestellte Vorlage wird im Februar am letzten Februartag ausgestellt, nicht Anfang März.",
  "Automatické vystavovanie": "Automatische Ausstellung",
  "Faktero kontroluje šablóny každý deň. Faktúra dostane riadne poradové číslo a správa sa ako každá iná — dá sa upraviť, odoslať aj stornovať.":
    "Faktero prüft die Vorlagen täglich. Die Rechnung erhält eine reguläre fortlaufende Nummer und verhält sich wie jede andere — sie kann bearbeitet, gesendet und storniert werden.",
  "Ak má šablóna zapnuté odosielanie, faktúra rovno odíde odberateľovi na e-mail.":
    "Ist bei der Vorlage der Versand aktiviert, geht die Rechnung direkt per E-Mail an den Kunden.",
  "Pozastavenie a ukončenie": "Pausieren und Beenden",
  "Šablónu možno <0>pozastaviť</0> — ostane uložená, ale nevystavuje. Hodí sa, keď odberateľ službu dočasne nečerpá.":
    "Eine Vorlage kann <0>pausiert</0> werden — sie bleibt gespeichert, stellt aber nichts aus. Das ist praktisch, wenn der Kunde die Leistung vorübergehend nicht nutzt.",
  "<0>Zmazaná šablóna prestane fakturovať okamžite.</0> Faktúry, ktoré z nej už vznikli, ostávajú — sú to platné doklady.":
    "<0>Eine gelöschte Vorlage rechnet sofort nicht mehr ab.</0> Bereits daraus entstandene Rechnungen bleiben bestehen — sie sind gültige Belege.",
} satisfies Record<string, string>;
