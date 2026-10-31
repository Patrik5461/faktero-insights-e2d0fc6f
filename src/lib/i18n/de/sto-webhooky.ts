// Opakované doručenie webhookov (webhooky.tsx, webhooky-logy.tsx, zvonček)
// a odkaz na prílohy nad 20 MB (/prilohy/<token>, odoslanie faktúry a ponuky).
export default {
  "Doručené ({http})": "Zugestellt ({http})",
  "Celá história doručení": "Gesamter Zustellverlauf",
  "Neúspešné doručenie skúšame znova po 1 min, 5 min, 30 min, 2 h, 6 h, 12 h a 24 h. Potom ho vzdáme a upozorníme vás v zvončeku. Každé doručenie nesie hlavičku Idempotency-Key — pri opakovaní je rovnaká.":
    "Eine fehlgeschlagene Zustellung wiederholen wir nach 1 Min., 5 Min., 30 Min., 2 Std., 6 Std., 12 Std. und 24 Std. Danach geben wir auf und benachrichtigen Sie über die Glocke. Jede Zustellung trägt den Header Idempotency-Key — bei Wiederholungen bleibt er gleich.",
  "Ďalší pokus": "Nächster Versuch",
  "Vzdané doručenia": "Aufgegebene Zustellungen",
  "Čakajú na ďalší pokus": "Warten auf nächsten Versuch",
  "Opakuje sa": "Wird wiederholt",
  Vzdané: "Aufgegeben",
  "Udalosť už bola doručená.": "Das Ereignis wurde bereits zugestellt.",
  "Doručenie práve prebieha — skúste to o chvíľu.":
    "Die Zustellung läuft gerade — versuchen Sie es gleich noch einmal.",
  "Webhook je vypnutý.": "Der Webhook ist deaktiviert.",
  "Webhook už neexistuje": "Der Webhook existiert nicht mehr",
  "Záznam nenájdený": "Eintrag nicht gefunden",
  "Webhook {adresa} sa nepodarilo doručiť": "Webhook {adresa} konnte nicht zugestellt werden",
  "Webhook {adresa}: {n} udalostí sa nepodarilo doručiť":
    "Webhook {adresa}: {n} Ereignisse konnten nicht zugestellt werden",
  "{udalost} · {chyba}": "{udalost} · {chyba}",
  "{udalost} · po všetkých opakovaniach": "{udalost} · nach allen Wiederholungen",
  "Do mailu sa nezmestili: {subory} — príjemca ich dostal ako odkaz na stiahnutie (platí 30 dní).":
    "Nicht in die E-Mail gepasst: {subory} — der Empfänger hat sie als Download-Link erhalten (30 Tage gültig).",
  "Prílohy dokladu — Faktero": "Anhänge zum Beleg — Faktero",
  "odkaz platí do {datum}": "Link gültig bis {datum}",
  "Prílohy už pri doklade nie sú — odosielateľ ich medzitým odstránil.":
    "Die Anhänge sind nicht mehr beim Beleg — der Absender hat sie inzwischen entfernt.",
  "Odkaz nie je platný alebo už vypršal.": "Der Link ist ungültig oder abgelaufen.",
  "Ak váš endpoint nevráti 2xx do 10 sekúnd, Faktero doručenie zopakuje po 1 min, 5 min, 30 min, 2 h, 6 h, 12 h a 24 h — spolu 8 pokusov počas necelých dvoch dní. Potom ho vzdá a upozorní správcu firmy; z nastavení Webhooky ho možno poslať znova. Každý pokus nesie hlavičky Idempotency-Key a X-Faktero-Delivery-Id (pri opakovaní tej istej udalosti rovnaké) a X-Faktero-Attempt s číslom pokusu — podľa kľúča spoznáte, že udalosť už máte spracovanú. Adresa musí byť https na verejnom serveri (port 443) a overuje sa pri každom pokuse.":
    "Liefert Ihr Endpoint nicht innerhalb von 10 Sekunden 2xx, wiederholt Faktero die Zustellung nach 1 Min., 5 Min., 30 Min., 2 Std., 6 Std., 12 Std. und 24 Std. — insgesamt 8 Versuche in knapp zwei Tagen. Danach gibt Faktero auf und benachrichtigt den Firmenadministrator; in den Webhook-Einstellungen lässt sich die Zustellung erneut senden. Jeder Versuch trägt die Header Idempotency-Key und X-Faktero-Delivery-Id (bei Wiederholung desselben Ereignisses gleich) sowie X-Faktero-Attempt mit der Versuchsnummer — am Schlüssel erkennen Sie, dass Sie das Ereignis bereits verarbeitet haben. Die Adresse muss https auf einem öffentlichen Server (Port 443) sein und wird bei jedem Versuch geprüft.",
};
