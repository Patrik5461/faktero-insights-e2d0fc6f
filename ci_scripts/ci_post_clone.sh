#!/bin/bash
#
# Poistka na druhé umiestnenie.
#
# Xcode Cloud hľadá `ci_scripts` vedľa projektu, ktorý stavia — u nás teda
# `ios/App/ci_scripts`, lebo projekt je `ios/App/App.xcodeproj`. Niektoré
# nastavenia ho ale hľadajú v koreni repozitára. Aby sa na tom nedalo pošmyknúť,
# je tu tento presmerovač; skutočná príprava je celá vedľa projektu, na jednom
# mieste.
set -euo pipefail

SKUTOCNY="$(cd "$(dirname "$0")" && pwd)/../ios/App/ci_scripts/ci_post_clone.sh"

if [ ! -x "$SKUTOCNY" ]; then
  echo "✗ Nenašiel sa ios/App/ci_scripts/ci_post_clone.sh (alebo nie je spustiteľný)."
  exit 1
fi

echo "▸ Koreňový ci_post_clone.sh predáva prácu tomu vedľa projektu."
exec "$SKUTOCNY"
