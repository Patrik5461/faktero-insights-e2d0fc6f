// Nemecký preklad manuálu v Pomoci (src/routes/pomoc.api.tsx). Kľúče vyrába pomoc-preklad.test.tsx.
export default {
  "Pomoc — API — Faktero": "Hilfe — API — Faktero",
  "Ako používať Faktero API: kľúče, testovací a ostrý režim, vytvorenie faktúry, webhooky.":
    "So nutzen Sie die Faktero API: Schlüssel, Test- und Live-Modus, Rechnung erstellen, Webhooks.",
  "Návod pre vývojárov na prácu s Faktero API.":
    "Anleitung für Entwickler zur Arbeit mit der Faktero API.",
  "Pomoc · API": "Hilfe · API",
  "Faktero API pre vývojárov": "Faktero API für Entwickler",
  "REST API na automatizáciu vystavovania faktúr a integráciu s vašou aplikáciou.":
    "REST-API zur Automatisierung der Rechnungsstellung und zur Integration in Ihre Anwendung.",
  "Čo je Faktero API": "Was ist die Faktero API",
  "Faktero API je REST rozhranie, ktoré umožňuje vašej aplikácii vytvárať faktúry, spravovať odberateľov a počúvať na udalosti cez webhooky.":
    "Die Faktero API ist eine REST-Schnittstelle, mit der Ihre Anwendung Rechnungen erstellen, Kunden verwalten und über Webhooks auf Ereignisse reagieren kann.",
  "Všetky endpointy bežia pod <0>https://www.faktero.sk/api/v1</0> a používajú JSON.":
    "Alle Endpunkte laufen unter <0>https://www.faktero.sk/api/v1</0> und verwenden JSON.",
  "Kde nájdem API kľúč": "Wo finde ich den API-Schlüssel",
  "Otvorte <0>Nastavenia</0> → <1>API kľúče</1>.":
    "Öffnen Sie <0>Einstellungen</0> → <1>API-Schlüssel</1>.",
  "Kliknite na <0>Vytvoriť nový kľúč</0> a pomenujte ho (napr. „Eshop produkcia“).":
    "Klicken Sie auf <0>Neuen Schlüssel erstellen</0> und benennen Sie ihn (z. B. „Eshop produkcia“).",
  "Kľúč sa zobrazí <0>iba raz</0> — uložte ho na bezpečnom mieste.":
    "Der Schlüssel wird <0>nur einmal</0> angezeigt — bewahren Sie ihn sicher auf.",
  "Kľúč posielajte v hlavičke <0>Authorization: Bearer fk_live_…</0>.":
    "Senden Sie den Schlüssel im Header <0>Authorization: Bearer fk_live_…</0>.",
  "Testovací a ostrý režim": "Test- und Live-Modus",
  "Pri vytváraní kľúča vyberáte režim:": "Beim Erstellen des Schlüssels wählen Sie den Modus:",
  "<0>Test</0> — kľúč smie len čítať (zoznamy, detaily, PDF). Na skúšanie integrácie bez rizika, že niečo vystaví alebo odošle zákazníkovi. Pokus o zápis vráti chybu <1>403 test_key_read_only</1>.":
    "<0>Test</0> — der Schlüssel darf nur lesen (Listen, Details, PDF). Zum Ausprobieren der Integration ohne das Risiko, dass etwas ausgestellt oder an einen Kunden gesendet wird. Ein Schreibversuch liefert den Fehler <1>403 test_key_read_only</1>.",
  "<0>Live (produkcia)</0> — číta aj zapisuje: reálne faktúry, ktoré sa rátajú do mesačného limitu plánu.":
    "<0>Live (Produktion)</0> — liest und schreibt: echte Rechnungen, die auf das monatliche Limit des Tarifs angerechnet werden.",
  "Test kľúče majú prefix <0>fk_test_</0>, live kľúče <1>fk_live_</1>. Zneplatnený kľúč ostáva v zozname so zneplatnením, aby bolo v denníku volaní vidno, čím čo prišlo.":
    "Test-Schlüssel haben das Präfix <0>fk_test_</0>, Live-Schlüssel <1>fk_live_</1>. Ein widerrufener Schlüssel bleibt mit Widerrufsvermerk in der Liste, damit im Aufrufprotokoll erkennbar ist, womit was gekommen ist.",
  "Vytvorenie faktúry cez API": "Rechnung per API erstellen",
  "Príklad cURL volania:": "Beispiel eines cURL-Aufrufs:",
  "Odpoveď obsahuje <0>id</0>, <1>invoice_number</1> a URL na PDF.":
    "Die Antwort enthält <0>id</0>, <1>invoice_number</1> und die URL zum PDF.",
  "Webhooky pošlú HTTP POST na vašu URL, keď nastane udalosť:":
    "Webhooks senden einen HTTP-POST an Ihre URL, wenn ein Ereignis eintritt:",
  "Každý webhook je podpísaný hlavičkou <0>X-Faktero-Signature</0> (HMAC SHA-256 z tela správy a tajného kľúča webhooku). Vždy podpis overte pred spracovaním.":
    "Jeder Webhook ist mit dem Header <0>X-Faktero-Signature</0> signiert (HMAC SHA-256 aus dem Nachrichtentext und dem geheimen Schlüssel des Webhooks). Prüfen Sie die Signatur immer vor der Verarbeitung.",
  "E-shop na WooCommerce": "Onlineshop mit WooCommerce",
  "Na WooCommerce netreba nič programovať — hotový doplnok vystavuje faktúry z objednávok sám. Návod a stiahnutie: <0>Faktúry z e-shopu na WooCommerce</0>.":
    "Für WooCommerce müssen Sie nichts programmieren — ein fertiges Plugin stellt Rechnungen aus Bestellungen selbst aus. Anleitung und Download: <0>Rechnungen aus dem WooCommerce-Shop</0>.",
  "Kompletná dokumentácia a skúšanie": "Vollständige Dokumentation und Ausprobieren",
  "Úplný zoznam endpointov, parametrov a chybových kódov nájdete v <0>API dokumentácii</0>.":
    "Die vollständige Liste der Endpunkte, Parameter und Fehlercodes finden Sie in der <0>API-Dokumentation</0>.",
  "Volania si viete vyskúšať bez písania kódu v <0>API playgrounde</0> — vyberiete endpoint, doplníte parametre a hneď vidíte odpoveď servera aj hotový príkaz pre <1>curl</1>. Playground volá <2>ostré dáta vašej firmy</2>, takže zápisové volania naozaj vytvárajú doklady.":
    "Aufrufe können Sie ohne Programmierung im <0>API-Playground</0> ausprobieren — Endpunkt wählen, Parameter ergänzen und sofort die Serverantwort sowie den fertigen Befehl für <1>curl</1> sehen. Der Playground greift auf die <2>echten Daten Ihres Unternehmens</2> zu, schreibende Aufrufe erstellen also tatsächlich Belege.",
} satisfies Record<string, string>;
