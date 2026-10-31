#!/usr/bin/env bash
# E2E testy celých tokov po nasadení. Volá ho /home/patrik/webhook/poll-deploy.sh
# po riadku „deploy OK“ — na pozadí, takže nasadenie nepredlžuje a jeho zámok nedrží.
#
#   e2e/po-nasadeni.sh <commit>
#
# - celá sada trvá ~13 min (48 tokov, 31. 10. 2026); beh má strop 20 minút (E2E_STROP_S 1200;
#   spusti.mjs nové toky nespúšťa po E2E_LIMIT_S 1080 a bežiaci tok utne do 60 s po ňom, aby stihol
#   upratať), súbežne beží najviac jeden (zámok v spusti.mjs);
# - keď zámok drží iný beh (napr. po predošlom nasadení), počká naň najviac E2E_CAKAJ_S (900 s)
#   — predtým sa beh preskočil a posledné nasadenie ostalo neotestované;
# - neúspešný tok sa skúsi ešte raz (--opakuj), až potom je to chyba;
# - výsledky: /home/patrik/e2e-vysledky/<čas>-<commit>/ (suhrn.json, beh.log, snímky),
#   staršie ako 14 dní sa mažú;
# - jeden riadok do poll-deploy.log, pri zlyhaní e-mail a Telegram (e2e/upozorni.mjs);
# - vydanie sa NEVRACIA — to robí len smoke test v poll-deploy.sh.
#
# Heslo QA účtu: /home/patrik/.faktero-e2e.env (QA_HESLO=…, chmod 600) alebo QA_HESLO v prostredí.

set -u

# Celé telo je vo funkcii: bash ju načíta naraz, takže ďalšie nasadenie, ktoré
# počas behu prepíše tento súbor (git reset v repe), beh nerozhodí.
hlavne() {
COMMIT=${1:-$(git -C "$(dirname "$0")/.." rev-parse --short HEAD 2>/dev/null || echo nezname)}
E2E=$(cd "$(dirname "$0")" && pwd)
VYSLEDKY=${E2E_VYSLEDKY:-/home/patrik/e2e-vysledky}
LOG=${E2E_DEPLOY_LOG:-/home/patrik/webhook/poll-deploy.log}
STROP=${E2E_STROP_S:-1200}
CAKAJ=${E2E_CAKAJ_S:-900}
export E2E_LIMIT_S=${E2E_LIMIT_S:-1080}

export HOME=${HOME:-/home/patrik}
export PATH=/usr/local/bin:/usr/bin:/bin:${PATH:-}

log() { printf '%s  %s\n' "$(date -Is)" "$*" >>"$LOG"; }

mkdir -p "$VYSLEDKY"
find "$VYSLEDKY" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} + 2>/dev/null

OUT="$VYSLEDKY/$(date +%Y%m%d-%H%M%S)-$COMMIT"
mkdir -p "$OUT"

# Po nasadení sa web ešte chvíľu zahrieva — nech prvý tok nepadne na studenom štarte.
sleep "${E2E_PAUZA_S:-20}"

# Strop platí pre samotný beh; čakanie na zámok sa k nemu pripočíta.
E2E_VYSTUP="$OUT" E2E_COMMIT="$COMMIT" E2E_OPAKUJ=1 E2E_CAKAJ_S="$CAKAJ" \
  timeout -k 30 "$((STROP + CAKAJ))" node "$E2E/spusti.mjs" >"$OUT/beh.log" 2>&1
KOD=$?

suhrn() { node -e '
  const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const n = (s.toky ?? []).length;
  const nest = s.nestabilne?.length ? `, na druhý pokus: ${s.nestabilne.join(", ")}` : "";
  console.log(s.ok ? `OK ${n}/${n} za ${s.trvanie_s} s${nest}` : `ZLYHALO ${s.zlyhane.join(", ")} (${s.prešlo}/${n}, ${s.trvanie_s} s)`);
' "$OUT/suhrn.json" 2>/dev/null; }

case "$KOD" in
  0)
    log "e2e $COMMIT: $(suhrn) — $OUT"
    ;;
  2)
    # Chýba heslo alebo nastavenie — bez upozornenia by sa testy potichu prestali spúšťať.
    log "e2e $COMMIT: PRESKOČENÉ — $(tail -1 "$OUT/beh.log")"
    node "$E2E/upozorni.mjs" "$OUT/suhrn.json" >>"$OUT/beh.log" 2>&1
    ;;
  75)
    log "e2e $COMMIT: PRESKOČENÉ — iný beh E2E držal zámok dlhšie než ${CAKAJ} s"
    rm -rf "$OUT"
    ;;
  *)
    if [ ! -f "$OUT/suhrn.json" ]; then
      # Strop vypršal alebo beh spadol skôr, než zapísal súhrn.
      node -e '
        const [out, commit, kod] = process.argv.slice(1);
        require("fs").writeFileSync(out + "/suhrn.json", JSON.stringify({
          ok: false, commit, vystup: out, toky: [], zlyhane: [],
          chyba: kod === "124" ? "beh prekročil časový strop a bol ukončený" : `beh skončil s kódom ${kod}`,
        }, null, 2));
      ' "$OUT" "$COMMIT" "$KOD"
      log "e2e $COMMIT: ZLYHALO — beh skončil s kódom $KOD (124 = časový strop) — $OUT"
    else
      log "e2e $COMMIT: $(suhrn) — $OUT"
    fi
    node "$E2E/upozorni.mjs" "$OUT/suhrn.json" >>"$OUT/beh.log" 2>&1
    ;;
esac
}
hlavne "$@"
exit 0
