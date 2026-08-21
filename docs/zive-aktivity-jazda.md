# Prúžok „Nahrávam jazdu" na uzamknutej obrazovke

Živá aktivita (Live Activity), ktorá je v telefóne vidieť celý čas, kým jazda
beží — bez odomykania a bez otvárania appky.

## Prečo

Detekcia sa ozve **jedinou notifikáciou** v okamihu, keď jazdu rozpozná. Telefón
býva vtedy vo vrecku alebo v držiaku so zapnutým sústredením na šoférovanie,
takže sa to ľahko prehliadne — a človek potom celú cestu nevie, či sa niečo
nahráva. Istotu mal až po príchode v knihe jázd.

V appke je od 2026-08-20 aj pruh „Nahrávam jazdu" (`PrebiehaJazda.tsx`), ale ten
treba otvoriť. Prúžok na uzamknutej obrazovke je odpoveď na to isté bez otvárania.

## Ako je to poskladané

```
detekcia (SPM plugin)                appka (cieľ App)              rozšírenie
DriveDetectorService  ──ohlásenie──▸ DriveLiveActivity  ──ActivityKit──▸ FakteroDriveActivity
  tripStarted                          zapni()                          kreslí prúžok
  pointAppended (škrtené)              obnov()                          a Dynamic Island
  tripEnded                            ukonci()
```

- **Plugin o prúžku nevie.** Ohlasuje len „jazda začala / posunula sa / skončila"
  cez `NotificationCenter` (`Notification.Name.fakteroDrive*`, kľúče
  `DriveEventKey`). Kreslenie ani slovenčina doňho nepatria.
- **`DriveLiveActivity`** je v cieli `App`, pretože ten beží vždy, keď beží
  detekcia — vrátane prebudenia na pozadí, keď WebView neexistuje.
- **`FakteroDriveActivity`** je samostatné rozšírenie appky; iOS ho spustí, len
  keď má prúžok vykresliť.
- **`DriveActivityAttributes.swift` je v dvoch cieľoch naraz** (App aj
  rozšírenie). Sú to dva samostatné programy; ActivityKit ich spája podľa mena
  typu a tvaru údajov. Dve kópie súboru by boli tichá pasca — premenované pole
  a prúžok sa jednoducho nikdy neukáže, bez chyby a bez varovania.

## Na čo si dať pozor

- **`@available(iOS 16.1, *)`** na `DriveActivityAttributes` je povinné. Appka
  beží od iOS 15.0 a `ActivityAttributes` existuje až od 16.1 — bez označenia
  sa cieľ appky ani neskompiluje. Rozšírenie má vlastný
  `IPHONEOS_DEPLOYMENT_TARGET = 16.1`.
- **`NSSupportsLiveActivities`** v `App/Info.plist`. Bez neho ActivityKit prúžok
  odmietne zapnúť a dôvod nepovie.
- **Verzia sa musí bumpnúť v oboch cieľoch.** `MARKETING_VERSION` aj
  `CURRENT_PROJECT_VERSION` sú nastavené zvlášť pre `App` a zvlášť pre
  `FakteroDriveActivity`; keď sa rozídu, App Store Connect balík odmietne.
- **Nové ID balíka** `sk.tobify.faktero.DriveActivity` si žiada vlastné App ID
  a profil. Pri automatickom podpisovaní si ho Xcode (a Xcode Cloud) vyrobí sám,
  ale prvý build po tejto zmene je to prvé miesto, kde to môže zaseknúť.
- **Obnovenia majú denný strop.** Preto sa prúžok prekresľuje najviac raz za
  30 s (`obnovaSekund`) a plynúci čas kreslí `Text(_:style: .timer)`, ktorý si
  systém obnovuje sám zadarmo.
- **Príliš dlhý prúžok** iOS po ôsmich hodinách ukončí sám; jazda tým nie je
  dotknutá, meria sa ďalej.

## Čo sa nedá overiť na serveri

Swift sa na Linuxe neskompiluje, takže natívna časť je do prvého buildu
v Xcode Cloude **neoverená** — platí to isté, čo pri vzniku pluginu. Overené je
len to, že `project.pbxproj` je platný (prečítaný knižnicou `xcode`, oba ciele
aj fáza „Embed Foundation Extensions" sedia) a že zdieľaný súbor je naozaj
v zdrojoch oboch cieľov.

Na Macu sa prúžok dá vyskúšať bez auta: `startTrip()` (ručná jazda) ho zapne
rovnako ako detekcia — v ohlásení je `manual: true`, takže na prúžku bude
„spustená ručne".

## Farby prúžku

Pozadie si prúžok určuje sám (`activityBackgroundTint`), **texty preto musia mať
farbu napísanú natvrdo**. Prvá verzia mala čierne priesvitné pozadie a texty
nechala v systémovej `primary` — na telefóne vo svetlom režime to bolo čierne na
tmavom a nedalo sa to prečítať. Odteraz je pozadie zelené (`#007e46`, to isté
`--primary` ako web) a všetko na ňom biele.

Keby sa niekedy chcel natívny vzhľad namiesto zelenej, stačí riadok
`.activityBackgroundTint(FAKTERO_ZELENA)` vymazať — systém potom nakreslí
pozadie sám a farby textov sa musia vrátiť na `.primary`/`.secondary`.

