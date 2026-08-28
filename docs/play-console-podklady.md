# Faktero — podklady pre Google Play Console

Pripravené 28. 8. 2026. Všetko je na skopírovanie do Play Console; čo treba doplniť
ručne, je označené `⟨…⟩`. Obdoba `app-store-podklady.md`, ale Google chce iné veci
a najmä prísnejšie obhájenie polohy na pozadí.

---

## 1. Základné údaje

| Pole | Hodnota |
| --- | --- |
| Názov aplikácie | **Faktero** |
| Krátky popis (80 znakov) | **Faktúry, doklady a kniha jázd pre živnostníkov a malé firmy** |
| Balík (package) | `sk.tobify.faktero` |
| Kategória | Business |
| Vekové hodnotenie | Pre všetkých (dotazník bez citlivého obsahu) |
| Jazyk | Slovenčina (primárny), čeština, angličtina, nemčina, maďarčina |
| Web | https://www.faktero.sk |
| E-mail podpory | servis@faktero.sk |
| Zásady ochrany súkromia | https://www.faktero.sk/pravne/gdpr |
| Cena | Zdarma (predplatné sa platí mimo obchodu, cez GoPay na webe) |

**Účet:** vývojárske konto v Play Console stojí jednorazovo 25 USD. Pri firemnom
účte si Google vyžiada overenie firmy (výpis z registra), čo trvá pár dní — ak
to ešte nie je založené, začni tým, lebo to blokuje všetko ostatné.

---

## 2. Ako vyrobiť balík na nahratie

Celé to beží na serveri, Mac netreba:

```bash
cd ~/faktero-invoice-hub
export JAVA_HOME=~/jdk ANDROID_HOME=~/android-sdk

npm run build:mobile                      # webová časť do dist-mobile + cap sync
cd android
./gradlew :app:bundleRelease              # podpísaný .aab pre Play Console
```

Výsledok: `android/app/build/outputs/bundle/release/app-release.aab`

Na skúšku v ruke (mimo obchodu) stačí `./gradlew :app:assembleDebug` a súbor
`app/build/outputs/apk/debug/app-debug.apk` preniesť do telefónu.

### Číslo verzie

