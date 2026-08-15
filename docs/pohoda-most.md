# Most na Pohodu

Ako sa Faktero spája s ekonomickým systémom POHODA (Stormware) a čo z toho je
hotové.

## Kde sme

Súborová výmena obidvoma smermi:

- **Von:** `src/lib/faktero/export.server.ts` → `buildPohodaInvoiceXml` vyrobí
  dátový balík `dataPack`, ktorý sa v Pohode načíta cez _Súbor → Dátová
  komunikácia → XML import/export_.
- **Dnu:** `src/lib/faktero/pohoda.ts` číta Pohoda XML aj mPohoda JSON pri
  importe dokladov do Faktera.

Vyváža sa:

- **Vydaná faktúra, zálohová faktúra a dobropis** — `buildPohodaInvoiceXml`.
- **Prijaté doklady** (`receivedInvoice`) — `buildPohodaExpensesXml`.
- **Pokladňa** (`voucher`, príjmový a výdavkový doklad) — `buildPohodaCashXml`.

**Hlavná cesta je odovzdanie za mesiac** (Účtovné exporty,
`odovzdanie.functions.ts`). Vyberie sa mesiac a vznikne jeden ZIP: XML faktúr,
prijatých dokladov a pokladne, súpisky v CSV, PDF faktúr a skeny dokladov.
Odchádza buď na stiahnutie, alebo tlačidlom **Poslať účtovníčke** rovno mailom
cez Resend na `companies.uctovnik_email` (zadaná adresa sa uloží). Oboje si
zapamätá, čo už odišlo — faktúry cez `export_logs`, prijaté doklady cez
`expense_documents.exported_at` — a nabudúce priloží len nové.

Pri maile má **strop na prílohy** (`STROP_PRILOH_MAILOM`, 12 MB). Resend prijme
40 MB, ale schránka príjemcu býva prísnejšia a base64 objem nafúkne o tretinu;
keď sa PDF a skeny nezmestia, balík odíde bez nich a v texte mailu je o tom
poznámka. Údaje na zaúčtovanie sú dôležitejšie než obrázky.

**Automaticky** to ide 5. v mesiaci cronom `faktero-odovzdanie-mesacne`
(`0 6 5 * *`, hook `/api/public/hooks/odovzdanie-mesacne`, hlavička
`x-faktero-cron-token`) — posiela minulý mesiac a len firmám, ktoré si to zapli
(`companies.odovzdanie_automaticky`) a majú adresu. E-mail v mene firmy sa
nesmie posielať bez jej vedomia, preto sa to zapína, nie vypína. Volanie má
`timeout_milliseconds := 600000`; bez neho pg_net spojenie po piatich sekundách
pretrhne a úloha sa tvári, že prebehla.

Balík nesie **to isté, čo priame prepojenie** — okrem faktúr, prijatých dokladov
a pokladne aj adresár, sklad, skladové pohyby, zákazky a storná, každé ako
vlastný súbor, aby si účtovníčka naimportovala len to, čo chce. Číselníky sa
zapisujú do tej istej tabuľky `pohoda_odoslane` ako pri konektore, takže sa
doklad neodovzdá dvakrát ani pri používaní oboch ciest. Loadery sú spoločné
(`nacitajZakaznikov`, `nacitajZasoby`, `nacitajZakazky`, `nacitajPohyby`,
`nacitajStorna`, `nacitajVazby` v `pohoda-konektor.server.ts`).

Vedľajšie cesty ostávajú: výber jednotlivých faktúr na tej istej stránke (na
doplnenie jedného zabudnutého dokladu) a mesačný balík na stránke Doklady.

## Strážca mlčania

Konektor je tichý zo svojej podstaty — keď prestane chodiť, prestane rovnako
ticho a doklady sa hromadia týždne. Cron `faktero-pohoda-strazca` (`30 6 * * *`,
hook `/api/public/hooks/pohoda-strazca`, `timeout_milliseconds := 120000`) sa
denne pozrie na `api_keys.last_used_at` kľúčov menom `Pohoda — konektor%` a po
**siedmich dňoch ticha** (`DNI_TICHA`) pošle firme mail.

