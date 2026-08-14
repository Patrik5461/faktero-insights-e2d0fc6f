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
  `src/mobile/main.tsx`. Výstup ide do `dist-mobile`.

## Na čom to stojí

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

## Postup

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

## Čo offline nebude nikdy

- Vystavenie faktúry s číslom z radu — číslovanie musí prideliť databáza, inak
  vzniknú dve faktúry s rovnakým číslom.
- Čítanie dokladu cez AI a sťahovanie z Finančnej správy — obe sú na serveri.
  Doklad sa odloží a prečíta po pripojení, tak ako dnes.
- Bankové zostatky a synchronizácia s bankou.
