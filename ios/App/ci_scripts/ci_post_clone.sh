#!/bin/bash
#
# Príprava zdrojov pre Xcode Cloud.
#
# Xcode Cloud po naklonovaní repozitára rovno rieši závislosti balíkov a stavia.
# Capacitor pluginy sú ale lokálne SPM balíky s cestou do `node_modules`
# (viď ios/App/CapApp-SPM/Package.swift) a `node_modules` v gite nie je — takže
# bez tohto skriptu build padne na „Could not resolve package dependencies".
#
# Rovnako chýba `ios/App/App/public` (zostavené webové rozhranie),
# `capacitor.config.json` a `config.xml` — všetky tri sú v .gitignore, lebo ich
# vyrába `cap sync`. Na `public` je pritom v projekte odkaz v Resources fáze,
# takže bez neho build padne aj keby sa balíky vyriešili.
#
# Xcode Cloud tento skript spúšťa hneď po klonovaní, ešte pred rozlúsknutím
# závislostí — čo je presne ten správny okamih.
set -euo pipefail

# Hneď prvý riadok v logu. Keď v ňom nie je, skript sa vôbec nespustil a nemá
# zmysel hľadať chybu v ňom — príčina je vtedy v tom, že ho Xcode Cloud nenašiel
# alebo stavia starší commit. Vypísaný commit to rovno prezradí.
echo "════ ci_post_clone.sh BEŽÍ ════"
echo "▸ commit: ${CI_COMMIT:-neznámy}  vetva: ${CI_BRANCH:-neznáma}  build: ${CI_BUILD_NUMBER:-?}"

# Vite 7 chce Node ≥ 20.19 / ≥ 22.12. V package.json pole `engines` nie je,
# takže verzia je tu — na serveri aj na Patrikovom stroji beží rovnaká rada 22.
readonly NODE_VERZIA="22.22.3"
readonly NODE_MIN_MAJOR=22

# Skript beží z vlastného priečinka; repozitár je o dve úrovne vyššie.
# `CI_PRIMARY_REPOSITORY_PATH` nastavuje Xcode Cloud, záloha je pre ručné puštenie.
KOREN="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../.." && pwd)}"
cd "$KOREN"
echo "▸ Repozitár: $KOREN"

# ── Ktorá z dvoch appiek ─────────────────────────────────────────────────────
# Xcode Cloud spúšťa skript, ktorý leží vedľa projektu. Kniha jázd má vlastný
# projekt (`ios-jazdy`) a vlastný webový build, inak je príprava tá istá — tak
# je skript jeden a appku si vyberá premennou, rovnako ako Capacitor.
readonly APKA="${CAPACITOR_APP:-faktero}"
if [ "$APKA" = "jazdy" ]; then
  readonly IOS="ios-jazdy"
  readonly BUILD="build:jazdy"
else
  readonly IOS="ios"
  readonly BUILD="build:mobile"
fi
echo "▸ Appka: $APKA (projekt $IOS)"

# ── Node ─────────────────────────────────────────────────────────────────────
# Obrazy Xcode Cloudu Node negarantujú a keď ho majú, býva starší. Preto sa
# doťahuje oficiálny balík z nodejs.org — je to rýchlejšie a predvídateľnejšie
# než Homebrew, ktorý si verziu vyberá sám.
mame_node() {
  command -v node >/dev/null 2>&1 || return 1
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')" || return 1
  [ "$major" -ge "$NODE_MIN_MAJOR" ]
}

if mame_node; then
  echo "▸ Node už je: $(node -v)"
else
  case "$(uname -m)" in
    arm64) PLATFORMA="darwin-arm64" ;;
    x86_64) PLATFORMA="darwin-x64" ;;
    *) echo "✗ Neznáma architektúra: $(uname -m)"; exit 1 ;;
  esac

  BALIK="node-v${NODE_VERZIA}-${PLATFORMA}"
  echo "▸ Sťahujem Node ${NODE_VERZIA} (${PLATFORMA})"
  curl -fsSL --retry 3 "https://nodejs.org/dist/v${NODE_VERZIA}/${BALIK}.tar.xz" -o /tmp/node.tar.xz
  mkdir -p "$HOME/node"
  tar -xJf /tmp/node.tar.xz -C "$HOME/node" --strip-components=1
  export PATH="$HOME/node/bin:$PATH"
  echo "▸ Node nainštalovaný: $(node -v), npm $(npm -v)"
fi

# ── Číslo buildu ─────────────────────────────────────────────────────────────
# V projekte je `CURRENT_PROJECT_VERSION = 1` a nikto ho ručne nedvíha, takže
# každý build by sa volal „1.2 (1)". App Store Connect druhé nahratie s tým
# istým `CFBundleVersion` odmietne — build prejde a padne až na konci, pri
# odovzdaní. Xcode Cloud čísluje svoje behy sám, tak sa jeho číslo zapíše do
# projektu; mení sa len kópia v CI, v gite ostáva jednotka.
#
# Prepisujú sa **všetky štyri** výskyty — appka aj rozšírenie pre živú aktivitu,
# každé v ladiacej aj ostrej konfigurácii. Keby sa čísla rozišli, Apple odmietne
# celý balík s tým, že verzia rozšírenia nesedí s verziou appky.
if [ -n "${CI_BUILD_NUMBER:-}" ]; then
  echo "▸ Číslo buildu: ${CI_BUILD_NUMBER}"
  perl -pi -e "s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = ${CI_BUILD_NUMBER};/g" \
    "$IOS/App/App.xcodeproj/project.pbxproj"
  grep -c "CURRENT_PROJECT_VERSION = ${CI_BUILD_NUMBER};" "$IOS/App/App.xcodeproj/project.pbxproj" \
    | xargs -I{} echo "▸ prepísané výskyty: {} (očakávajú sa 4)"