Upozorňuje sa len firma, ktorej konektor **už raz bežal** — balíček stiahnutý a
odložený do zásuvky nie je porucha. Druhýkrát sa ozve až vtedy, keď sa konektor
medzitým rozbehol a znovu stíchol (`companies.pohoda_konektor_upozorneny_at`
porovnané s posledným ozvaním). Rozhoduje kľúč, ktorý sa ozval naposledy —
každé stiahnutie balíčka vyrobí nový a staré ostávajú platné. Mail ide na adresu
firmy, nie účtovníčky: rozhodnúť, či niekomu zavolá, patrí majiteľovi.

## Konektor — Pohoda si doklady vezme sama

POHODA vie XML import spustiť z príkazového riadku:

```
Pohoda.exe /XML "meno" "heslo" "C:\Faktero\import.ini"
```

a `import.ini` povie, odkiaľ brať (`input_dir`) a kam odpovedať (`response_dir`).
Vďaka tomu je celý most na strane účtovníčky **dávkový súbor a naplánovaná
úloha Windows** — nič sa neinštaluje, neotvárajú sa porty a nepotrebuje sa
POHODA mServer (ten obsadí druhú inštanciu Pohody a Stormware ho neodporúča
vystavovať mimo vnútornej siete).

Balíček sa vydáva vo **Firma → Pohoda → Priame prepojenie s Pohodou**
(`pohoda-konektor.functions.ts`). Obsahuje `faktero-pohoda.cmd` s vloženým API
kľúčom, `nastav-ulohu.cmd` (`schtasks`, denne o 2:00) a `NAVOD.txt`. Kľúč vzniká
až pri stiahnutí a nikde sa nezobrazuje; zrušiť sa dá v Nastavenia → API kľúče.

Dva endpointy, obidva na bežnom API kľúči (`overApiKluc`):

- `GET /api/v1/pohoda/davka` — jeden `dataPack` s faktúrami, prijatými dokladmi
  aj pokladňou. **204** znamená, že nie je čo posielať. `?nahlad=1` nezapisuje
  históriu, `?od=RRRR-MM-DD` posunie začiatok. Predvolene sa berie od začiatku
  **minulého mesiaca** — konektor je na priebežnú prácu, dosypanie histórie
  patrí do mesačného balíka. Strop je 200 dokladov na dávku.
- `POST /api/v1/pohoda/odpoved` — `responsePack` z Pohody. Doklad, ktorý Pohoda
  odmietla, sa **vráti do fronty** (inak by u nás bol odovzdaný a v Pohode by
  neexistoval); ostatné si zapíšu číslo, ktoré im Pohoda pridelila
  (`export_logs.pohoda_cislo`, `expense_documents.pohoda_cislo`,
  `cash_entries.pohoda_cislo`). Telo sa dekóduje podľa hlavičky XML — Pohoda
  píše Windows-1250 a inak by sa diakritika v hláškach rozsypala.

**Identifikátor dokladu je jeho `id` a `dataPack id` je stále `FAKTERO`.** Pohoda
kontroluje duplicitu podľa tejto dvojice, takže druhý pokus odmietne sama — aj
keď ten istý doklad príde raz z konektora a raz z mesačného mailu. V `import.ini`
k tomu patrí `check_duplicity=1`.

**Odkaz na PDF** ide do záložky Dokumenty ako `typ:urlAddress`. Vložiť samotný
súbor sa pri importe nedá (`typ:file` je len na export) a podpísaný odkaz zo
Supabase sa nezmestí — schéma dáva URL 255 znakov. Preto má faktúra vlastný
krátky token (`invoices.pdf_token`) a PDF vydáva `/api/public/faktura/$token`,
ktorý podpis vyrobí až pri kliknutí. Vypína sa vo Firma → Pohoda
(`companies.pohoda_odkaz_na_pdf`).

Pokladňa dostala `exported_at` — mesačný balík posielal celý mesiac naraz, ale
denný konektor by bez toho posielal tie isté pohyby každý deň.

### Väzby na doklady, ktoré v Pohode už sú

Storno, dobropis aj odpočet zálohy sa odvolávajú na **číslo, ktoré doklad dostal
v Pohode** — nie na naše. `numberRequested` je len želanie; skutočné číslo
poznáme až z odpovede po importe (`export_logs.pohoda_cislo`, mapa
`cislaVPohode`). Kým sa pôvodný doklad nepotvrdí, väzba sa **vynechá** a doklad
odíde ako doteraz. Radšej doklad bez väzby než doklad, ktorý sa neimportuje.