`versionCode` v `android/app/build.gradle` je zatiaľ `1`. Play odmietne druhé
nahratie s tým istým číslom, takže **pred každým vydaním ho treba zvýšiť**.
`versionName` je to, čo vidí človek („1.0"); `versionCode` je len číslo pre obchod.

---

## 3. Podpisovací kľúč — prečítaj si to skôr, než čokoľvek nahráš

Kľúč je vygenerovaný a leží v **`~/android-keys/faktero-upload.jks`**, heslo
v `~/android-keys/keystore.properties` (práva `600`, mimo repozitára — keby raz
unikol repozitár, nesmie s ním uniknúť možnosť vydať aktualizáciu pod našim menom).

**Zálohuj obidva súbory mimo servera.** Bez nich sa aktualizácia appky nedá
podpísať. Google síce vie kľúč resetovať cez podporu, ale je to týždňové
vybavovanie a dovtedy sa nedá vydať nič.

Pri prvom nahratí zapni **Play App Signing** (Google si drží distribučný kľúč
sám) — potom je ten náš len „upload key" a jeho strata sa dá riešiť.

---

## 4. Poloha na pozadí — najprísnejšia časť celého procesu

Google si vyžiada formulár **aj video**. Bez toho appku nezverejní. Toto je text
na skopírovanie:

### Prečo appka potrebuje polohu na pozadí

```
Faktero vedie zákonom vyžadovanú knihu jázd. Aplikácia meria prejdenú
vzdialenosť služobnej jazdy a zapisuje ju do knihy jázd používateľa.

Meranie musí pokračovať aj vtedy, keď je aplikácia na pozadí alebo má
používateľ zhasnutý displej — vodič počas jazdy telefón nedrží v ruke a
nesmie s ním manipulovať. Keby meranie bežalo len v popredí, kilometre by
sa doratali nesprávne a kniha jázd by nebola použiteľná ako účtovný doklad.

Polohu používame výhradne na výpočet vzdialenosti a trasy jazdy. Nepoužívame
ju na reklamu, profilovanie ani ju nezdieľame s tretími stranami. Zapína sa
až vtedy, keď používateľ funkciu Kniha jázd sám zapne, a dá sa kedykoľvek
vypnúť. Počas merania beží trvalá notifikácia, takže je vždy vidieť, že
aplikácia polohu používa.
```

### Čo musí byť vo videu (2–3 minúty, bez strihu)

1. Otvorenie aplikácie a prihlásenie.
2. Zapnutie sledovania jázd v aplikácii (aby bolo vidieť, že to zapína človek).
3. Systémové okno s otázkou na polohu a voľba **Vždy povoliť**.
4. Zhasnutie displeja a viditeľná notifikácia „Nahrávam jazdu".
5. Návrat do aplikácie a ukázanie zapísanej jazdy s kilometrami.

Video nahraj na YouTube ako **neverejné (unlisted)** a odkaz vlož do formulára.

### Ostatné povolenia a ich odôvodnenie

| Povolenie | Načo |
| --- | --- |
| `ACCESS_FINE_LOCATION` | meranie trasy a kilometrov jazdy |
| `ACCESS_BACKGROUND_LOCATION` | meranie pokračuje pri zhasnutom displeji (viď vyššie) |
| `FOREGROUND_SERVICE_LOCATION` | trvalá notifikácia, bez ktorej systém meranie zastaví |
| `ACTIVITY_RECOGNITION` | rozpoznanie, že sa ide autom — skracuje čas do spustenia merania |
| `CAMERA` | odfotenie pokladničného dokladu a čítanie QR kódu z bločku |
| `POST_NOTIFICATIONS` | otázka „bola táto jazda služobná?" hneď po rozpoznaní |
| `RECEIVE_BOOT_COMPLETED` | po reštarte telefónu meranie pokračuje |
| `USE_BIOMETRIC` | odomknutie aplikácie odtlačkom namiesto hesla |

---

## 5. Bezpečnosť údajov (Data safety)

Čo vyplniť v dotazníku:

| Otázka | Odpoveď |
| --- | --- |
| Zbiera aplikácia údaje? | Áno |
| Šifruje sa prenos? | Áno (HTTPS) |
| Dá sa požiadať o vymazanie údajov? | Áno — v aplikácii aj na https://www.faktero.sk/pravne/gdpr |

| Typ údaja | Zbiera sa | Zdieľa sa | Povinné | Účel |
| --- | --- | --- | --- | --- |
| Poloha (presná) | Áno | Nie | Nie | Funkčnosť aplikácie — kniha jázd |
| Meno a e-mail | Áno | Nie | Áno | Účet a prihlásenie |
| Fotografie | Áno | Nie | Nie | Doklady odfotené používateľom |
| Finančné údaje (faktúry, doklady) | Áno | Nie | Áno | Funkčnosť aplikácie |
| Identifikátory zariadenia | Áno | Nie | Nie | Notifikácie |

Nič z toho sa nepredáva ani nepoužíva na reklamu — v dotazníku to treba
explicitne odkliknúť, inak Google predpokladá opak.

---

## 6. Texty do obchodu

### Krátky popis (max 80 znakov)

```
Faktúry, doklady a kniha jázd pre živnostníkov a malé firmy.
```

### Úplný popis (max 4000 znakov)

```
Faktero je fakturačný systém a kniha jázd pre slovenských živnostníkov a malé
firmy. Faktúru vystavíte z mobilu za pár sekúnd, doklad odfotíte a údaje sa
doplnia samy, jazdu appka odmeria bez toho, aby ste si na ňu spomenuli.

FAKTÚRY
• Vystavenie faktúry v troch krokoch — odberateľ, položky, splatnosť
• Ceny z vášho cenníka vrátane zliav a akcií
• PDF s QR kódom na platbu (PAY by square)
• Odoslanie e-mailom alebo cez WhatsApp a Messenger
• Zálohové faktúry, dobropisy a opakované faktúry

DOKLADY
• Odfotenie pokladničného dokladu — sumu aj dodávateľa prečíta appka
• Načítanie bločku z eKasa QR kódu
• Doklady si viete posielať aj e-mailom na vlastnú adresu
• Párovanie s platbami z banky

KNIHA JÁZD
• Jazdu appka rozpozná sama a spýta sa, či bola služobná
• Meranie beží aj so zhasnutým displejom
• Kilometre, trasa, priemerná rýchlosť
• Export do PDF a XLSX pre účtovníčku
• Prepojenie s Commander GPS a Tesla Fleet API

ĎALEJ V APLIKÁCII
• Bankové účty a párovanie úhrad
• Sklad, zákazky a objednávky
• Priznanie k DPH a export do Pohody
• Päť jazykov: slovenčina, čeština, angličtina, nemčina, maďarčina

FUNGUJE AJ BEZ SIGNÁLU
Faktúru vystavíte aj bez pripojenia — odošle sa sama, keď sa telefón pripojí.
V aute, kde signál býva najhorší, je to práve to, čo treba.

CENA
30 dní zdarma bez platobnej karty. Potom od 9 € mesačne. Predplatné sa
uzatvára na www.faktero.sk, nie v aplikácii.
```

### Obrázky, ktoré Google vyžaduje

| Čo | Rozmer | Poznámka |
| --- | --- | --- |
| Ikona | 512 × 512 PNG | hotová: `public/play-store-icon.png` |
| Grafika na hlavičku | 1024 × 500 PNG | ⟨zatiaľ nie je⟩ |
| Snímky obrazovky telefónu | min. 2, ideál 8 | dajú sa vziať z appky po skúške na telefóne |

---

## 7. Čo ešte chýba pred prvým vydaním

- [ ] **Skúška na skutočnom telefóne** — najmä či službu nezabije Xiaomi či Samsung
      a či kilometre sedia. Bez toho appku nevydávaj.
- [ ] **`google-services.json`** z Firebase — bez neho na Androide nefungujú
      notifikácie zo servera vôbec.
- [ ] Grafika na hlavičku a snímky obrazovky.
- [ ] Vekový dotazník a vyhlásenie o reklamách (appka reklamy nemá).
- [ ] Zálohovať podpisovací kľúč mimo servera.

---

## 8. Samostatná Kniha jázd

Keď bude Faktero v obchode, druhá appka je to isté ešte raz: vlastný
`applicationId` (`sk.tobify.knihajazd`), vlastný záznam v Play Console, vlastná
ikona a **vlastné obhájenie polohy na pozadí** — to sa z prvej appky neprenáša.
