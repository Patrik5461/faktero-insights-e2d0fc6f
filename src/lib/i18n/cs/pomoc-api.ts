// Český preklad manuálu v Pomoci (src/routes/pomoc.api.tsx). Kľúče vyrába pomoc-preklad.test.tsx.
export default {
  "Pomoc — API — Faktero": "Nápověda — API — Faktero",
  "Ako používať Faktero API: kľúče, testovací a ostrý režim, vytvorenie faktúry, webhooky.":
    "Jak používat Faktero API: klíče, testovací a ostrý režim, vytvoření faktury, webhooky.",
  "Návod pre vývojárov na prácu s Faktero API.": "Návod pro vývojáře k práci s Faktero API.",
  "Pomoc · API": "Nápověda · API",
  "Faktero API pre vývojárov": "Faktero API pro vývojáře",
  "REST API na automatizáciu vystavovania faktúr a integráciu s vašou aplikáciou.":
    "REST API pro automatizaci vystavování faktur a integraci s vaší aplikací.",
  "Čo je Faktero API": "Co je Faktero API",
  "Faktero API je REST rozhranie, ktoré umožňuje vašej aplikácii vytvárať faktúry, spravovať odberateľov a počúvať na udalosti cez webhooky.":
    "Faktero API je rozhraní REST, které vaší aplikaci umožňuje vytvářet faktury, spravovat odběratele a naslouchat událostem přes webhooky.",
  "Všetky endpointy bežia pod <0>https://www.faktero.sk/api/v1</0> a používajú JSON.":
    "Všechny endpointy běží pod <0>https://www.faktero.sk/api/v1</0> a používají JSON.",
  "Kde nájdem API kľúč": "Kde najdu API klíč",
  "Otvorte <0>Nastavenia</0> → <1>API kľúče</1>.": "Otevřete <0>Nastavení</0> → <1>API klíče</1>.",
  "Kliknite na <0>Vytvoriť nový kľúč</0> a pomenujte ho (napr. „Eshop produkcia“).":
    "Klikněte na <0>Vytvořit nový klíč</0> a pojmenujte ho (např. „E-shop produkce“).",
  "Kľúč sa zobrazí <0>iba raz</0> — uložte ho na bezpečnom mieste.":
    "Klíč se zobrazí <0>jen jednou</0> — uložte si ho na bezpečném místě.",
  "Kľúč posielajte v hlavičke <0>Authorization: Bearer fk_live_…</0>.":
    "Klíč posílejte v hlavičce <0>Authorization: Bearer fk_live_…</0>.",
  "Testovací a ostrý režim": "Testovací a ostrý režim",
  "Pri vytváraní kľúča vyberáte režim:": "Při vytváření klíče volíte režim:",
  "<0>Test</0> — kľúč smie len čítať (zoznamy, detaily, PDF). Na skúšanie integrácie bez rizika, že niečo vystaví alebo odošle zákazníkovi. Pokus o zápis vráti chybu <1>403 test_key_read_only</1>.":
    "<0>Test</0> — klíč smí jen číst (seznamy, detaily, PDF). Pro zkoušení integrace bez rizika, že něco vystaví nebo odešle zákazníkovi. Pokus o zápis vrátí chybu <1>403 test_key_read_only</1>.",
  "<0>Live (produkcia)</0> — číta aj zapisuje: reálne faktúry, ktoré sa rátajú do mesačného limitu plánu.":
    "<0>Live (produkce)</0> — čte i zapisuje: skutečné faktury, které se započítávají do měsíčního limitu tarifu.",
  "Test kľúče majú prefix <0>fk_test_</0>, live kľúče <1>fk_live_</1>. Zneplatnený kľúč ostáva v zozname so zneplatnením, aby bolo v denníku volaní vidno, čím čo prišlo.":
    "Testovací klíče mají prefix <0>fk_test_</0>, live klíče <1>fk_live_</1>. Zneplatněný klíč zůstává v seznamu s vyznačeným zneplatněním, aby bylo v deníku volání vidět, čím co přišlo.",
  "Vytvorenie faktúry cez API": "Vytvoření faktury přes API",
  "Príklad cURL volania:": "Příklad volání cURL:",
  "Odpoveď obsahuje <0>id</0>, <1>invoice_number</1> a URL na PDF.":
    "Odpověď obsahuje <0>id</0>, <1>invoice_number</1> a URL na PDF.",
  "Webhooky pošlú HTTP POST na vašu URL, keď nastane udalosť:":
    "Webhooky pošlou HTTP POST na vaši URL, když nastane událost:",
  "Každý webhook je podpísaný hlavičkou <0>X-Faktero-Signature</0> (HMAC SHA-256 z tela správy a tajného kľúča webhooku). Vždy podpis overte pred spracovaním.":
    "Každý webhook je podepsán hlavičkou <0>X-Faktero-Signature</0> (HMAC SHA-256 z těla zprávy a tajného klíče webhooku). Podpis vždy ověřte před zpracováním.",
  "E-shop na WooCommerce": "E-shop na WooCommerce",
  "Na WooCommerce netreba nič programovať — hotový doplnok vystavuje faktúry z objednávok sám. Návod a stiahnutie: <0>Faktúry z e-shopu na WooCommerce</0>.":
    "Pro WooCommerce není třeba nic programovat — hotový doplněk vystavuje faktury z objednávek sám. Návod a stažení: <0>Faktury z e-shopu na WooCommerce</0>.",
  "Kompletná dokumentácia a skúšanie": "Kompletní dokumentace a zkoušení",
  "Úplný zoznam endpointov, parametrov a chybových kódov nájdete v <0>API dokumentácii</0>.":
    "Úplný seznam endpointů, parametrů a chybových kódů najdete v <0>dokumentaci API</0>.",
  "Volania si viete vyskúšať bez písania kódu v <0>API playgrounde</0> — vyberiete endpoint, doplníte parametre a hneď vidíte odpoveď servera aj hotový príkaz pre <1>curl</1>. Playground volá <2>ostré dáta vašej firmy</2>, takže zápisové volania naozaj vytvárajú doklady.":
    "Volání si můžete vyzkoušet bez psaní kódu v <0>API playgroundu</0> — vyberete endpoint, doplníte parametry a hned vidíte odpověď serveru i hotový příkaz pro <1>curl</1>. Playground volá <2>ostrá data vaší firmy</2>, takže zápisová volání opravdu vytvářejí doklady.",
} satisfies Record<string, string>;
