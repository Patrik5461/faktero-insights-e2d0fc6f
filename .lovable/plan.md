# Faktero Mobile — Fáza 3 hotová

## Fáza 3

- Push cez FCM HTTP v1 (Android + iOS APNs cez FCM): `src/lib/faktero/push.server.ts`
- Registrácia tokenu: `src/lib/mobile/push.ts` (init v `native-init.ts`), ukladá do `profiles.push_token/push_platform`
- Triggery: `invoice.paid` + `efaktura.received` v `webhook-trigger.server.ts`; cron `faktero-push-overdue-daily` (8:00) → `/api/public/hooks/push-overdue`
- Widget: **Capacitor plugin neexistuje** → natívny Swift/Kotlin, návod v `.lovable/widget-readme.md`
- App Store prep: `src/lib/mobile/app-store-prep.ts` + kompletný checklist `.lovable/app-store-checklist.md`
- DB: pridané `profiles.push_token`, `push_platform`, `push_updated_at`
- Nové secrety: `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON`

---

# Faktero Mobile — Fáza 2 hotová

## Build target: B (bundled SPA)

- `package.json` script `build:mobile` = `NITRO_PRESET=static vite build && cap sync`
- Server functions (`createServerFn`, /api/v1/\*) ostávajú na produkčnom doméne `www.faktero.sk`
- Mobilná appka volá API priamo cez `fetch`/`useServerFn` proti tej istej doméne (CORS same-origin, cookie auth)

## Implementované fičúry

| Fíčer                        | Súbory                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Skener dokladov + AI parsing | `src/lib/mobile/receipt-scanner.ts`, `src/lib/faktero/ai-receipt.functions.ts`, `src/routes/_authenticated/faktury.skener.tsx` |
| Biometrické prihlásenie      | `src/lib/mobile/biometric.ts`, biometric tlačidlo v `prihlasenie.tsx`                                                          |
| Rýchla faktúra (3 kroky)     | `src/routes/_authenticated/faktury.rychla.tsx`                                                                                 |
| Zdieľanie PDF                | `src/lib/mobile/share-pdf.ts` (použiteľný v invoice detaile)                                                                   |
| Offline cache + sync fronta  | `src/lib/mobile/offline-queue.ts`, init v `native-init.ts`                                                                     |
| GPS tracking jázd            | `src/lib/mobile/gps-tracker.ts`, `src/routes/_authenticated/jazdy.gps.tsx`                                                     |
| Mobile bottom nav            | upravený FAB → `/faktury/skener`, „Viac" obsahuje Rýchlu faktúru a GPS jazdu                                                   |

## Otvorené pre Fázu 3

- Push notifikácie (Firebase + APNs credentials od teba)
- Background GPS na iOS (vyžaduje background-location capability)
- Home Screen Widget — natívny Swift/Kotlin, mimo Capacitor

---

## Lokálny build — presný postup

### Predpoklady

- **macOS** + **Xcode 15+** + Apple Developer účet ($99/rok)
- **Android Studio** Hedgehog+ + **JDK 17** + Android SDK 34
- Node 20+, Bun nainštalovaný

### 1) Klonni projekt a nainštaluj

```bash
git clone <repo>
cd faktero
bun install
```

### 2) Skontroluj `capacitor.config.ts`

Pre App Store buildup **odstráň/zakomentuj** `server.url`, aby appka načítavala
bundled SPA z `webDir` (inak Apple zamietne ako webview wrapper):

```ts
// server: { url: "https://www.faktero.sk", ... }  // len pre dev live-reload
```

### 3) Bundled SPA build

```bash
bun run build:mobile
# = NITRO_PRESET=static vite build && cap sync
```

Výstup je v `.output/public/` a synchronizuje sa do `ios/App/App/public` resp.
`android/app/src/main/assets/public`.

### 4a) iOS

```bash
bun run cap:add:ios     # iba prvýkrát
bunx cap sync ios
bun run cap:ios         # otvorí Xcode
```

V Xcode:

- **Signing & Capabilities** → vyber svoj Team, Bundle ID `sk.tobify.faktero`
- **Capabilities** → pridaj _Push Notifications_, _Background Modes → Remote notifications_
- **Info.plist** doplň:
  - `NSCameraUsageDescription` = „Skenovanie dokladov a fotografie faktúr"
  - `NSLocationWhenInUseUsageDescription` = „Záznam trasy v knihe jázd"
  - `NSFaceIDUsageDescription` = „Rýchle prihlásenie cez Face ID"
- Cmd+R → spusti na simulátore alebo zariadení

### 4b) Android

```bash
bun run cap:add:android
bunx cap sync android
bun run cap:android     # otvorí Android Studio
```

V `android/app/src/main/AndroidManifest.xml` doplň:

```xml
<uses-permission android:name="android.permission.CAMERA"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.USE_BIOMETRIC"/>
<uses-permission android:name="android.permission.INTERNET"/>
```

Run → vyber emulátor / pripojený telefón.

### 5) Apple Developer Console (pred submit)

- App ID `sk.tobify.faktero` + capability _Push Notifications_
- APNs Auth Key `.p8` (Keys → +) — uložiť pre Fázu 3
- Provisioning Profile (Distribution → App Store)
- App Store Connect → vytvor app záznam, screenshoty, ikona 1024×1024

### 6) Google Play Console + Firebase (pred submit)

- Firebase projekt → _Add Android app_ s package `sk.tobify.faktero`
- Stiahnuť `google-services.json` → `android/app/`
- _Cloud Messaging_ enabled, _Service Account JSON_ pre server-side push (Fáza 3)
- Play Console → Internal testing track → upload AAB (`./gradlew bundleRelease`)

### 7) Otestovanie offline režimu

1. V appke prepni Network off (Airplane mode)
2. Vytvor faktúru/jazdu → uloží sa do queue (toast „Queued")
3. Zapni Network → automatický sync, queue sa vyprázdni
