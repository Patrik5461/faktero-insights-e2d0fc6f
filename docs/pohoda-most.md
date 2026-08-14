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

Dostať sa to von dá dvoma cestami:

1. **Odovzdanie za mesiac** (Účtovné exporty, `odovzdanie.functions.ts`) — jeden
   ZIP s XML faktúr, súpiskou, PDF faktúr a pokladňou, ak v mesiaci nejaký pohyb
   bol. Tlačidlo „Odovzdať" si zapamätá, čo už odišlo (`export_logs`), a
   nabudúce priloží len nové doklady. **Toto je hlavná cesta** — výber
   jednotlivých faktúr nižšie je na doplnenie jedného zabudnutého dokladu.
2. **Mesačný balík dokladov** (Doklady) — `pohoda.xml` vedľa súpisky a skenov.

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

**1. Poslať balík účtovníčke priamo.** Dnes sa ZIP stiahne a človek ho pošle
sám. Mailom (Resend už používame) alebo cez prístup pre rolu účtovníka by z toho
bolo skutočné odovzdanie bez medzikroku.

**2. Zvyšné agendy.** Pohoda berie ešte adresár (`addressbook`), sklad (`stock`)
a zákazky (`contract`) — `customers`, `stock_items`, `jobs`. Adresár si Pohoda
pri importe faktúr zakladá sama, takže úžitok je malý; sklad a zákazky dávajú
zmysel len tomu, kto ich v Pohode naozaj vedie. Pozor, `purchase_invoices` je
prázdna tabuľka — prijaté doklady žijú v `expense_documents`.

**3. Živý most cez POHODA mServer.** Pohoda má vstavaný HTTP server:
`POST http://localhost:444/xml`, hlavička `STW-Authorization: Basic
base64(meno:heslo)`, `Content-Type: text/xml`, odpoveďou je `responsePack` so
stavom každého dokladu — teda vieme overiť, že sa doklad naozaj založil, a s
akým číslom. Beží ale u účtovníka na Windows počítači, obsadí jednu inštanciu
Pohody a Stormware neodporúča vystaviť ho na verejnú IP. Znamenalo by to malú
spojku na tom počítači, ktorá si sama ťahá z Faktera, čo je nové — žiadne
otváranie portov. Vlastný program pre Windows so všetkým, čo k tomu patrí.

**4. mPohoda (cloud).** OAuth2 `client_credentials` na
`https://ucet.pohoda.cz/connect/token`, scope `Mph.OpenApi.Access.Sk`, potom
`Bearer` na `https://api.mpohoda.sk`. Bez inštalácie čohokoľvek, ale len vo
variante **mPohoda Pro** a dáva zmysel iba tomu, kto mPohodu už používa.

Poradie podľa úžitku: **2 → 1 → 3 → 4**. Body 2 a 1 fungujú s každou radou
Pohody a účtovník neinštaluje nič.
