#!/usr/bin/env bash
#
# Lokálny preview webu Faktero s demo dátami (redizajn). NIČ NENASADZUJE.
#
# - server počúva len na 127.0.0.1 (nie 0.0.0.0), predvolene port 4317,
# - Supabase, serverové funkcie aj /api idú do demo vrstvy v pamäti
#   (preview/server), sieť mimo tento počítač je zablokovaná,
# - nespúšťa migrácie, crony, synchronizácie ani build,
# - prostredie sa spúšťa čisté (env -i), takže sa k serveru nedostane žiadny
#   kľúč z shellu; .env sa v tomto priečinku nepoužíva.
#
# Použitie:  scripts/preview-redizajn.sh            (port 4317)
#            PREVIEW_PORT=4318 scripts/preview-redizajn.sh
# Návod:     /home/patrik/redizajn-web/PREVIEW.md
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PREVIEW_PORT:-4317}"

if [ -f .env ] || ls .env.* 2>/dev/null | grep -qv example; then
  echo "V priečinku je .env — preview ho nesmie mať (tajomstvá). Odstráň ho a spusti znova." >&2
  exit 1
fi
if ss -ltn 2>/dev/null | grep -qE "[:.]${PORT}\b"; then
  echo "Port ${PORT} je obsadený. Zvoľ iný: PREVIEW_PORT=4318 $0" >&2
  exit 1
fi
if [ ! -e node_modules ]; then
  echo "Chýba node_modules (v worktree je to odkaz na hlavné repo: ln -s /home/patrik/faktero-invoice-hub/node_modules node_modules)." >&2
  exit 1
fi

echo "Preview: http://127.0.0.1:${PORT}/dashboard  (len tento počítač; Ctrl+C ukončí)"
exec env -i \
  PATH="$PATH" HOME="$HOME" TERM="${TERM:-xterm}" LANG="${LANG:-C.UTF-8}" \
  PREVIEW_PORT="$PORT" NODE_ENV=development \
  NODE_OPTIONS="--max-old-space-size=4096" \
  node node_modules/vite/bin/vite.js dev \
  --config vite.config.preview.ts --host 127.0.0.1 --port "$PORT" --strictPort
