# Faktero — podklady pre App Store Connect

Pripravené 12. 8. 2026. Všetko v tomto súbore je na skopírovanie do App Store Connect;
čo treba doplniť ručne, je označené `⟨…⟩`.

---

## 1. Základné údaje

| Pole | Hodnota |
| --- | --- |
| Názov aplikácie | **Faktero** |
| Podnadpis (30 znakov) | **Faktúry a kniha jázd** |
| Bundle ID | `sk.faktero.app` |
| Primárna kategória | Business |
| Sekundárna kategória | Finance |
| Veková hranica | 4+ (bez obmedzení) |
| Jazyk | Slovenčina (primárny) |
| Šifrovanie | `ITSAppUsesNonExemptEncryption = false` — v Info.plist už je, otázka o šifrovaní sa nezobrazí |
| Marketingová URL | https://www.faktero.sk |
| URL podpory | https://www.faktero.sk/kontakt |
| Zásady ochrany súkromia | https://www.faktero.sk/pravne/gdpr |

---

## 2. Popis (Description)

```
Faktero je fakturačný systém a kniha jázd pre slovenských živnostníkov a malé firmy.
Vystavíte faktúru z mobilu za pár sekúnd, doklad odfotíte a údaje sa doplnia samy,
jazdu zapíšete hneď po príchode.

FAKTÚRY
• Vystavenie faktúry z mobilu aj z počítača, PDF s QR platbou
• Odoslanie odberateľovi e-mailom priamo z aplikácie
• Zálohové faktúry, dobropisy a opakované faktúry
• Cenník s dohodnutými cenami, zľavami a akciami
• Prehľad neuhradených a faktúr po splatnosti

DOKLADY A NÁKLADY
• Odfotenie bločku alebo nasnímanie QR kódu — údaje sa prečítajú samy
• Prijaté faktúry od dodávateľov aj s prílohou v PDF
• Pokladňa a prehľad DPH pre účtovníka
• Export do Pohody, KROS Omega a Money S3

KNIHA JÁZD
• Služobné jazdy s automatickým výpočtom kilometrov
• Vozidlá, spotreba a tankovania
• Napojenie na Commander GPS a Tesla Fleet API
• Mesačná kniha jázd v PDF

SKLAD A ZÁKAZKY
• Skladové karty, príjem, výdaj a inventúra
• Zákazky, ktoré zbierajú výnosy aj náklady na jednom mieste

BANKA
• Prehľad pohybov na účte cez Tatra banka API
• Automatické párovanie platieb s faktúrami

Faktero je slovenská aplikácia — pozná naše sadzby DPH, formát faktúry aj eKasa doklady.

Predplatné sa uzatvára na www.faktero.sk. Aplikácia sa prihlasuje do existujúceho účtu.
```

**Promo text (170 znakov)**

```
Faktúra z mobilu za pár sekúnd, bloček odfotíte a údaje sa doplnia samy, jazdu zapíšete hneď po príchode. Slovenský fakturačný systém a kniha jázd v jednom.
```

**Kľúčové slová (100 znakov)**

```
faktura,fakturacia,faktury,kniha jazd,uctovnictvo,bloček,dph,sklad,zivnostnik,podnikanie
```

**Čo je nové (prvá verzia)**

```
Prvá verzia Faktera pre iPhone.
```

---

## 3. Poznámky pre recenzenta (App Review Information)

Do poľa **Notes** skopírujte:

```
Faktero je fakturačný systém pre slovenské firmy. Aplikácia vyžaduje účet.

DEMO ÚČET
E-mail: demo@faktero.sk
Heslo: FakteroDemo2026!
Účet má vytvorenú firmu, odberateľa, dve faktúry (jedna uhradená), vozidlo a jazdu,
takže všetky obrazovky sú naplnené dátami.

ČO SI MÔŽETE VYSKÚŠAŤ
1. Prihláste sa demo účtom.
2. Domov → Nová faktúra: vyberte odberateľa a položku, faktúru vystavíte tlačidlom.
3. Domov → Doklady: odfotenie bločku alebo QR kód (fotoaparát).
4. Domov → Kniha jázd: zápis jazdy; poloha sa použije len počas jazdy, ktorú spustíte.
5. Nastavenia → Zabezpečenie: prihlásenie cez Face ID (voliteľné).

PREČO NEJDE O WEB V OBALE (guideline 4.2)
Aplikácia používa fotoaparát na snímanie dokladov a čítanie QR kódov, Face ID na
odomknutie, polohu na meranie kilometrov jazdy a systémové zdieľanie na odoslanie PDF.
Obrazovky sú stavané pre mobil, nie prevzaté z webu.

NÁKUPY (guideline 3.1.3(b))
Faktero je služba pre firmy, predplatné sa uzatvára a platí mimo aplikácie na
www.faktero.sk. Aplikácia neponúka žiadny nákup ani odkaz na nákup a neodomyká
funkcie platbou v aplikácii — prihlasuje sa do už existujúceho firemného účtu.

ZRUŠENIE ÚČTU (guideline 5.1.1(v))
Nastavenia → Zrušiť účet. Účet sa zruší po 14-dňovom odklade, žiadosť sa dá do tej doby
odvolať. Zrušením sa zmažú firemné údaje aj prílohy.
```

