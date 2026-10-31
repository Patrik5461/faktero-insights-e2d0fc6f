# Skúška exportu do Pohody (skúšobný balík)

Faktero overuje export do Pohody bez Pohody tromi spôsobmi:

1. každý XML prejde oficiálnou schémou Stormware (`data.xsd`, version_2),
2. ten istý XML sa načíta späť naším importom z Pohody a sumy, DPH, sadzby, kurz,
   členenie KV a väzby musia sedieť na cent (`src/lib/faktero/pohoda-spatny-chod.test.ts`),
3. kontrola pred exportom zastaví doklad, ktorý by Pohoda odmietla.

Čo takto overiť nejde, je **samotná Pohoda**: či skratky (členenie DPH, KV) v jej
číselníku existujú, ako doklad zaúčtuje a čo vráti v odpovedi. Na to je tento balík.

## Čo je v balíku

| Súbor        | Čo skúša                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------- |
| `SK/01`      | vydaná faktúra, sadzby 23/19/5/0 %, KV A1, členenie UD                                         |
| `SK/02`      | zálohová faktúra (vydaná zálohová, bez členenia DPH)                                           |
| `SK/03`      | dobropis k `01` (väzba cez číslo, kladné sumy, KV C1, dátum uplatnenia)                        |
| `SK/04`      | vrubopis (ťarchopis) k `01`                                                                    |
| `SK/05`      | vyúčtovacia faktúra s odpočtom zálohy `02` (položka odpočtu zálohy)                            |
| `SK/06`      | zľava riadku 10 % aj zľava na doklad                                                           |
| `SK/07`      | tuzemské prenesenie § 69 ods. 12 (UDpdp, KV A2, príznak PDP, kód tovaru)                       |
| `SK/08`      | jedna položka v prenesení na bežnej faktúre                                                    |
| `SK/09`      | dodanie tovaru do EÚ (DE, IČ DPH odberateľa)                                                   |
| `SK/10`      | faktúra v USD, kurz ECB 1,0812 USD za 1 €                                                      |
| `SK/11`      | faktúra v USD s odpočtom zálohy                                                                |
| `SK/12`      | daňový doklad k prijatej platbe (interný doklad)                                               |
| `SK/13`      | OSS — predaj spotrebiteľovi do DE, sadzby 19/7 %                                               |
| `SK/14`      | malé sumy (0,04 € + 0,01 € DPH)                                                                |
| `SK/30`–`34` | prijatá faktúra (B2), dobropis (C2), prenesenie z EÚ (B1, PDpdp), v USD, bez nároku na odpočet |
| `SK/35`–`36` | bločky: hotovosť (pokladňa HP), karta (interný doklad), prevod (prijatá faktúra), dve sadzby   |
| `SK/50`      | pokladňa — príjem a výdaj bez DPH                                                              |
| `SK/60`      | bankový výpis — príjem a výdaj                                                                 |
| `CZ/20`      | česká faktúra 21/12 % a opravný daňový doklad k nej (záporný)                                  |
| `CZ/21`      | § 92a — vydaná v prenesení (UDpdp)                                                             |
| `CZ/22`      | faktúra v EUR, kurz ČNB 24,335 Kč za 1 €                                                       |
| `CZ/40`      | prijatá 21 % a prijatý opravný daňový doklad                                                   |
| `CZ/41`      | § 92a — prijaté plnenie (DDpdp)                                                                |

Slovenské súbory patria do **slovenskej** Pohody, `CZ/` do **českej** — každá verzia
má iné typy dokladov a číselníky.

## Ako ho vyrobiť

```
node scripts/pohoda-skuska.mjs                  # pohoda-skuska-<dátum>.zip
node scripts/pohoda-skuska.mjs --bez-kodov      # bez predkontácií, účtu, strediska
node scripts/pohoda-skuska.mjs --ico-sk=12345678 --ico-cz=87654321
```

