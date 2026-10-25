// MCP server — napojenie AI asistentov (dokumentácia API, API kľúče).
export default {
  "AI asistenti (MCP)": "KI-Assistenten (MCP)",
  "Adresa:": "Adresse:",
  "(Streamable HTTP)": "(Streamable HTTP)",
  "Hlavička:": "Header:",
  "— na skúšanie použite testovací kľúč.": "— zum Ausprobieren verwenden Sie einen Testschlüssel.",
  "Nástroje: faktúry a ich detail, faktúry po splatnosti, vystavenie faktúry, označenie úhrady, odberatelia, cenové ponuky, prijaté faktúry, bankové účty a pohyby.":
    "Werkzeuge: Rechnungen und ihr Detail, überfällige Rechnungen, Rechnungserstellung, Zahlungsvermerk, Kunden, Angebote, Eingangsrechnungen, Bankkonten und Umsätze.",
  "Asistent nič nemaže a nič neposiela von — faktúru vystaví, ale odoslanie e-mailom či ako eFaktúru je na vás. Zapisujúce nástroje sú označené, aby si ich klient dal potvrdiť.":
    "Der Assistent löscht nichts und versendet nichts — er stellt die Rechnung aus, der Versand per E-Mail oder als E-Rechnung liegt bei Ihnen. Schreibende Werkzeuge sind gekennzeichnet, damit der Client sie bestätigen lässt.",
  "Ostatní klienti (konfigurácia JSON)": "Andere Clients (JSON-Konfiguration)",
  "Napojenie AI asistenta (MCP)": "KI-Assistent anbinden (MCP)",
  "Návod na napojenie": "Anleitung zur Anbindung",
  "Žiadosť sa nepodarilo overiť.": "Die Anfrage konnte nicht überprüft werden.",
  "Prístup sa nepodarilo povoliť.": "Der Zugriff konnte nicht erteilt werden.",
  "{klient} žiada prístup k Fakteru": "{klient} bittet um Zugriff auf Faktero",
  "Po povolení vás vrátime na {host}.": "Nach der Freigabe kehren Sie zu {host} zurück.",
  "AI asistent bude môcť": "Der KI-Assistent kann",
  "čítať faktúry, odberateľov, ponuky, prijaté faktúry a bankové pohyby,":
    "Rechnungen, Kunden, Angebote, Eingangsrechnungen und Bankumsätze lesen,",
  "vystaviť faktúru, založiť odberateľa a označiť úhradu.":
    "eine Rechnung ausstellen, einen Kunden anlegen und eine Zahlung vermerken.",
  "Nič nemaže a nič neposiela odberateľom.": "Er löscht nichts und sendet nichts an Kunden.",
  "Prístup môže povoliť len majiteľ alebo správca firmy — vo vašich firmách túto rolu nemáte.":
    "Den Zugriff kann nur der Inhaber oder Administrator des Unternehmens erteilen — diese Rolle haben Sie in Ihren Unternehmen nicht.",
  "Prístup uvidíte v Nastaveniach → API kľúče ako „AI asistent (MCP)“ a môžete ho kedykoľvek zrušiť.":
    "Den Zugriff sehen Sie unter Einstellungen → API-Schlüssel als „AI asistent (MCP)“ und können ihn jederzeit widerrufen.",
  "Povoliť prístup": "Zugriff erlauben",
  "Povoliť prístup — Faktero": "Zugriff erlauben — Faktero",
  "Faktero má MCP server — cez Model Context Protocol sa naň napojí Claude, ChatGPT, Cursor či iný AI asistent a pracuje s údajmi vašej firmy: povie, kto vám dlhuje, nájde faktúru, vystaví novú alebo pozrie pohyby na účte. Claude.ai a ChatGPT sa prihlásia cez Faktero, ostatní klienti API kľúčom.":
    "Faktero hat einen MCP-Server — über das Model Context Protocol verbinden sich Claude, ChatGPT, Cursor oder ein anderer KI-Assistent und arbeiten mit den Daten Ihres Unternehmens: Sie erfahren, wer Ihnen Geld schuldet, finden eine Rechnung, stellen eine neue aus oder sehen die Kontobewegungen. Claude.ai und ChatGPT melden sich über Faktero an, andere Clients mit einem API-Schlüssel.",
  "Claude.ai a ChatGPT": "Claude.ai und ChatGPT",
  "Pridajte vlastný konektor (v Claude: Nastavenia → Konektory, v ChatGPT: Nastavenia → Aplikácie a konektory) a zadajte len adresu servera. Kľúč netreba — otvorí sa Faktero, prihlásite sa, vyberiete firmu a potvrdíte prístup. Prístup sa objaví medzi API kľúčmi ako „AI asistent (MCP)“ a zrušíte ho tam jedným klikom.":
    "Fügen Sie einen eigenen Konnektor hinzu (in Claude: Einstellungen → Konnektoren, in ChatGPT: Einstellungen → Apps und Konnektoren) und geben Sie nur die Serveradresse ein. Ein Schlüssel ist nicht nötig — Faktero öffnet sich, Sie melden sich an, wählen das Unternehmen und bestätigen den Zugriff. Der Zugriff erscheint unter den API-Schlüsseln als „AI asistent (MCP)“ und lässt sich dort mit einem Klick widerrufen.",
  "Claude, ChatGPT či iný AI asistent sa na Faktero napojí cez MCP. Claude.ai a ChatGPT sa prihlásia cez Faktero bez kľúča, ostatní API kľúčom. Adresa servera je":
    "Claude, ChatGPT oder ein anderer KI-Assistent verbindet sich über MCP mit Faktero. Claude.ai und ChatGPT melden sich ohne Schlüssel über Faktero an, andere mit einem API-Schlüssel. Die Serveradresse lautet",
};