else
  echo "▸ CI_BUILD_NUMBER nie je nastavené — číslo buildu ostáva z projektu."
fi

# ── Závislosti ───────────────────────────────────────────────────────────────
# `npm ci` a nie `npm install`: verzie majú sedieť s package-lock.json.
# V repozitári je aj bun.lock, ale ten sa tu zámerne nepoužíva — package-lock
# nesie aj mac-ové varianty binárok (esbuild, rollup, lightningcss, oxide).
echo "▸ npm ci"
# Xcode Cloud vie pri mnohých súbežných spojeniach zamrznúť na sťahovaní balíkov.
npm config set maxsockets 3
npm ci --no-audit --no-fund

# ── Webové rozhranie + prekopírovanie do natívneho projektu ──────────────────
# `build:mobile` = klientský build z vite.config.mobile.ts do dist-mobile,
# premenovanie index.mobile.html na index.html, pečiatka verzie a `cap sync`.
# Ten sync je ten `npx cap sync ios` — platforma je v repozitári len jedna.
echo "▸ npm run $BUILD"
npm run "$BUILD"

# `build:mobile` si `cap sync` spúšťa sám; `build:jazdy` synchronizuje len
# Android (ten sa stavia na serveri) — iOS sa dá zosynchronizovať iba tu.
if [ "$APKA" = "jazdy" ]; then
  echo "▸ cap sync ios (Kniha jázd)"
  CAPACITOR_APP=jazdy npx cap sync ios
fi

# ── Kontrola, že sa naozaj vyrobilo to, čo build potrebuje ───────────────────
# Bez tohto by sa chýbajúci súbor prejavil až ako neprehľadná chyba xcodebuildu.
for SUBOR in \
  "node_modules/@faktero/drive-detector/Package.swift" \
  "$IOS/App/App/public/index.html" \
  "$IOS/App/App/capacitor.config.json"
do
  if [ ! -e "$SUBOR" ]; then
    echo "✗ Chýba $SUBOR — build by padol na rozlúsknutí závislostí."
    exit 1
  fi
done

# ── Package.resolved ─────────────────────────────────────────────────────────
# Xcode Cloud stavia s vypnutým automatickým riešením balíkov a odmietne začať
# bez hotového Package.resolved. V gite ho nemáme (Xcode ho prepisuje pri
# každom otvorení projektu, viď .gitignore), tak ho vyrobíme tu.
#
# Ide to až teraz: pokiaľ `node_modules` neexistovalo, nedali sa rozlúsknuť
# lokálne balíky pluginov a resolver by nemal z čoho vychádzať.
readonly XCPROJEKT="$IOS/App/App.xcodeproj"
readonly RESOLVED="$XCPROJEKT/project.xcworkspace/xcshareddata/swiftpm/Package.resolved"

mkdir -p "$(dirname "$RESOLVED")"

# Prvý pokus: xcodebuild. Keď prejde, vyrobí presne ten tvar, ktorý Xcode chce.
# Nesmie ale zhodiť skript — v prostredí Xcode Cloudu je riešenie balíkov vypnuté
# a xcodebuild to zdedí, čiže tu vie skončiť chybou 74. Od toho je druhý pokus.
if command -v xcodebuild >/dev/null 2>&1; then
  echo "▸ 1/2 xcodebuild -resolvePackageDependencies"
  xcodebuild -resolvePackageDependencies -project "$XCPROJEKT" 2>&1 | tail -20 || true
fi

# Druhý pokus: čistý SwiftPM nad CapApp-SPM. Projekt má jedinú referenciu na
# balík — lokálny CapApp-SPM (viď XCLocalSwiftPackageReference v project.pbxproj)
# — takže všetky vzdialené závislosti (capacitor-swift-pm, ion-ios-camera,
# keychain-swift) sú jeho podzávislosti a v tomto zozname budú tiež. `swift`
# nastavenie Xcode Cloudu nezaujíma, preto sa dostane ďalej.
if [ ! -f "$RESOLVED" ] && command -v swift >/dev/null 2>&1; then
  echo "▸ 2/2 swift package resolve (CapApp-SPM)"
  ( cd "$IOS/App/CapApp-SPM" && swift package resolve )
  if [ -f "$IOS/App/CapApp-SPM/Package.resolved" ]; then
    cp "$IOS/App/CapApp-SPM/Package.resolved" "$RESOLVED"
    echo "▸ Zoznam prekopírovaný tam, kde ho Xcode hľadá."
  fi
fi

if [ ! -f "$RESOLVED" ]; then
  echo "✗ Package.resolved sa nevyrobil — build padne na riešení závislostí."
  echo "  Núdzové riešenie: na Macu otvor projekt, File → Packages → Resolve"
  echo "  Package Versions, a súbor commitni (v .gitignore už výnimku má)."
  exit 1
fi
echo "✓ Package.resolved je na mieste:"
cat "$RESOLVED"

echo "✓ Zdroje pripravené, Xcode Cloud môže stavať."
