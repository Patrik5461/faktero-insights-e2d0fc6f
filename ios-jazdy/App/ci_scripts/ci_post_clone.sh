#!/bin/bash
#
# Príprava zdrojov pre Xcode Cloud — Kniha jázd.
#
# Xcode Cloud hľadá skript v priečinku `ci_scripts` vedľa projektu, ktorý
# stavia, takže tu musí byť súbor. Obsah je ale pre obe appky ten istý a
# kópia by sa rozišla pri prvej oprave; skript preto len povie, ktorá appka
# sa stavia, a odovzdá prácu spoločnému.
set -euo pipefail
export CAPACITOR_APP=jazdy
exec "$(dirname "$0")/../../../ios/App/ci_scripts/ci_post_clone.sh"
