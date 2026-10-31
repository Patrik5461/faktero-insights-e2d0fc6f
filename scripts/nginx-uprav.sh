#!/usr/bin/env bash
# Úprava nginx pre Faktero (návrh 2026-10-31). Spustiť ako root:
#   sudo bash /home/patrik/faktero-invoice-hub/scripts/nginx-uprav.sh
#
# Čo spraví:
#   1. server_tokens off globálne v nginx.conf a aj v bloku pre port 80
#      (http://… prezrádzal „nginx/1.24.0 (Ubuntu)“; 443 už mal off),
#   2. holá doména faktero.sk → 301 na www.faktero.sk, ale len GET/HEAD a mimo
#      /api/, /oauth/, /.well-known/ a /webhook (API klienti a OAuth ostávajú),
#   3. nič viac: gzip už v konfigurácii stránky je (overené — HTML aj JS chodia
#      gzip) a CSP Report-Only posiela appka sama zo src/server.ts.
#      Starší /home/patrik/nginx-audit-uprava.sh už NESPÚŠŤAŤ — pridal by CSP
#      druhý raz.
#
# Konfiguráciu stránky nahrádza celým súborom docs/nginx-navrh/faktero.conf,
# ale len keď živý súbor presne zodpovedá tomu, z ktorého návrh vznikol
# (docs/nginx-navrh/faktero.povodny.conf). Ak ho medzitým niekto zmenil
# (certbot…), skončí a ukáže rozdiel — nič neprepíše.
# Pred zmenou zálohuje oba súbory; keď `nginx -t` neprejde, vráti ich späť.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Spustite cez sudo."; exit 1; }

ADR="$(cd "$(dirname "$0")/.." && pwd)/docs/nginx-navrh"
HLAVNY=/etc/nginx/nginx.conf
STRANKA="$(readlink -f /etc/nginx/sites-enabled/faktero)"
CAS=$(date +%Y%m%d-%H%M%S)

[ -f "$ADR/faktero.conf" ] && [ -f "$ADR/faktero.povodny.conf" ] || {
  echo "Chýba $ADR/faktero.conf alebo faktero.povodny.conf."
  exit 1
}

if cmp -s "$STRANKA" "$ADR/faktero.conf"; then
  echo "Konfigurácia stránky už je upravená — preskakujem."
  STRANKA_MENIT=0
elif cmp -s "$STRANKA" "$ADR/faktero.povodny.conf"; then
  STRANKA_MENIT=1
else
  echo "Živý $STRANKA sa líši od východiska návrhu — neprepisujem. Rozdiel:"
  diff -u "$ADR/faktero.povodny.conf" "$STRANKA" || true
  exit 1
fi

cp -p "$HLAVNY" "$HLAVNY.zaloha-$CAS"
cp -p "$STRANKA" "$STRANKA.zaloha-$CAS"
echo "Zálohy: $HLAVNY.zaloha-$CAS, $STRANKA.zaloha-$CAS"

vrat() {
  echo "nginx -t neprešiel — vraciam zálohy."
  cp -p "$HLAVNY.zaloha-$CAS" "$HLAVNY"
  cp -p "$STRANKA.zaloha-$CAS" "$STRANKA"
  nginx -t
  exit 1
}

# 1) server_tokens off globálne (zakomentovaný riadok z balíčka Ubuntu).
sed -i -e 's/^\s*# server_tokens off;/\tserver_tokens off;/' "$HLAVNY"

# 2) stránka (port 80 server_tokens + presmerovanie na www)
if [ "$STRANKA_MENIT" = 1 ]; then
  cat "$ADR/faktero.conf" >"$STRANKA"
fi

nginx -t || vrat
systemctl reload nginx
sleep 1

echo
echo "Kontrola:"
printf '  http verzia:            '; curl -sI http://www.faktero.sk/ | grep -i '^server:' || true
printf '  faktero.sk → www:       '; curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://faktero.sk/prihlasenie
printf '  API ostáva na faktero:  '; curl -s -o /dev/null -w '%{http_code} (čakáme 401)\n' https://faktero.sk/api/v1/companies
printf '  www:                    '; curl -s -o /dev/null -w '%{http_code}\n' https://www.faktero.sk/
printf '  /webhooky na www:       '; curl -s -o /dev/null -w '%{http_code}\n' https://www.faktero.sk/webhooky