**Storno** (`polozkyStorna`, agenda `storno` v `pohoda_odoslane`): faktúra, ktorá
už odišla a potom sa zrušila (`invoices.cancelled_at`), dostane cez
`inv:cancelDocument` stornujúci doklad. Pôvodný v Pohode ostáva — účtovníctvo si
ho musí pamätať. Identifikátor položky je `<id faktúry>-storno`, aby nekolidoval
s pôvodnou faktúrou. Storno ide v dávke **posledné**.

**Dobropis** ide cez `inv:correctiveDocument` s `itemTransfer="false"` — položky
nesieme vlastné, dobropis býva čiastočný. Väzbu drží nový stĺpec
`invoices.opravuje_fakturu_id`; predtým bola nanajvýš v poznámke a nedala sa
zistiť inak než hádaním z variabilného symbolu. V rozhraní sa vyberá tým istým
dialógom ako zálohová faktúra, len pre typ „Dobropis".

**Odpočet zálohy** je `inv:invoiceAdvancePaymentItem` — **vlastný druh položky**,
nie záporná bežná. Ako bežná by sa zaúčtovala ako ďalšie plnenie a Pohoda by ju
nespárovala so zálohovou faktúrou. Sadzba sa berie **zo zálohovej faktúry**
(`sadzbaZalohy` z jej `subtotal`/`vat_total`), nie z konečnej — záloha má vlastnú
sadzbu a dopočítať ju z jednej sumy by znamenalo hádať; bez zálohovej faktúry sa
odpočet radšej neposiela. `invoices.advance_amount` je suma **s daňou**. Súhrn
dokladu je o zálohu nižší v jej priehradke, inak by Pohoda hlásila nesúlad medzi
hlavičkou a položkami; zaokrúhlenie ostáva rovnaké, lebo záloha sa odčíta z
oboch strán.

### Adresár a skladové karty

Konektor vie poslať aj číselníky — **odberateľov** (`addressbook`) a **skladové
karty** (`stock`). Obidve sú vypnuté, kým si ich firma nezapne vo Firma → Pohoda
(`pohoda_posielat_adresar`, `pohoda_posielat_sklad`): adresár si Pohoda pri
importe faktúr zakladá aj sama a sklad v nej vedie málokto.

Číselník nemá dátum, takže sa neposiela „od mesiaca", ale podľa zmeny. Zmenená
karta sa v Pohode **prepíše, nezaloží sa druhá** — cez `actionType`
`<add add="true" update="true">` s filtrom na `extId` (naše `id` a
`exSystemName = Faktero`). Aby zmenená karta prešla kontrolou duplicity, nesie
`dataPackItem id` aj verziu záznamu (`<id>-<updated_at bez oddeľovačov>`); späť
sa mapuje cez `holeId()`.

**Odoslaná verzia sa nedrží na karte, ale v tabuľke `pohoda_odoslane`.** Prvý
pokus ju mal ako stĺpec na `customers`/`stock_items` a bol chybný: obidve tabuľky
majú trigger `set_updated_at`, takže vlastný zápis posunul `updated_at`, karta sa
navždy tvárila ako zmenená a chodila každý deň znova. Naostro to bolo vidieť hneď
pri druhom behu.

