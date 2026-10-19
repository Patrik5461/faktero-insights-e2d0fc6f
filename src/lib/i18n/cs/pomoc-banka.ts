// Český preklad manuálu v Pomoci (src/routes/pomoc.banka.tsx). Kľúče vyrába pomoc-preklad.test.tsx.
export default {
  "Pomoc — Bankové účty — Faktero": "Nápověda — Bankovní účty — Faktero",
  "Pripojenie banky, sťahovanie transakcií, párovanie úhrad s faktúrami a bankové výpisy vo Faktere.":
    "Připojení banky, stahování transakcí, párování úhrad s fakturami a bankovní výpisy ve Fakteru.",
  "Bankové účty a párovanie úhrad": "Bankovní účty a párování úhrad",
  "Pripojenie banky, sťahovanie pohybov, automatické párovanie faktúr a výpisy.":
    "Připojení banky, stahování pohybů, automatické párování faktur a výpisy.",
  "Načo pripájať banku": "Proč připojovat banku",
  "Aby ste nemuseli ručne označovať, ktorá faktúra je zaplatená. Faktero stiahne pohyby z účtu a spáruje ich s faktúrami podľa variabilného symbolu a sumy.":
    "Abyste nemuseli ručně označovat, která faktura je zaplacená. Faktero stáhne pohyby z účtu a spáruje je s fakturami podle variabilního symbolu a částky.",
  "Účty sa spravujú v <0>Účtovníctvo → Bankové účty</0>.":
    "Účty se spravují v <0>Účetnictví → Bankovní účty</0>.",
  "Pripojenie účtu": "Připojení účtu",
  "V <0>Pripojiť banku</0> vyberte banku a prejdite jej prihlásením. Súhlas na prístup k účtu má obmedzenú platnosť — po jej uplynutí ho treba obnoviť, Faktero na to upozorní.":
    "V <0>Připojit banku</0> vyberte banku a projděte jejím přihlášením. Souhlas s přístupem k účtu má omezenou platnost — po jejím uplynutí je třeba ho obnovit, Faktero na to upozorní.",
  "<0>Ktoré banky.</0> Priamo Tatra banka, ďalej Wise, Wallester a Revolut Business. Ak máte účet v inej banke a v internetbankingu Tatra banky ho máte pripojený cez <1>multibanking</1> (Slovenská sporiteľňa, VÚB, ČSOB a ďalšie), natiahne sa spolu s ostatnými — zostatky aj pohyby. Oficiálne výpisy na stiahnutie ale banka vydá len pre účty vedené v Tatra banke.":
    "<0>Které banky.</0> Přímo Tatra banka, dále Wise, Wallester a Revolut Business. Pokud máte účet v jiné bance a v internetbankingu Tatra banky ho máte připojený přes <1>multibanking</1> (Slovenská sporiteľňa, VÚB, ČSOB a další), natáhne se spolu s ostatními — zůstatky i pohyby. Oficiální výpisy ke stažení ale banka vydá jen pro účty vedené v Tatra bance.",
  "Účet sa dá viesť aj <0>bez pripojenia</0>, len ako číslo účtu na faktúrach.":
    "Účet lze vést i <0>bez připojení</0>, jen jako číslo účtu na fakturách.",
  Wise: "Wise",
  "Wise sa nepripája prihlásením ako banka, ale <0>osobným tokenom</0>. Vo Wise otvorte <1>Settings → API tokens</1>, vytvorte token na čítanie a vložte ho do Faktera.":
    "Wise se nepřipojuje přihlášením jako banka, ale <0>osobním tokenem</0>. Ve Wise otevřete <1>Settings → API tokens</1>, vytvořte token pro čtení a vložte ho do Faktera.",
  "Potom je ešte jeden krok, na ktorý sa ľahko zabudne: <0>výpisy vo Wise chráni podpis</0>. Faktero vám ukáže verejný kľúč — stiahnite si ho ako súbor a nahrajte ho vo Wise k tomu istému tokenu. Kým to nespravíte, zostatky sa načítajú, ale pohyby nie.":
    "Pak je ještě jeden krok, na který se snadno zapomene: <0>výpisy ve Wise chrání podpis</0>. Faktero vám ukáže veřejný klíč — stáhněte si ho jako soubor a nahrajte ho ve Wise ke stejnému tokenu. Dokud to neuděláte, zůstatky se načtou, ale pohyby ne.",
  "Každá mena je vo Fakteri samostatný účet, pretože tak ich vedie aj Wise. Sumy v rôznych menách sa nikdy nesčítavajú.":
    "Každá měna je ve Fakteru samostatný účet, protože tak je vede i Wise. Částky v různých měnách se nikdy nesčítají.",
  "Fio banka": "Fio banka",
  "Fio sa pripája <0>tokenom</0> z internetbankingu: <1>Nastavení → API → Přidat nový token</1>, vyberte účet a oprávnenie <2>Pouze sledovat účet</2>. Token vložte v Bankové účty → Pripojiť banku.":
    "Fio se připojuje <0>tokenem</0> z internetbankingu: <1>Nastavení → API → Přidat nový token</1>, vyberte účet a oprávnění <2>Pouze sledovat účet</2>. Token vložte v Bankovní účty → Připojit banku.",
  "Jeden token patrí jednému účtu — ak máte korunový aj eurový účet, pridajte dva tokeny. Pri pripojení sa hneď stiahnu pohyby za posledných 90 dní (staršie Fio bez ďalšej autorizácie nevydá), potom sa sťahujú každú noc.":
    "Jeden token patří jednomu účtu — pokud máte korunový i eurový účet, přidejte dva tokeny. Při připojení se hned stáhnou pohyby za posledních 90 dní (starší Fio bez další autorizace nevydá), potom se stahují každou noc.",
  "Fio pustí na jeden token len jedno stiahnutie za 30 sekúnd; keď tlačidlo stlačíte dvakrát rýchlo po sebe, Faktero povie, nech chvíľu počkáte.":
    "Fio pustí na jeden token jen jedno stažení za 30 sekund; když tlačítko stisknete dvakrát rychle po sobě, Faktero řekne, ať chvíli počkáte.",
  Wallester: "Wallester",
  "Wallester vydáva firemné karty a jeho pohyby sú platby kartou — teda presne to, čo sa dá spárovať s naskenovanými bločkami podľa mena obchodníka.":
    "Wallester vydává firemní karty a jeho pohyby jsou platby kartou — tedy přesně to, co lze spárovat s naskenovanými účtenkami podle jména obchodníka.",
  "Prístup k ich rozhraniu <0>nie je samoobslužný</0>: treba oň požiadať Wallester (podpora alebo váš kontakt). Postup je potom takýto:":
    "Přístup k jejich rozhraní <0>není samoobslužný</0>: je třeba o něj požádat Wallester (podpora nebo váš kontakt). Postup je pak následující:",
  "V <0>Pripojiť banku</0> kliknite na <1>Vyrobiť verejný kľúč</1> a stiahnite si ho ako súbor.":
    "V <0>Připojit banku</0> klikněte na <1>Vyrobit veřejný klíč</1> a stáhněte si ho jako soubor.",
  "Pošlite ten súbor Wallesteru.": "Pošlete ten soubor Wallesteru.",
  "Oni vám vrátia <0>issuer ID</0>, <1>audience ID</1>, kód produktu a maximálnu platnosť tokenu.":
    "Oni vám vrátí <0>issuer ID</0>, <1>audience ID</1>, kód produktu a maximální platnost tokenu.",
  "Tie štyri údaje doplňte vo Fakteri a dokončite pripojenie.":
    "Tyto čtyři údaje doplňte ve Fakteru a dokončete připojení.",
  "Súkromný kľúč ostáva u nás zašifrovaný a nikam sa neposiela; Wallesteru ide len tá verejná polovica. Pripojenie sa hneď skúsi, takže o preklepe v údajoch viete okamžite.":
    "Soukromý klíč zůstává u nás zašifrovaný a nikam se neposílá; Wallesteru jde jen ta veřejná polovina. Připojení se hned vyzkouší, takže o překlepu v údajích víte okamžitě.",
  "Wallester nie je bežný účet s IBAN-om — je to kartový účet, takže pri ňom neuvidíte číslo účtu ani variabilné symboly.":
    "Wallester není běžný účet s IBANem — je to kartový účet, takže u něj neuvidíte číslo účtu ani variabilní symboly.",
  "Revolut Business": "Revolut Business",
  "Revolut sa pripája certifikátom a potvrdením v prehliadači. Postup má tri kroky, v takomto poradí ich vyžaduje Revolut:":
    "Revolut se připojuje certifikátem a potvrzením v prohlížeči. Postup má tři kroky, v tomto pořadí je vyžaduje Revolut:",
  "V <0>Pripojiť banku</0> kliknite na <1>Vyrobiť certifikát</1> a stiahnite si ho.":
    "V <0>Připojit banku</0> klikněte na <1>Vyrobit certifikát</1> a stáhněte si ho.",
  "V Revolut Business otvorte <0>Settings → APIs → Business API</0>, nahrajte certifikát a ako návratovú adresu zadajte <1>presne tú</1>, ktorú Faktero na obrazovke ukazuje. Musí sedieť na znak.":
    "V Revolut Business otevřete <0>Settings → APIs → Business API</0>, nahrajte certifikát a jako návratovou adresu zadejte <1>přesně tu</1>, kterou Faktero na obrazovce ukazuje. Musí sedět na znak.",
  "Portál vám ukáže <0>client ID</0>. Vložte ho do Faktera, kliknite na <1>Potvrdiť prístup</1> a v Revolute potvrďte, čo Fakteru dovolíte. Stačí čítanie.":
    "Portál vám ukáže <0>client ID</0>. Vložte ho do Faktera, klikněte na <1>Potvrdit přístup</1> a v Revolutu potvrďte, co Fakteru dovolíte. Stačí čtení.",
  "<0>Súhlas platí približne 90 dní.</0> Keď vyprší, sťahovanie prestane a potvrdenie treba zopakovať — je to tá istá cesta, len bez vyrábania certifikátu.":
    "<0>Souhlas platí přibližně 90 dní.</0> Když vyprší, stahování přestane a potvrzení je třeba zopakovat — je to stejná cesta, jen bez vyrábění certifikátu.",
  "Prevod medzi vlastnými menami je v Revolute jedna transakcia, ktorá sa dotýka dvoch účtov. Faktero ju preto zapíše na oba — z jedného odíde, na druhý príde.":
    "Převod mezi vlastními měnami je v Revolutu jedna transakce, která se dotýká dvou účtů. Faktero ji proto zapíše na oba — z jednoho odejde, na druhý přijde.",
  "Kedy sa pohyby objavia": "Kdy se pohyby objeví",
  "Raz denne predpoludním si Faktero samo stiahne pohyby zo všetkých pripojených účtov. To je spodná hranica — nič viac netreba nastavovať.":
    "Jednou denně dopoledne si Faktero samo stáhne pohyby ze všech připojených účtů. To je spodní hranice — nic víc není třeba nastavovat.",
  "Pri <0>Tatra banke</0> to býva rýchlejšie: banka dá vedieť, že sa na účte niečo stalo, a Faktero si po pohyby siahne <1>v priebehu pár sekúnd</1>. Platba prijatá doobeda tak nečaká na ďalšie ráno.":
    "U <0>Tatra banky</0> to bývá rychlejší: banka dá vědět, že se na účtu něco stalo, a Faktero si pro pohyby sáhne <1>během pár sekund</1>. Platba přijatá dopoledne tak nečeká na další ráno.",
  "Sťahovanie sa nespúšťa ručne a je to zámer — nie je čo zrýchliť. Banky vydávajú pohyby s vlastným oneskorením: čo ešte nezaúčtovali, nepošlú ani na požiadanie. Tlačidlo <0>Načítať účty</0> v <1>Bankových účtoch</1> obnoví zoznam účtov a zostatky, nie zoznam pohybov.":
    "Stahování se nespouští ručně a je to záměr — není co zrychlit. Banky vydávají pohyby s vlastním zpožděním: co ještě nezaúčtovaly, nepošlou ani na požádání. Tlačítko <0>Načíst účty</0> v <1>Bankovních účtech</1> obnoví seznam účtů a zůstatky, ne seznam pohybů.",
  "Transakcie a párovanie": "Transakce a párování",
  "<0>Bankové transakcie</0> ukazujú pohyby na účte. Párovanie sa spúšťa tlačidlom <1>Spárovať platby</1> v prehľade faktúr (alebo <2>Spárovať s faktúrami</2> nad transakciami). Nerobí sa samo od seba — úhrada mení stav faktúry, a to nemá prebehnúť bez toho, aby o tom niekto vedel.":
    "<0>Bankovní transakce</0> ukazují pohyby na účtu. Párování se spouští tlačítkem <1>Spárovat platby</1> v přehledu faktur (nebo <2>Spárovat s fakturami</2> nad transakcemi). Neděje se samo od sebe — úhrada mění stav faktury, a to nemá proběhnout, aniž by o tom někdo věděl.",
  "Faktero rozdeľuje nájdené dvojice na dve kôpky:":
    "Faktero rozděluje nalezené dvojice na dvě hromádky:",
  "<0>Isté</0> — sedí variabilný symbol aj suma do haliera a žiadna iná faktúra neprichádza do úvahy. Tie sa dajú zapísať naraz tlačidlom „Spárovať isté“.":
    "<0>Jisté</0> — sedí variabilní symbol i částka na haléř a žádná jiná faktura nepřichází v úvahu. Ty lze zapsat najednou tlačítkem „Spárovat jisté“.",
  "<0>Na rozhodnutie</0> — čiastočná platba, chýbajúci variabilný symbol, alebo rovnako dobre sedia dve faktúry. Pri každej dvojici je napísané, prečo ju Faktero ponúka, a rozhodujete vy.":
    "<0>K rozhodnutí</0> — částečná platba, chybějící variabilní symbol, nebo stejně dobře sedí dvě faktury. U každé dvojice je napsáno, proč ji Faktero nabízí, a rozhodujete vy.",
  "Čiastočná úhrada nechá faktúru otvorenú so zvyškom — ďalšia platba sa napáruje na to, čo ostalo. Za uhradenú sa faktúra označí, až keď je pokrytá celá.":
    "Částečná úhrada nechá fakturu otevřenou se zbytkem — další platba se napáruje na to, co zbylo. Jako uhrazená se faktura označí, až když je pokrytá celá.",
  "Párovanie sa dá vrátiť: v zozname transakcií je pri spárovanom pohybe krížik, ktorý úhradu zmaže a faktúru vráti medzi otvorené.":
    "Párování lze vrátit: v seznamu transakcí je u spárovaného pohybu křížek, který úhradu smaže a fakturu vrátí mezi otevřené.",
  "Odchádzajúce platby sa nepárujú — tie patria k prijatým faktúram, nie k vystaveným. Párovanie podľa variabilného symbolu funguje spoľahlivo len vtedy, keď ho odberateľ uvedie; preto Faktero predvypĺňa variabilný symbol z čísla faktúry.":
    "Odchozí platby se nepárují — ty patří k přijatým fakturám, ne k vystaveným. Párování podle variabilního symbolu funguje spolehlivě jen tehdy, když ho odběratel uvede; proto Faktero předvyplňuje variabilní symbol z čísla faktury.",
  "Úhrada sa dá zapísať aj do <0>uzamknutého obdobia</0> — platby chodia aj mesiace po vystavení faktúry.":
    "Úhradu lze zapsat i do <0>uzamčeného období</0> — platby chodí i měsíce po vystavení faktury.",
  "<0>Bankové výpisy</0> sú mesačné prehľady pre účtovníčku. Pri bankách, ktoré výpisy poskytujú, sa stiahnu priamo od nich.":
    "<0>Bankovní výpisy</0> jsou měsíční přehledy pro účetní. U bank, které výpisy poskytují, se stáhnou přímo od nich.",
  "Pri ostatných si Faktero zostaví vlastný výpis zo stiahnutých transakcií — vo formáte camt.053 aj ako PDF. Taký výpis je len tak úplný, ako sú úplné transakcie, z ktorých vznikol.":
    "U ostatních si Faktero sestaví vlastní výpis ze stažených transakcí — ve formátu camt.053 i jako PDF. Takový výpis je jen tak úplný, jak úplné jsou transakce, ze kterých vznikl.",
  "Odosielanie platieb": "Odesílání plateb",
  "Pri podporovaných bankách sa dá platba odoslať priamo z Faktera. Vyžaduje si to samostatný súhlas — súhlas na čítanie účtu na platby nestačí.":
    "U podporovaných bank lze platbu odeslat přímo z Faktera. Vyžaduje to samostatný souhlas — souhlas se čtením účtu na platby nestačí.",
} satisfies Record<string, string>;
