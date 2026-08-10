# Faktero pre iOS

Aplikácia je natívny obal (Capacitor), ktorý otvára živý web na
`https://www.faktero.sk/app`. Nie je to webová aplikácia zmenšená do telefónu —
`/app` je samostatný tok postavený pre palec: prihlásenie, výber firmy,
skenovanie dokladov. Nič iné tam nie je.

## Čo appka vie

- prihlásenie e-mailom a heslom, po prvom prihlásení aj Face ID / Touch ID
- výber firmy (pri jedinej firme sa krok preskočí)
- **bloček s QR kódom** — nasnímať kód alebo odfotiť celý bloček; údaje sa
  načítajú z Finančnej správy aj s položkami a rozpisom DPH
- **faktúra v PDF** — výber súboru z telefónu alebo z cloudu
- **viacstranový doklad** — strana po strane, spoja sa do jedného PDF
- po prečítaní sa vždy pýta **spôsob úhrady** a **fotku dokladu**

## Čo treba spraviť na Macu

Zvyšok sa bez macOS a Xcode spraviť nedá — podpisovanie, build ani odoslanie do
App Store Connect na inom systéme nebežia.

```bash
git pull
npm install
npm run build:mobile          # vygeneruje shell a spustí `cap sync`
cd ios/App && pod install     # CocoaPods, potrebné po každom pribudnutí pluginu
npx cap open ios              # otvorí Xcode
```

V Xcode:

1. **Signing & Capabilities** — vybrať tím, `sk.faktero.app` musí sedieť s App
   ID v Apple Developer účte.
2. **Push Notifications** a **Background Modes → Remote notifications**, ak sa
   majú posielať upozornenia (plugin je už v projekte).
3. Ikony a štartovacia obrazovka — `App/Assets.xcassets`.
4. Verzia: `MARKETING_VERSION` a `CURRENT_PROJECT_VERSION`.

## Čo už je nastavené

- **Texty povolení** v `ios/App/App/Info.plist` — fotoaparát, fotky, Face ID.
  Bez nich appka pri prvom fotení spadne a App Store ju neprijme.
- **Iba na výšku** — skener na šírku nedáva zmysel.
- `contentInset: "never"` — odsadenie od výrezu si rieši stránka sama cez
  `env(safe-area-inset-*)`, inak by sa odsadzovalo dvakrát.
- `ITSAppUsesNonExemptEncryption = false` — appka nepoužíva vlastné šifrovanie,
  bez toho sa pri každom builde pýta exportné vyhlásenie.

## Na čo si dať pozor pri recenzii v App Store

- Appka bez účtu neukáže nič, preto do App Store Connect patrí **skúšobný
  účet** aj s firmou a aspoň jedným dokladom.
- Apple sa pýta, prečo appka potrebuje fotoaparát — odpoveď je v texte
  povolenia a je vidieť hneď na prvej obrazovke skenovania.
- Keďže obsah beží zo servera, pri zmene webu sa appka mení bez novej verzie.
  To Apple pripúšťa, kým sa nemení účel aplikácie.
