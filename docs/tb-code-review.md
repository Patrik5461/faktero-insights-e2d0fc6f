# Faktero — integrácia s Tatra bankou: podklad ku code review

**Verzia dokumentu:** 2026-08-11
**Prevádzkovateľ:** Tobify s. r. o., Športová 707/43, 919 26 Zavar, IČO 56607016
**Aplikácia:** Faktero (https://www.faktero.sk) — fakturačný systém pre slovenské firmy
**Rozsah integrácie:** Tatra banka Premium API — čítanie účtov, transakcií a výpisov (AIS), iniciovanie SEPA prevodu (PIS)

Tento dokument je sprievodcom ku kódu integrácie. Uvádza, čo integrácia robí, ako
nakladá s prístupovými údajmi a dátami klienta a kde presne sa v kóde nachádza,
čo posudzovateľ hľadá. Uvedené sú aj známe obmedzenia — nič v ňom nie je
prikrášlené.

---

## 1. Čo integrácia robí

| Oblasť | Použité volania | Kde v kóde |
|---|---|---|
| Súhlas a prihlásenie klienta | `POST /v*/consents`, `GET /v2/authorize`, `POST /token` | `src/lib/faktero/tatrabanka.server.ts` |
| Účty a zostatky | `GET /v*/accounts` | `tatrabanka.server.ts`, `tatrabanka.functions.ts` |
| Transakcie | `GET /v*/accounts/{id}/transactions` | `bank-sync.server.ts` |
| Mesačné výpisy (PDF/XML) | `POST /v1/accounts/{id}/statements/tasks` a stiahnutie výsledku | `bank-statements.server.ts` |
| SEPA prevod | `POST /v*/payments/sepa-credit-transfers`, potvrdenie a stav | `tatrabanka-payments.server.ts` |

Aplikácia je viacnájomná: jeden účet používateľa môže spravovať viacero firiem a
každá firma má vlastné bankové pripojenie.

## 2. Architektúra a tok dát

- **Serverová aplikácia** (Node.js, TanStack Start) beží na vlastnom serveri
  prevádzkovateľa za nginx s TLS. Komunikácia s bankou prebieha **výhradne zo
  servera**; prehliadač ani mobilná aplikácia sa na API banky nikdy nepripájajú.
- **Databáza** je PostgreSQL (Supabase, EÚ región) s row-level security.
- **Plánované úlohy** (denné sťahovanie transakcií, mesačné výpisy) spúšťa cron
  cez HTTP volanie na interný endpoint chránený tajným tokenom
  (`src/lib/faktero/cron-auth.server.ts`).
- Klientske tajomstvo, servisné kľúče a šifrovací kľúč sú v súbore `.env` na
  serveri s prístupovými právami `600` (čítať smie len systémový účet aplikácie).
  Do repozitára sa nedostanú (`.gitignore`).

## 3. Prihlásenie klienta a správa tokenov

- **OAuth 2.0 Authorization Code + PKCE.** `code_verifier` je 32 náhodných bajtov
  z kryptografického generátora, `code_challenge` je jeho SHA-256 (metóda `S256`)
  — `createPkcePair()` v `tatrabanka.server.ts`.
- `code_verifier` je jednorazový: uloží sa k rozpracovanému pripojeniu a hneď po
  výmene kódu za token sa z databázy maže
  (`src/routes/api/public/tatrabanka/callback.ts`).
- **Klientske tajomstvo** (`TB_CLIENT_SECRET`) je len v prostredí servera. Nikdy
  sa neposiela do prehliadača ani nezapisuje do logov.
- **Access a refresh token sú v databáze šifrované** algoritmom AES-256-GCM
  (`src/lib/faktero/bank-tokens.server.ts`, kľúč sa odvodzuje SHA-256 z
  `PAYMENT_SECRETS_KEY`). Dešifrujú sa až v okamihu volania banky, v pamäti
  procesu.
- Token sa obnovuje automaticky, keď mu do vypršania ostáva menej než 10 minút
  (`ensureFreshToken` v `bank-sync.server.ts`); nový token sa ukladá opäť
  šifrovaný.
- **Platobná časť (PIS)** si servisný token vyžiada pri každej operácii nanovo a
  neukladá ho.

## 4. Prístup k dátam klienta

- Každý riadok v tabuľkách `bank_connections`, `bank_accounts`,
  `bank_transactions` a `bank_statements` patrí konkrétnej firme (`company_id`).
- Nad všetkými tabuľkami je zapnuté **row-level security**; politiky sa viažu na
  funkcie `is_company_member()` a `is_company_admin()`, takže používateľ vidí
  výhradne dáta firiem, ktorých je členom.
- Servisný kľúč databázy (obchádza RLS) sa používa len na serveri, a to v
  plánovaných úlohách a v miestach, kde predtým prebehlo overenie príslušnosti k
  firme.
- Súbory výpisov sú v súkromnom úložisku; prístup k nim je viazaný na členstvo vo
  firme a vydávajú sa časovo obmedzené podpísané odkazy.

## 5. Logovanie

- Logujú sa adresy volaní, HTTP kódy a identifikátor požiadavky (`X-Request-ID`)
  kvôli dohľadateľnosti na strane banky.
- **Netýka sa to tokenov, klientskeho tajomstva ani hesiel** — tie sa do logov
  nezapisujú.
- Pri chybovej odpovedi banky sa loguje skrátené telo odpovede (400 znakov) na
  účely diagnostiky.

## 6. Uchovávanie a mazanie dát

- Transakcie a výpisy sa uchovávajú, kým je pripojenie aktívne — slúžia na
  párovanie úhrad s faktúrami a ako podklad pre účtovníctvo klienta.
- Odpojením banky sa mažú účty a s nimi kaskádovo aj transakcie a výpisy danej
  firmy.
- Súhlas klienta je časovo obmedzený zo strany banky; po vypršaní sa čítanie
  zastaví, kým klient súhlas neobnoví (tlačidlo **Obnoviť súhlas** v aplikácii).

## 7. Spracovanie chýb

- Chyby banky sa nezobrazujú používateľovi surové; prekladajú sa do zrozumiteľnej
  správy a stav pripojenia sa označí ako chybný.
- Sťahovanie beží po pripojeniach nezávisle — zlyhanie jedného klienta
  neovplyvní ostatných.
- Opakované volania sú bezpečné: transakcie sa ukladajú podľa identifikátora z
  banky, takže opakovaný beh nevytvorí duplicitu.

## 8. Vývoj a kontrola kvality

- Celý kód je v TypeScripte so zapnutou typovou kontrolou; pred nasadením beží
  kontrola typov a automatické testy (aktuálne 471).
- Nasadzuje sa skriptom, ktorý zostaví novú verziu do samostatného adresára,
  prepne symbolický odkaz a spustí kontrolu dostupnosti — návrat k predošlej
  verzii je otázkou prepnutia odkazu.
- Zmeny sú v gite s popisom dôvodu; história je dohľadateľná ku každému riadku.

## 9. Známe obmedzenia (stav k 2026-08-11)

1. **Webhooky z banky nie sú v prevádzke.** Nateraz všetko beží cez plánované
   sťahovanie (denne o 9:20, výpisy 5:45).
2. **Platba (PIS) nebola dosiaľ vykonaná v ostrej prevádzke.** Kód je hotový a
   overený proti sandboxu; ostré overenie je pripravené.
3. Prístupové tokeny boli do 2026-08-11 uložené nešifrované; od uvedeného dátumu
   sú šifrované a existujúce záznamy prevedené.

## 10. Čo si pozrieť v kóde

```
src/lib/faktero/tatrabanka.server.ts          — OAuth, PKCE, volania AIS
src/lib/faktero/tatrabanka.functions.ts       — pripojenie a obnova súhlasu
src/routes/api/public/tatrabanka/callback.ts  — návrat z banky, výmena kódu
src/lib/faktero/bank-tokens.server.ts         — šifrovanie tokenov
src/lib/faktero/payment-crypto.server.ts      — AES-256-GCM
src/lib/faktero/bank-sync.server.ts           — denné sťahovanie transakcií
src/lib/faktero/bank-statements.server.ts     — mesačné výpisy
src/lib/faktero/tatrabanka-payments.server.ts — SEPA prevod (PIS)
src/lib/faktero/cron-auth.server.ts           — ochrana plánovaných úloh
```

**Kontakt:** info@faktero.sk, +421 902 101 967
