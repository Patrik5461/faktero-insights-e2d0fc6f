
# Faktero Mobile (Capacitor) — plán a otvorené otázky

Pred kódom treba doriešiť 4 veci, inak vyrobíme nefunkčnú appku. Potom navrhujem rozdeliť do **3 fáz** namiesto jedného PR.

---

## A) Kritické rozhodnutia (treba odpoveď)

### 1. Build target — toto rozhoduje o všetkom ďalšom
Faktero beží na **TanStack Start + SSR na Cloudflare Workers**. Capacitor potrebuje **statický web bundle** (`webDir`). Máme dve cesty:

- **(A) `server.url = "https://www.faktero.sk"`** (ako píšeš v kroku 1) — appka je v podstate WebView nad live stránkou. ✅ rýchle, ✅ vždy aktuálne, ❌ **bez internetu appka nefunguje vôbec** (rozporné s krokom 7 „Offline režim"), ❌ Apple App Store toto často **odmieta** ako „len wrapper okolo web stránky" (Guideline 4.2).
- **(B) Bundled SPA build** — pridať druhý Vite build bez SSR, ktorý generuje statické `index.html` + JS, všetky dáta cez Supabase priamo z klienta. ✅ offline možný, ✅ App Store-friendly, ❌ ~3-5 dní práce navyše, ❌ stratíme SSR loadery (musíme prepísať na `useQuery`), ❌ niektoré server functions (PDF gen, eFaktúra) zostávajú server-side a appka ich volá ako API.

**Bez rozhodnutia tu nemá zmysel pokračovať.**

### 2. Push notifikácie — backend
Krok 8 hovorí „Edge Function `send-push` cez FCM + APNs". To znamená:
- Firebase projekt + service account JSON (FCM)
- Apple Developer Account + APNs key `.p8` (APNs)
- Tieto secrets nemám, musíš ich poskytnúť **až po vytvorení Apple/Google účtov** (krok 4-5 z tvojich otázok). Implementujem teraz len **kostru** (DB stĺpce, registrácia tokenu, prázdny endpoint), reálne odosielanie po dodaní credentials.

### 3. Home Screen Widget (krok 11)
Toto **nejde cez Capacitor pluginy** v plnom rozsahu. `@capacitor-community/app-widget` existuje ale je experimentálne a iOS WidgetKit vyžaduje **natívny Swift kód v Xcode** (samostatný Widget Extension target). Návrh: **vynechať z V1**, pridať po publikácii v App Store ako natívne rozšírenie. Súhlasíš?

### 4. Biometria — knižnica
`@capacitor-community/biometric-auth` neexistuje pod týmto názvom. Štandard je **`@aparajita/capacitor-biometric-auth`** alebo **`capacitor-native-biometric`**. Pôjdem s prvou (aktívne udržiavaná).

---

## B) Navrhované fázovanie

### Fáza 1 — Capacitor shell + mobile UI (1 PR, ~1 deň)
- Kroky 1, 2, 3 (Capacitor inštalácia, pluginy, bottom tab bar)
- `capacitor.config.ts`, scripts
- `useIsNative()` hook, `MobileBottomNav` komponent
- Status bar (zelená), splash screen
- **Výstup:** appka sa otvorí v Xcode/Android Studio, zobrazí web cez `server.url` (alebo SPA build podľa A1), s natívnou spodnou navigáciou

### Fáza 2 — Mobile-native features (1 PR, ~1 deň)
- Krok 4 (skener + AI parsing) — kamera → base64 → `aiParseInvoiceFn`
- Krok 5 (rýchla faktúra, swipe-to-paid, share)
- Krok 6 (biometria)
- Krok 10 (share PDF, save to Files)

### Fáza 3 — Background features (1 PR, ~1 deň + tvoje credentials)
- Krok 7 (offline queue + sync) — **len ak A1 = B**
- Krok 8 (push notifikácie) — DB + endpoint kostra teraz, FCM/APNs po dodaní kľúčov
- Krok 9 (GPS tracker pre knihu jázd)

### Vynechané z V1
- Krok 11 (widget) — vyžaduje natívny Swift/Kotlin nad rámec Capacitoru

---

## C) Odpovede na tvoje záverečné otázky (vopred, nech vieš)

1. **Nitro SSR vs mobile:** capacitor.config.ts s `server.url` je technicky kompatibilný (appka len načíta URL), ale **nedoporučujem** — viď A1. Pre App Store treba B (bundled SPA).
2. **iOS build:** macOS + Xcode 15+ + Apple Developer účet ($99/rok) + CocoaPods. `npx cap add ios && npx cap open ios`.
3. **Android build:** Android Studio (Hedgehog+) + JDK 17 + Android SDK 34. `npx cap add android && npx cap open android`.
4. **Apple Developer:** Bundle ID `sk.faktero.app`, App ID s Push Notifications capability, APNs Auth Key (.p8) v Keys sekcii, Provisioning Profile.
5. **Google Play + Firebase:** Firebase projekt → Add Android app s package `sk.faktero.app` → stiahnuť `google-services.json` → Cloud Messaging API enabled → Service Account JSON pre server-side FCM v3 API.
6. **Plne implementovateľné cez Capacitor:** kroky 1-10. **Vyžaduje natívny kód:** krok 11 (widgets), prípadne pokročilé background GPS tracking na iOS.

---

## Odo mňa potrebujem:

1. **A1: A alebo B?** (live WebView vs bundled SPA) — najdôležitejšie
2. **A3:** OK vynechať widget z V1?
3. Začať Fázou 1, alebo upraviť rozsah?