**Kontaktná osoba:** ⟨meno, telefón, e-mail⟩

---

## 4. Povolenia a ich vysvetlenia

Texty sú už v `ios/App/App/Info.plist` a Apple ich zobrazuje pri prvom vyžiadaní:

| Povolenie | Text v aplikácii |
| --- | --- |
| Fotoaparát | Fotoaparát potrebujeme na odfotenie pokladničného dokladu a na nasnímanie QR kódu z bločku. |
| Fotky (čítanie) | Prístup k fotkám potrebujeme, keď doklad nefotíte teraz, ale vyberáte už uloženú fotku. |
| Fotky (zápis) | Do fotiek ukladáme kópiu dokladu, keď si ju vyžiadate. |
| Face ID | Face ID použijeme na rýchle odomknutie aplikácie bez zadávania hesla. |
| Poloha (počas používania) | Polohu potrebujeme na odmeranie kilometrov služobnej jazdy do knihy jázd. Meriame len počas jazdy, ktorú sami spustíte. |

---

## 5. App Privacy (štítky o súkromí)

Vypĺňa sa v App Store Connect → App Privacy. Faktero zbiera:

| Typ údaja | Účel | Viazané na identitu | Sledovanie |
| --- | --- | --- | --- |
| Kontaktné údaje — e-mail, meno | Funkčnosť aplikácie (účet) | Áno | Nie |
| Finančné údaje — faktúry, doklady, platby | Funkčnosť aplikácie | Áno | Nie |
| Poloha — presná, len počas jazdy | Funkčnosť aplikácie (kniha jázd) | Áno | Nie |
| Fotografie — fotky dokladov | Funkčnosť aplikácie | Áno | Nie |
| Identifikátory — ID používateľa | Funkčnosť aplikácie | Áno | Nie |
| Diagnostika — chybové hlásenia | Analytika aplikácie | Nie | Nie |

Odpoveď na otázku „Do you use data for tracking?“ je **Nie** — Faktero nemá reklamné
SDK ani meranie naprieč aplikáciami tretích strán.

---

## 6. Snímky obrazovky

Apple vyžaduje 6,7" (iPhone 15/16 Pro Max, 1290 × 2796) a 6,5" (1242 × 2688). Stačí
5 snímok, poradie určuje, čo človek uvidí ako prvé:

1. **Domov** — dlaždice a prehľad (ukazuje, čo appka vie)
2. **Nová faktúra** — vyplnená položkami
3. **Doklady / fotenie bločku** — s otvoreným fotoaparátom alebo hotovým dokladom
4. **Kniha jázd** — zoznam jázd s kilometrami
5. **Pohyby na účte** — banka

Snímky vyrobíte v Xcode simulátore (iPhone 16 Pro Max) na demo účte; Simulator →
File → Save Screen. Alebo priamo na zariadení a orežte na požadovaný rozmer.

---

## 7. Čo treba spraviť pred odoslaním

- [ ] Build v Xcode: tím, `sk.faktero.app`, verzia 1.0, build 1
- [ ] **Push Notifications** capability — v projekte už je (`App.entitlements` s
      `aps-environment`, `remote-notification` v `UIBackgroundModes`). V Xcode len over,
      že sa Signing & Capabilities nesťažuje; doplnenie neskôr znamená nový build.
- [ ] Archive → Distribute App → App Store Connect → Upload
- [ ] V App Store Connect vyplniť sekcie z tohto dokumentu
- [ ] Nahrať snímky obrazovky
- [ ] Vyplniť App Privacy podľa tabuľky vyššie
- [ ] Skontrolovať, že demo účet funguje (prihlásenie + vidno dáta)
- [ ] **Najprv TestFlight** — po nahratí sa build objaví v TestFlight → iOS Builds; interné
      testovanie ide hneď, externá skupina potrebuje jednorazové Beta App Review
- [ ] Submit for Review

---

## 8. Poznámky, na ktoré si dať pozor

- **Demo účet nesmie vypršať.** Predplatné firmy `Faktero Demo s.r.o.` je nastavené do
  31. 12. 2027, takže recenzentovi nezhasne uprostred posudzovania.
- **V aplikácii nesmie pribudnúť odkaz na kúpu predplatného.** Dnes ho tam nemá — mobilná
  časť (`/app`) obrazovku s cenníkom ani platbou neobsahuje. Keby pribudol odkaz na
  web s cenníkom, Apple to bude posudzovať podľa pravidla 3.1.1 a odmietne to.
- **Push ide priamo do APNs, Firebase netreba** (od 2026-08-14, `docs/push-apns.md`).
  Serverové premenné `APNS_*` sú nastavené. Čaká sa už len na token zo skutočného
  zariadenia — ten vznikne pri prvom spustení buildu z TestFlightu. V popise appky
  push zatiaľ nesľubujeme, kým to neprejde naostro.
- **eFaktúra (Peppol) ešte nie je napojená.** Popis ju spomína len v kontexte webu, nie
  ako funkciu aplikácie.
