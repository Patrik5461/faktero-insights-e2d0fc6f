# App Store + Play Store Submission Checklist

## Spoločné (oboje stores)

- [ ] Verzia v `package.json`, `ios/App/App.xcodeproj` (CFBundleShortVersionString) a `android/app/build.gradle` (versionName/versionCode) je zladená
- [ ] `bun run build:mobile` (NITRO_PRESET=static) prešiel bez chýb
- [ ] `capacitor.config.ts` má **zakomentovaný `server.url`** (inak Apple zamietne)
- [ ] Ikona 1024×1024 PNG (bez alpha kanála)
- [ ] Privacy policy URL funguje: https://www.faktero.sk/pravne/gdpr
- [ ] Support URL funguje: https://www.faktero.sk/pomoc
- [ ] App lockne portrait orientáciu (alebo povolí všetky)
- [ ] Testované na fyzickom zariadení iOS + Android

---

## iOS — Apple App Store

### Apple Developer Account

- [ ] Apple Developer Program aktívny ($99/rok)
- [ ] App ID `sk.faktero.app` vytvorené (Certificates, IDs & Profiles)
- [ ] Capabilities zapnuté: **Push Notifications**, **Sign in with Apple** (ak používaš)
- [ ] **APNs Auth Key** vygenerovaný (Keys → +, typ "Apple Push Notifications service")
  - Stiahnuť `.p8`, poznačiť **Key ID** a **Team ID**
- [ ] **Distribution Certificate** v Keychain
- [ ] **Provisioning Profile** (App Store distribution) stiahnutý

### Xcode projekt

- [ ] Signing & Capabilities → Team vybraný, Bundle ID `sk.faktero.app`
- [ ] Capabilities: Push Notifications + Background Modes → Remote notifications
- [ ] `Info.plist` obsahuje:
  - `NSCameraUsageDescription` = "Skenovanie dokladov a fotografie faktúr"
  - `NSLocationWhenInUseUsageDescription` = "Záznam trasy v knihe jázd"
  - `NSFaceIDUsageDescription` = "Rýchle prihlásenie cez Face ID"
  - `NSPhotoLibraryUsageDescription` = "Ukladanie a načítanie príloh faktúr"
- [ ] `PrivacyInfo.xcprivacy` (povinné od mája 2024) — popisuje použité Required Reason APIs
- [ ] Build configuration = Release
- [ ] Product → Archive → Distribute App → App Store Connect

### App Store Connect

- [ ] App záznam vytvorený (Bundle ID, primary language SK)
- [ ] Category: **Business**, Subcategory: **Finance**
- [ ] Age rating: **4+**
- [ ] Screenshots:
  - 6.7" iPhone (1290×2796) — min. 3 ks
  - 6.1" iPhone (1179×2556) — min. 3 ks
  - iPad 12.9" (2048×2732) — ak podporuje iPad
- [ ] App Preview video (voliteľné)
- [ ] Popis appky (SK + EN, max 4000 znakov)
- [ ] Keywords (max 100 znakov, oddelené čiarkami)
- [ ] Promotional text (170 znakov)
- [ ] What's New (release notes)
- [ ] Demo account credentials pre review team
- [ ] Privacy → Data Collection deklarácia
- [ ] Export Compliance: štandardná šifra (HTTPS) → exempt
- [ ] Submit for Review

---

## Android — Google Play Store

### Firebase + Service Account

- [ ] Firebase projekt vytvorený
- [ ] Android app pridaná v Firebase Console (package `sk.faktero.app`)
- [ ] `google-services.json` stiahnutý → uložiť do `android/app/`
- [ ] Cloud Messaging API (V1) zapnuté
- [ ] Service Account JSON vygenerovaný (Project Settings → Service Accounts → Generate new private key)
  - Uložiť do Lovable secret `FCM_SERVICE_ACCOUNT_JSON`
  - `FCM_PROJECT_ID` = Firebase project ID
- [ ] APNs Auth Key (.p8) z Apple uploadnutý do Firebase Console → Cloud Messaging → Apple app configuration (pre iOS push cez FCM)

### Android Studio projekt

- [ ] `android/app/build.gradle`:
  - `applicationId "sk.faktero.app"`
  - `compileSdkVersion 34`, `targetSdkVersion 34`, `minSdkVersion 24`
  - `versionCode` a `versionName` zladené s iOS
- [ ] `AndroidManifest.xml` permissions:
  ```xml
  <uses-permission android:name="android.permission.INTERNET"/>
  <uses-permission android:name="android.permission.CAMERA"/>
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
  <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
  <uses-permission android:name="android.permission.USE_BIOMETRIC"/>
  <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
  ```
- [ ] Signing config: upload keystore vygenerovaný (`keytool -genkey -v -keystore faktero-release.keystore -alias faktero -keyalg RSA -keysize 2048 -validity 10000`)
- [ ] `./gradlew bundleRelease` → `android/app/build/outputs/bundle/release/app-release.aab`

### Google Play Console

- [ ] Vývojársky účet aktívny ($25 one-time)
- [ ] Aplikácia vytvorená (Slovak ako default language)
- [ ] **Internal testing** track:
  - Upload AAB
  - Pridať testerov (email zoznam)
  - Otestovať plnú appku
- [ ] Store listing:
  - Krátky popis (80 znakov)
  - Plný popis (4000 znakov)
  - Ikona 512×512
  - Feature graphic 1024×500
  - Screenshots: telefón (min 2), 7" tablet, 10" tablet
- [ ] Categorization: **Business**
- [ ] Content rating dotazník vyplnený
- [ ] Target audience (vek 18+)
- [ ] **Data safety** formulár:
  - Aké údaje appka zbiera (Personal info, Financial info)
  - Či sa zdieľajú s 3. stranami
  - Ako sú zabezpečené (in-transit encryption, RLS)
- [ ] Privacy policy URL: https://www.faktero.sk/pravne/gdpr
- [ ] Pre-launch report skontrolovaný (žiadne crash-y)
- [ ] Promote to **Production** track

---

## Po publishovaní

- [ ] Otestovať deep linking: `faktero://faktury/<id>` na oboch platformách
- [ ] Push notifikácia príde do 30s po `invoice.paid` evente
- [ ] Cron `push-overdue` beží každé ráno o 8:00 (skontrolovať `cron.job_run_details`)
- [ ] Widget sa aktualizuje každých 30 min
- [ ] Crash reporting nastavené (Firebase Crashlytics / Sentry)
- [ ] Analytics events flow-ujú
