// Nemecký preklad manuálu v Pomoci (src/routes/pomoc.online-platby.gopay.tsx). Kľúče vyrába pomoc-preklad.test.tsx.
export default {
  "Pomoc — Ako od zákazníkov dostať peniaze — Faktero":
    "Hilfe — So erhalten Sie Geld von Ihren Kunden — Faktero",
  "QR platba na faktúre a párovanie úhrad z banky. Platby kartou pre zákazníkov firmy Faktero neponúka.":
    "QR-Zahlung auf der Rechnung und Zahlungsabgleich mit der Bank. Kartenzahlungen für Kunden des Unternehmens bietet Faktero nicht an.",
  noindex: "noindex",
  "Pomoc · Úhrady faktúr": "Hilfe · Bezahlung von Rechnungen",
  "Ako od zákazníkov dostať peniaze": "So erhalten Sie Geld von Ihren Kunden",
  "Aby firma mohla prijímať platby kartou pod vlastným účtom, potrebuje poskytovateľ platobnej brány zmluvu, ktorá to na spoločnej doméne umožňuje. Kým ju nemáme, funkciu neponúkame — je to poctivejšie, než sľúbiť ju a nechať vás zlyhať pri prvom pokuse.":
    "Damit ein Unternehmen Kartenzahlungen auf eigenes Konto annehmen kann, braucht der Anbieter des Zahlungsgateways einen Vertrag, der das auf einer gemeinsamen Domain erlaubt. Solange wir ihn nicht haben, bieten wir die Funktion nicht an — das ist ehrlicher, als sie zu versprechen und Sie beim ersten Versuch scheitern zu lassen.",
  "Netýka sa to platenia predplatného za Faktero. To cez platobnú bránu funguje bežne.":
    "Das betrifft nicht die Zahlung des Faktero-Abonnements. Diese funktioniert über das Zahlungsgateway ganz normal.",
  "Čo použiť namiesto toho": "Was Sie stattdessen nutzen können",
  "<0>QR platba priamo na faktúre.</0> Na každom PDF je kód PAY by square — odberateľ ho naskenuje v mobilnej banke a má predvyplnenú sumu, IBAN aj variabilný symbol. Netreba nič nastavovať.":
    "<0>QR-Zahlung direkt auf der Rechnung.</0> Auf jedem PDF steht ein PAY-by-square-Code — der Kunde scannt ihn in seiner Banking-App und hat Betrag, IBAN und Verwendungszweck (VS) bereits ausgefüllt. Einrichten müssen Sie nichts.",
  "<0>Párovanie úhrad z banky.</0> Keď platba príde na účet, Faktero ju priradí k faktúre a označí ju za uhradenú. Isté zhody spáruje samo, sporné predloží na rozhodnutie.":
    "<0>Zahlungsabgleich mit der Bank.</0> Sobald eine Zahlung auf dem Konto eingeht, ordnet Faktero sie der Rechnung zu und markiert diese als bezahlt. Eindeutige Treffer gleicht es selbst ab, unklare legt es zur Entscheidung vor.",
  "<0>Upomienky po splatnosti.</0> Tri úrovne s vlastnými textami — odosielajú sa len tým, ktorí naozaj nezaplatili.":
    "<0>Mahnungen nach Fälligkeit.</0> Drei Stufen mit eigenen Texten — sie gehen nur an diejenigen, die wirklich nicht bezahlt haben.",
  "Podrobne to popisuje <0>návod na bankové účty</0>.":
    "Ausführlich beschreibt das die <0>Anleitung zu Bankkonten</0>.",
} satisfies Record<string, string>;
