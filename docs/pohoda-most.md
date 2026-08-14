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

Vyváža sa zatiaľ len **vydaná faktúra, zálohová faktúra a dobropis**.

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

**1. Viac agend do toho istého balíka.** Pohoda cez XML berie aj prijaté faktúry
(`receivedInvoice`), pokladňu (`voucher`), banku (`bank`), adresár
(`addressbook`), sklad (`stock`) a zákazky (`contract`). Tabuľky na to máme:
`purchase_invoices`, `cash_entries`, `bank_transactions`, `customers`,
`stock_items`, `jobs`.

**2. Odovzdanie za obdobie.** Nie „vyber faktúry a stiahni", ale „odovzdaj
marec" — jeden balík (XML + PDF + súpiska), evidencia, čo už išlo, a možnosť
poslať to účtovníkovi mailom alebo mu dať prístup (rola účtovníka existuje).
`export_jobs` a `export_logs` na to už sú; `export_logs.status` rozlišuje `ok`
a `skipped`.

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
