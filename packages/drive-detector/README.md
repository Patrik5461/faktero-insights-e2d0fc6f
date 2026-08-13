# @faktero/drive-detector

Automatická detekcia jazdy autom a záznam trasy pre knihu jázd. Plugin je
**lokálny** — nikam nič neposiela, len zbiera trasu a odovzdá ju aplikácii.
Ukladanie do knihy jázd si rieši Faktero samo.

Hotový je **iOS**. Android má rovnaké rozhranie, ale každá metóda odmietne
volanie (`unimplemented`), aby sa dal doplniť bez zmeny TypeScript vrstvy.

## Ako to funguje

Detekcia je kaskáda, aby GPS nebežala nadarmo:

1. **Významná zmena polohy** (`startMonitoringSignificantLocationChanges`).
   Prebudí appku po zhruba 500 metroch presunu a funguje aj po jej zabití.
   Batériu nestojí prakticky nič.
2. **Overenie presnou polohou, najviac 90 sekúnd.** Rýchlosť musí súvisle
   držať nad `speedThresholdKmh` po `sustainedSeconds`, musia prísť aspoň
   `minConsecutiveFixes` platné merania za sebou a presnosť musí byť lepšia
   ako `maxAccuracyMeters`. Keď to do 90 sekúnd nevyjde, presná poloha sa
   vypína a vraciame sa do prvého stupňa.
   Pohybové senzory (`CMMotionActivityManager`) sú druhý názor: keď hlásia
   jazdu autom s istotou aspoň `medium`, stačí držať prah 30 sekúnd.
3. **Jazda beží**, kým rýchlosť neklesne pod `stopSpeedKmh` na
   `stopAfterSeconds`. Potom sa vypína presná poloha a emituje `tripEnded`.

**Trasa sa zbiera od prebudenia, nie až od potvrdenia.** Keď prah prejde,
jazda už má aj úsek pred potvrdením; keď neprejde, buffer sa zahodí.

Rozpracovaná jazda je v SQLite v `Application Support` (body sa zapisujú po
dvadsiatich). Prežije zabitie appky aj reštart telefónu — po štarte sa
pokračuje tam, kde sa skončilo.

Trasa sa vracia ako surové body. Polyline sa nekóduje natívne, to je vec
TypeScript vrstvy.

## Použitie

```ts
import { DriveDetector } from "@faktero/drive-detector";

await DriveDetector.configure({
  speedThresholdKmh: 32,
  sustainedSeconds: 60,
  notification: {
    title: "Zaznamenávam jazdu",
    body: "Ide o služobnú cestu?",
    businessLabel: "Služobná",
    privateLabel: "Súkromná",
    discardLabel: "Zrušiť",
  },
});

const stav = await DriveDetector.requestPermissions(); // „počas používania"
if (stav.location === "granted") {
  await DriveDetector.start();
}

// Až keď appka polohu naozaj použila, má zmysel pýtať „vždy".
await DriveDetector.requestBackgroundPermission();

await DriveDetector.addListener("tripEnded", (jazda) => {
  // jazda.points, jazda.distanceMeters, jazda.classification…
});
```

Jazdy nahraté počas zavretej appky sa vyzdvihnú po jej otvorení:

```ts
for (const jazda of await DriveDetector.getUnresolvedTrips()) {
  // …uložiť do vlastnej agendy…
  await DriveDetector.markSynced({ tripId: jazda.id });
}
```

`markSynced` znamená „prevzaté", `discardTrip` znamená „takúto jazdu nechcem"
a na `debounceMinutes` umlčí detekciu. Zameniť sa nesmú.

Notifikácia s tromi tlačidlami sa vypaľuje **natívne**, takže funguje aj keď
appka nebeží. „Služobná" a „Súkromná" volajú `confirmTrip`, „Zrušiť" volá
`discardTrip` — všetko bez otvorenia aplikácie. Bez `notification` v
`configure()` sa notifikácia nevypáli vôbec (v Swifte zámerne nie je ani slovo
po slovensky).

## Nastavenia