**Stav skladu sa neposiela.** Schéma `count` pripúšťa len pri exporte z Pohody
(„Stav zásoby (jen pro export)") a je to tak správne — stav tam vzniká
príjemkami a výdajkami, takže dosadené číslo by sa rozišlo s pohybmi. Ide teda
číselník zásob, nie sklad.

Bez členenia skladu (`companies.pohoda_sklad` → element `storage`) sa karty
neposielajú vôbec; schéma ho pri vytvorení vyžaduje a spadla by celá dávka.
Názov karty je na `products`, nie na `stock_items` — bez pripojenia by odišla
karta bez názvu.

### Zákazky

Zákazky (`contract`, tabuľka `jobs`) sa zapínajú
`companies.pohoda_posielat_zakazky`. Hlavný úžitok nie je zoznam zákaziek, ale
to, že **faktúra nesie `inv:contract`** — účtovníčka z Pohody vidí výnos po
zákazkách.

Agenda `contract` **nemá v schéme `actionType` ani `extId`**, takže zákazku sa dá
založiť, ale nie prepísať. Ide preto **práve raz**: `dataPackItem id` je bez
verzie (na rozdiel od adresára a skladu), evidenčné číslo má
`checkDuplicity="true"` a v `pohoda_odoslane` sa neporovnáva verzia, stačí, že
záznam existuje. Neskoršiu zmenu názvu treba prepísať aj v Pohode — rozhranie to
hovorí. `con:text` (názov) je pri vytvorení povinný, bez neho sa zákazka
neposiela.

V dávke majú prednosť zákazky, na ktoré sa odvoláva faktúra v tej istej dávke —
inak by faktúra ukázala na zákazku, ktorá v Pohode ešte nie je. Stav zákazky sa
neposiela: v Pohode je to odkaz do vlastného zoznamu stavov účtovníčky.

### Príjemky a výdajky

Zapínajú sa `companies.pohoda_posielat_pohyby` a **potrebujú zapnuté skladové
karty** — položka sa na kartu odvoláva naším identifikátorom (`typ:stockItem` →
`typ:extId`), nie kódom, ktorý sa dá v Pohode prepísať. Posielajú sa preto len
pohyby, ktorých karta už odišla alebo ide v tej istej dávke, a v dávke idú **až
za kartami**.

Bez nich má účtovníčka karty s nulovými stavmi — množstvá v Pohode vznikajú
práve týmito dokladmi.

Pohyby sa zlievajú do dokladov podľa **smeru, dňa a zdrojového dokladu**
(`zoskupPohyby`); jeden pohyb = jeden doklad by z jedného importu urobil tristo
príjemiek. Identifikátorom dokladu je **id prvého pohybu v skupine** — je stály a
keď na ten istý deň pribudnú ďalšie pohyby, vznikne doklad s iným
identifikátorom, takže sa nestratia. Pri odmietnutí sa do fronty vracia **celá
skupina**, nielen prvý pohyb (`vratSkupinuPohybov`).

Smer sa berie z typu pohybu; pri `inventura` a `oprava` ho typ nepovie a
rozhoduje **znamienko množstva** (prebytok na príjemku, manko na výdajku). Do XML
ide množstvo vždy kladné — smer hovorí druh dokladu.

**Príjemka ide s `notPost`** (nezaúčtovať): náklad je už na prijatom doklade a v
režime skladov A by ho príjemka zaúčtovala druhýkrát. **Výdajka taký príznak v
schéme nemá** a nepotrebuje ho — úbytok zásob proti výnosu na faktúre nič
nezdvojí. Toto chytila validácia proti schéme, nie testy.

Pozor na menné priestory: `extId` je na skladovej karte vyhlásený v `stock.xsd`
(`<stk:extId>`), v adresári v `type.xsd` (`<typ:extId>`) a vo filtri v
`filter.xsd` (`<ftr:extId>`) — obsah rovnaký, predpona iná. Toto chytila až
validácia proti schéme.

Pokladňa sa vyváža **bez rozpisu DPH**: pohyb v pokladni u nás sadzbu nemá
(vklady, výbery, drobné výdavky), kým doklady s DPH sú prijaté doklady a
faktúry. Vymyslená sadzba by bola tichá chyba v priznaní, takže celá suma ide do
nulovej priehradky. Výdavok sa nezapisuje záporne — o smere hovorí `voucherType`
(`receipt` / `expense`).

**Banka sa zámerne nevyváža.** Účtovníčka si výpis načíta priamo z banky (a
Faktero jej vie vyrobiť camt.053), takže náš export by v Pohode vyrobil druhý
komplet bankových dokladov.

Pri prijatom doklade sa zapisuje **len súhrn po sadzbách, nie položky**. Bloček
z pokladne má položky v cenách s daňou a býva ich aj dvadsať („Záloh plech");
do účtovníctva z nich nie je nič, kým rozpis DPH, ktorý pri rozpoznávaní
ukladáme (`expense_documents.vat_breakdown`), je presne to, čo účtovník
potrebuje, a sedí na halier. Vlastné číslo dokladu sa nepýta — Pohoda si ho
pridelí z vlastnej rady a číslo od dodávateľa ide do variabilného symbolu, tak
ako sa prijaté faktúry zadávajú ručne.

## Čo v XML musí sedieť, inak sa doklad zaúčtuje potichu zle

Toto sú veci, ktoré import prejde bez chyby, len je výsledok nesprávny — preto
majú vlastné testy v `export.test.ts`:

| Vec                                 | Prečo na tom záleží                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `issuedAdvanceInvoice` pre zálohovú | ako `issuedInvoice` by sa záloha zaúčtovala ako výnos                                                                                  |
| záporné sumy pri dobropise          | s kladnými by pohľadávku zvýšil, nie znížil                                                                                            |
| `rateVAT` podľa dňa plnenia         | Pohoda drží **priehradku** (high/low/third), percento si domyslí podľa dátumu — doklad z roku 2024 s 20 % je `high`, nie `historyHigh` |
| `round/priceRound`                  | rozdiel medzi hlavičkou a súčtom položiek; bez neho Pohoda hlási nesúlad o cent a doklad sa nedá zlikvidovať úhradou                   |
| vynechanie prázdnych elementov      | prázdny `<typ:ico></typ:ico>` import hlási ako chybu                                                                                   |
| `paymentType` z dokladu             | inak je všetko „príkazom", aj hotovosť                                                                                                 |
| `accounting` a `classificationVAT`  | bez nich sa doklad naimportuje, ale účtovník mu musí všetko priradiť ručne — teda presne tú prácu, ktorú mal export ušetriť            |

**Cudzia mena sa nevyváža.** Pohoda chce rozpis po sadzbách vždy v domácej mene
(`typeCurrencyForeign` nesie len menu, kurz, množstvo a celkovú sumu) a kurz k
faktúre neevidujeme. Taký doklad sa preskočí a povie sa to — `pohodaPrekazka`.

## Ako overiť zmenu XML

Vitest kontroluje obsah, ale nie schému. Proti oficiálnej schéme Stormware sa
dá vzorka overiť takto (mimo repozitára, do dočasného priečinka):

```bash
npm install libxml2-wasm
# stiahnuť www.stormware.cz/xml/schema/version_2/data.xsd a rekurzívne všetko,
# na čo sa odkazuje cez schemaLocation (73 súborov), a schemaLocation prepísať
# na holé názvy súborov
```

Potom `XsdValidator.fromDoc` nad `data.xsd` a `xmlRegisterFsInputProviders()`
z `libxml2-wasm/lib/nodejs.mjs` — bez neho wasm nevidí na disk a všetky importy
schém ticho preskočí, takže validácia vyzerá, že prešla.

Takto sa našlo, že cudzia mena bola postavená zle.

## Čo ďalej

**1. Agendy sú hotové** — faktúry, prijaté doklady, pokladňa, adresár, sklad,
zákazky, príjemky aj výdajky. Ďalej by ostávali už len okrajové veci: ponuky,
objednávky a prevodky medzi skladmi. Pozor, `purchase_invoices` je prázdna
tabuľka — prijaté doklady žijú v `expense_documents`.

**2. Živý most cez POHODA mServer.** _Prekonané konektorom vyššie — ostáva tu
ako záznam, prečo sa touto cestou nešlo._ Pohoda má vstavaný HTTP server:
`POST http://localhost:444/xml`, hlavička `STW-Authorization: Basic
base64(meno:heslo)`, `Content-Type: text/xml`, odpoveďou je `responsePack` so
stavom každého dokladu — teda vieme overiť, že sa doklad naozaj založil, a s
akým číslom. Beží ale u účtovníka na Windows počítači, obsadí jednu inštanciu
Pohody a Stormware neodporúča vystaviť ho na verejnú IP. Znamenalo by to malú
spojku na tom počítači, ktorá si sama ťahá z Faktera, čo je nové — žiadne
otváranie portov. Vlastný program pre Windows so všetkým, čo k tomu patrí.

**3. mPohoda (cloud).** OAuth2 `client_credentials` na
`https://ucet.pohoda.cz/connect/token`, scope `Mph.OpenApi.Access.Sk`, potom
`Bearer` na `https://api.mpohoda.sk`. Skutočné REST API, ale: je len vo variante
**mPohoda Pro** (298 Kč/mes.), zapisovať sa dá vydaná a zálohová faktúra,
prijatá faktúra a objednávky — **pokladňa nie** — a stiahnutie do desktopovej
Pohody je zase naplánovaná úloha Windows
(`Pohoda.exe /mPohoda "meno" "heslo" "jednotka"`). Čiže tá istá úloha ako pri
konektore, plus predplatné a polovica agend. Dáva zmysel jedine tomu, kto
mPohodu Pro už používa.

Bod 1 funguje s každou radou Pohody a účtovníčka neinštaluje nič, preto má
prednosť pred 2 a 3.
