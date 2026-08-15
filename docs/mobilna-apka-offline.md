# Mobilná appka s offline režimom — plán prechodu

Doteraz je appka obal nad živým webom (`server.url` v `capacitor.config.ts`).
Výhodou je, že každá zmena na webe je hneď aj v telefóne bez schvaľovania.
Nevýhoda je zásadná: **bez signálu sa appka neotvorí**, čo pri knihe jázd
vyraďuje presne tie situácie, na ktoré je určená.

Cieľ: rozhranie zabaliť do appky, dáta ďalej ťahať zo Supabase, a to, čo sa
nedá odoslať teraz, odložiť do fronty.

> Cena za to: každá zmena rozhrania bude odteraz znamenať nový build a
> posudzovanie v App Store (1–3 dni). Web sa nemení.

## Čo je hotové

- **Mobilná appka je samostatný komponent** (`src/components/faktero/mobil/MobilApp.tsx`).
  Trasa `/app` je už len obal. Obrazovky neriešia router, prepína ich stav —
  vďaka tomu sa dajú zostaviť aj mimo TanStack Start.
- **Klientský build** — `vite.config.mobile.ts`, `index.mobile.html`,
  `src/mobile/main.tsx`, výstup do `dist-mobile`. Púšťa ho `npm run build:mobile`,
  ktorý rovno spustí aj `cap sync`.
- **Most na server** — obrazovky si operáciu pýtajú kľúčom (`operacie.ts`),
  vybaví ju `server-most.ts` (web) alebo `server-most.mobile.ts` (appka, cez
  `/api/mobil/<operácia>`). Prepína sa aliasom pri builde. Endpoint volá tú istú
  serverovú funkciu, takže sa logika nezdvojuje a prihlásenie sa nerieši druhý raz.
  **Overené naživo:** bez tokenu 401, s tokenom 57 faktúr, neznáma operácia 404.
- **Capacitor ukazuje na balíček** — `webDir: "dist-mobile"`, `server.url` je preč.

## Čo ostáva

6. **Skúška na zariadení a odoslanie do App Store.**

Kniha jázd aj vystavovanie faktúr bez signálu sú hotové — vozidlá aj odberatelia
sa ukladajú do telefónu hneď pri štarte, nie až pri otvorení obrazovky. Bez toho
mal človek v teréne prázdny zoznam presne tam, kde ho potreboval najviac.

## Ako to bolo predtým

Build zatiaľ neprejde, lebo mobilné obrazovky volajú **serverové funkcie**
(`useServerFn`), ktoré ťahajú do balíčka serverové jadro TanStacku. V balíčku
navyše ani nemôžu fungovať: server funkcie sa volajú relatívnou adresou a
appka beží na vlastnom pôvode (`capacitor://localhost`).

Týka sa to deviatich volaní:

| Obrazovka | Volania |
|---|---|
| Doklady (`MobilApp`) | `nacitajBlocekFn`, `createExpenseFn` |
| Banka | `bankaPrehladFn`, `syncBankTransactions` |
| Vystavené faktúry | `vystaveneFakturyFn`, `generateInvoicePdf`, `sendInvoiceEmailFn`, `bulkMarkPaidFn`, `sendReminderFn` |

Kniha jázd medzi nimi **nie je** — tá ide priamo cez Supabase, takže offline
zvládne všetko hneď, ako bude balíček stáť.

## Pôvodný postup (pre históriu)

1. **Most na server.** `src/lib/mobile/server-volanie.ts` s dvoma
   implementáciami: na webe `useServerFn`, v appke `fetch` na
   `https://www.faktero.sk/api/...` s tokenom prihlásenia. Prepína sa aliasom
   v `vite.config.mobile.ts`, nie podmienkou v kóde.
2. **Endpointy** pre tých deväť volaní pod `/api/mobil/*`.
3. **Prepnutie Capacitora** — `webDir: "dist-mobile"`, zrušiť `server.url`.
   Až tu appka prestane ťahať web.
4. **Offline kniha jázd** — vozidlá a jazdy do IndexedDB, zápisy cez frontu,
   zosúladenie po pripojení.
5. **Zvyšok agend offline** — doklady už frontu majú; faktúry offline len na
   čítanie (číslovanie potrebuje databázu).
6. **Skúška na zariadení a odoslanie.**

## Vystavenie faktúry bez signálu

Dlho tu stálo, že to nepôjde nikdy: číslo musí prideliť databáza, inak vzniknú
dve faktúry s rovnakým číslom. Prvá časť tvrdenia platí, druhá sa dá obísť.

**Odložená faktúra (predvolené).** Údaje sa uložia do telefónu
(`src/lib/mobile/faktury-fronta.ts`) a faktúra sa vystaví sama, len čo je
signál — pri štarte appky, pri otvorení Vystavených faktúr a pri návrate
pripojenia. Číslo prideľuje server ako vždy. Zákazník na mieste nedostane nič.

**Vydávanie s číslom (voliteľné, v Účte).** Appka si v signáli vypýta päť čísel
dopredu (`faktero_reserve_invoice_numbers`) a bez signálu z nich vydáva. Číslo
sa dá odovzdať na mieste. Rezervácia je pre `faktero_next_invoice_number`
rovnako záväzná ako vystavená faktúra, takže to isté číslo nedostane nikto iný.

Nepoužitá rezervácia po dvoch týždňoch prepadne a číslo sa vráti do rady —
generátor berie **najnižšie voľné** číslo, takže dieru sám zaplní. Trvalé diery
v číselnom rade z toho teda nevznikajú. Pri vypnutí sa nepoužité čísla vracajú
hneď (`faktero_release_invoice_numbers`).

Proti duplicite pri stratenej odpovedi ide faktúra s `external_id` — rovnaký
mechanizmus ako vo verejnom API. Rezervácia sa značí za použitú až po zapísaní
položiek: inak by zlyhanie spálilo číslo, ktoré má človek na papieri.

**Overené naživo** (demo firma, produkčný server): číslo prisľúbené offline
sedelo s číslom vystavenej faktúry; opakované odoslanie tej istej faktúry
druhú nevyrobilo; odložená faktúra bez rezervácie dostala číslo od servera.

## Čo offline nebude nikdy

- Čítanie dokladu cez AI a sťahovanie z Finančnej správy — obe sú na serveri.
  Doklad sa odloží a prečíta po pripojení, tak ako dnes.
- PDF faktúry — vytvára ho server. Aj pri vydávaní s číslom platí, že číslo je
  na mieste hotové, ale PDF príde až so signálom.
- Bankové zostatky a synchronizácia s bankou.