| Kľúč | Predvolené | Význam |
|---|---|---|
| `speedThresholdKmh` | 32 | prah rýchlosti pre jazdu autom |
| `sustainedSeconds` | 60 | ako dlho musí prah súvisle držať |
| `minConsecutiveFixes` | 3 | koľko platných meraní za sebou |
| `maxAccuracyMeters` | 50 | horšie merania sa zahadzujú |
| `debounceMinutes` | 30 | ticho po zamietnutí jazdy |
| `stopSpeedKmh` | 5 | pod touto rýchlosťou auto stojí |
| `stopAfterSeconds` | 300 | ako dlho musí stáť, aby sa jazda ukončila |
| `distanceFilterMeters` | 30 | po koľkých metroch príde ďalšie meranie |

Nastavenia sa ukladajú natívne. Po prebudení na pozadí totiž žiadny JavaScript
nebeží a nemal by ich kto dodať.

## Čo musí byť v hlavnej aplikácii

`Info.plist`:

- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`
- `NSMotionUsageDescription`
- `UIBackgroundModes` → `location`

Xcode → Signing & Capabilities → **Background Modes → Location updates**.

V `AppDelegate` v `application(_:didFinishLaunchingWithOptions:)`:

```swift
import FakteroDriveDetector
…
DriveDetectorService.shared.applicationLaunched(options: launchOptions)
```

Bez toho riadku sa pri prebudení na pozadí stratí prvá poloha: systém spustí
proces, ale správcu polohy nemá kto vytvoriť, kým sa nabootuje WebView.

Keď `UIBackgroundModes` chýba, plugin **nespadne** — `allowsBackgroundLocationUpdates`
sa nenastaví a detekcia beží len v popredí. Je to poistka, nie náhrada.

## Testy

Detekčná logika je v cieli `DriveDetectorCore`, ktorý nepozná CoreLocation ani
CoreMotion — čas aj merania sú vstupom, takže sa celá kaskáda prejde bez auta
a bez zariadenia.

```bash
cd packages/drive-detector
xcodebuild test -scheme FakteroDriveDetector \
  -destination 'platform=iOS Simulator,name=iPhone 15'
```

Alebo otvor `Package.swift` v Xcode a spusti testy cez ⌘U.

## Skúška trasy v simulátore (GPX)

Simulátor vie prehrať trasu zo súboru GPX, takže sa detekcia dá odskúšať bez
toho, aby si musel sadnúť do auta.

1. **Priprav GPX.** Stačí zoznam bodov s časovými značkami; simulátor medzi
   nimi interpoluje a dopočíta rýchlosť. Aby sa jazda rozpoznala, body musia
   dávať rýchlosť nad 32 km/h aspoň minútu — pri bodoch po 10 sekundách to je
   zhruba 90 metrov medzi bodmi.

   ```xml
   <?xml version="1.0"?>
   <gpx version="1.1" creator="Faktero">
     <wpt lat="48.1486" lon="17.1077"><time>2026-08-13T08:00:00Z</time></wpt>
     <wpt lat="48.1494" lon="17.1077"><time>2026-08-13T08:00:10Z</time></wpt>
     <wpt lat="48.1502" lon="17.1077"><time>2026-08-13T08:00:20Z</time></wpt>
     <!-- …aspoň 7 bodov, nech to trvá vyše minúty… -->
   </gpx>
   ```

2. **Pridaj súbor do projektu** v Xcode (`App` → Add Files to "App"…).
3. Spusti appku a v Xcode zvoľ **Debug → Simulate Location → <názov súboru>**.
   Alebo v simulátore **Features → Location → Custom Location** na jeden bod.
4. Detekcia potrebuje aj **prebudenie**. Významnú zmenu polohy simulátor
   nevyvolá spoľahlivo, preto sa na skúšku hodí `startTrip()` (ručná jazda) na
   overenie záznamu trasy a GPX prehrávanie na overenie prahu a ukončenia.

Pohybové senzory v simulátore nie sú — `CMMotionActivityManager.isActivityAvailable()`
tam vracia `false`, takže sa skrátenie prahu na 30 sekúnd dá odskúšať len na
zariadení. Detekcia bez senzorov beží normálne, len pomalšie.

## Čo plugin zámerne nerobí

- nedrží presnú polohu zapnutú mimo jazdy ani pri overovaní dlhšie ako 90 s
- neposiela nič na server
- nezapisuje do trasy merania s horšou presnosťou ako `maxAccuracyMeters`
- nespúšťa druhú detekciu počas jazdy
- neukončuje sama ručne spustenú jazdu (kto ju spustil, ten ju ukončí)