V hlavičke balíka je IČO účtovnej jednotky — Pohoda balík s iným IČO odmietne.
Predvolene je to firma **Test** (86179504) a **QA Česká** (25097563); pri importe
do kópie inej jednotky zadajte jej IČO cez `--ico-sk` / `--ico-cz`.
Každý beh dostane nové identifikátory položiek, takže sa skúška dá zopakovať.

## Import do skúšobnej účtovnej jednotky

1. **Zálohujte** alebo použite kópiu účtovnej jednotky (Súbor → Zálohovanie,
   alebo Súbor → Účtovné jednotky → Nová podľa existujúcej). Nikdy nie ostrú.
2. V Pohode skontrolujte skratky, na ktoré sa doklady odvolávajú:
   - členenie DPH `UD`, `UDpdp`, `PD`, `PDpdp` (SK) / `UD`, `UDpdp`, `PD`, `DDpdp` (CZ;
     pri `DDpdp` musí byť v členení vyplnený „Kód předmětu plnění“),
   - predkontácie `3Fv`, `3Zv`, `3Dv`, `1Fp`, `1Pv`, `1Bv`, bankový účet `TB`
     (CZ `KB`) a pokladňa `HP` — alebo balík vyrobte s `--bez-kodov`,
   - mena USD (SK) a EUR (CZ) v kurzovom lístku.
3. **Súbor → Dátová komunikácia → XML import…** Vyberte súbory v poradí čísel
   (`01` pred `03`, `02` pred `05` — dobropis a odpočet zálohy hľadajú pôvodný
   doklad podľa čísla). Zaškrtnite „Kontrola duplicity“.
4. Po importe Pohoda uloží **odpoveď** (`responsePack`, súbor s „Response“ v mene
   alebo v priečinku odpovedí). Pošlite ju späť — stačí ZIP všetkých odpovedí.

## Čo skontrolovať v Pohode

- **Sumy a DPH** každého dokladu sedia s tabuľkou vyššie (Faktero ich overilo na cent).
- **Priznanie k DPH** (Účtovníctvo → Daň z pridanej hodnoty): `07` v riadku pre
  prenesenie, `09` v dodaní do EÚ, `32` ako samozdanenie (daň aj jej odpočet v tom istom období).
- **Kontrolný výkaz** (SK): A1 = `01`, `05`, `06`; A2 = `07`, `08`; C1 = `03`;
  B1 = `32`; B2 = `30`; C2 = `31`; B3 = bločky `35`, `36`. Doklad bez KV nesmie byť
  zaradený (zálohová `02`, `34` bez odpočtu).
- **Kontrolné hlásenie** (CZ): A.1 = `21`, B.1 = `41`, opravný doklad `20` so
  záporným základom.
- **Kurzy:** `10` = 100 USD pri kurze 1,0812 → 92,49 € základ; `22` = 100 € × 24,335 Kč.
- **Väzby:** `03` je dobropis k `01`, `05` má odpočet zálohy z `02`.
- **Bločky:** `35` hotovosť je v pokladni HP, karta v interných dokladoch,
  prevod v prijatých faktúrach.
- **Pokladňa a banka:** pohyby `50` a `60` majú správny smer (príjem/výdaj).

## Vyhodnotenie odpovede

```
npx jiti scripts/pohoda-odpoved.ts odpoved.xml pohoda-skuska-<dátum>.zip
```

Skript pri každom doklade vypíše, či ho Pohoda založila, pod akým číslom, čo
upravila (upozornenie, napr. `[603]`) alebo prečo ho odmietla (`[108]` neznáma
skratka, `[109]` duplicitné číslo, `[103]` uzamknuté obdobie…), a doklady, o ktorých
Pohoda mlčí. Skončí kódom 1, keď niečo Pohoda odmietla.

Tú istú odpoveď vie spracovať aj aplikácia: **Účtovníctvo → Prepojenie s Pohodou →
Nahrať odpoveď z Pohody (XML)** — potvrdí čísla dokladov a odmietnuté vráti do fronty
(pri skúšobnom balíku nič nezmení, jeho doklady vo Fakteri nie sú).
