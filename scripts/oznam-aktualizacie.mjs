#!/usr/bin/env node
/*
  Oznam o plánovanej aktualizácii pre prihlásených používateľov webu
  (tabuľka platformove_oznamy, zobrazuje OznamAktualizacie v AppShell).

  Použitie:
    node scripts/oznam-aktualizacie.mjs --o 5            # začiatok o 5 min, trvanie 2 min
    node scripts/oznam-aktualizacie.mjs --o 5 --trvanie 3
    node scripts/oznam-aktualizacie.mjs --zrus           # deaktivuje všetky aktívne oznamy o aktualizácii

  Zapisuje servisným kľúčom z /home/patrik/faktero-secrets.env (alebo
  FAKTERO_SECRETS). Kľúč sa nikde nevypisuje. Keď tabuľka ešte neexistuje,
  skript to oznámi a skončí s kódom 0 — nasadenie nesmie padnúť kvôli oznamu.
*/
import { existsSync, readFileSync } from "node:fs";

const SUBOR = process.env.FAKTERO_SECRETS || "/home/patrik/faktero-secrets.env";

function citajEnv(cesta) {
  const von = {};
  if (!existsSync(cesta)) return von;
  for (const riadok of readFileSync(cesta, "utf8").split("\n")) {
    const m = riadok.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) von[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return von;
}

function argument(meno) {
  const i = process.argv.indexOf(meno);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const zrus = process.argv.includes("--zrus");
const oMin = argument("--o");
const trvanie = Number(argument("--trvanie") ?? 2);

if (!zrus && oMin === undefined) {
  console.error("Použitie: oznam-aktualizacie.mjs --o <minúty> [--trvanie <minúty>] | --zrus");
  process.exit(2);
}
const posun = Number(oMin);
if (!zrus && (!Number.isFinite(posun) || posun < 0 || posun > 24 * 60)) {
  console.error("--o musí byť počet minút 0–1440");
  process.exit(2);
}
if (!zrus && (!Number.isInteger(trvanie) || trvanie < 1 || trvanie > 240)) {
  console.error("--trvanie musí byť celé číslo 1–240");
  process.exit(2);
}

const env = citajEnv(SUBOR);
const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const kluc = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !kluc) {
  console.error(`V ${SUBOR} chýba SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY`);
  process.exit(1);
}

async function rest(metoda, cesta, telo) {
  const r = await fetch(`${url}/rest/v1/${cesta}`, {
    method: metoda,
    headers: {
      apikey: kluc,
      Authorization: `Bearer ${kluc}`,
      "content-type": "application/json",
      Prefer: "return=representation",
    },
    body: telo === undefined ? undefined : JSON.stringify(telo),
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* nie JSON */
  }
  return { status: r.status, data, text };
}

function chybaTabulky(r) {
  return r.status === 404 || /PGRST205|42P01/.test(r.text);
}

try {
  if (zrus) {
    const r = await rest(
      "PATCH",
      "platformove_oznamy?aktivny=eq.true&typ=eq.aktualizacia&len_pre_user_id=is.null",
      { aktivny: false },
    );
    if (chybaTabulky(r)) {
      console.log("oznam: tabuľka platformove_oznamy ešte neexistuje, nič na zrušenie");
      process.exit(0);
    }
    if (r.status >= 300) throw new Error(`PATCH ${r.status} ${r.text.slice(0, 200)}`);
    console.log(`oznam: deaktivovaných ${Array.isArray(r.data) ? r.data.length : 0}`);
  } else {
    // Starší ohlásený a ešte nezačatý oznam sa nahradí — dva pásy naraz nedávajú zmysel.
    const teraz = new Date().toISOString();
    const stare = await rest(
      "PATCH",
      `platformove_oznamy?aktivny=eq.true&typ=eq.aktualizacia&len_pre_user_id=is.null&zaciatok=gt.${encodeURIComponent(teraz)}`,
      { aktivny: false },
    );
    if (chybaTabulky(stare)) {
      console.log("oznam: tabuľka platformove_oznamy ešte neexistuje, oznam sa nevložil");
      process.exit(0);
    }
    const zaciatok = new Date(Date.now() + posun * 60_000).toISOString();
    const r = await rest("POST", "platformove_oznamy", {
      typ: "aktualizacia",
      zaciatok,
      trvanie_min: trvanie,
      aktivny: true,
    });
    if (r.status >= 300) throw new Error(`POST ${r.status} ${r.text.slice(0, 200)}`);
    const id = Array.isArray(r.data) ? r.data[0]?.id : r.data?.id;
    const cas = new Intl.DateTimeFormat("sk-SK", {
      timeZone: "Europe/Bratislava",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(zaciatok));
    console.log(`oznam: aktualizácia o ${cas} na ${trvanie} min (${id ?? "?"})`);
  }
} catch (e) {
  // Oznam je doplnok — chyba sa zapíše, ale nasadenie nezastaví.
  console.error(`oznam: zlyhalo (${String(e?.message ?? e).slice(0, 200)})`);
  process.exit(0);
}
