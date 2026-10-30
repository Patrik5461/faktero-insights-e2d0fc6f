/*
  Kontrola napojenia WhatsAppu podpory (WhatsApp Business Cloud API) — spustiť
  po vložení tajomstiev a nasadení:

    node scripts/whatsapp-nastav.mjs                  # len kontrola, nič nemení
    node scripts/whatsapp-nastav.mjs --odoberat       # prihlási aplikáciu na udalosti WABA
    node scripts/whatsapp-nastav.mjs --vytvor-sablonu # podá šablónu odpoved_podpory na schválenie

  Hodnoty berie z /home/patrik/ecosystem.config.cjs (tam ich vloží
  ~/vloz-tajomstvo.sh): WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, voliteľne WHATSAPP_CISLO,
  WHATSAPP_WABA_ID (id účtu WhatsApp Business — na kontrolu odberu a šablóny),
  WHATSAPP_SABLONA, WHATSAPP_GRAPH_VERSION. Tajomstvá nikdy nevypíše.

  1. Číslo — overí token a WHATSAPP_PHONE_NUMBER_ID (zobrazované číslo, meno,
     kvalita, stav), porovná s WHATSAPP_CISLO.
  2. Webhook u nás — GET overenie s WHATSAPP_VERIFY_TOKEN musí vrátiť
     challenge, POST bez podpisu musí vrátiť 401.
  3. Odber udalostí — či je aplikácia prihlásená na WABA (subscribed_apps).
  4. Šablóna — stav šablóny na odpoveď mimo 24 h okna.

  Žiadnu správu neposiela.
*/
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";

const ECOSYSTEM = "/home/patrik/ecosystem.config.cjs";
const require = createRequire(import.meta.url);
const env = { ...require(ECOSYSTEM).apps[0].env, ...process.env };
const arg = new Set(process.argv.slice(2));

const hodnota = (k) => String(env[k] ?? "").trim();
const token = hodnota("WHATSAPP_TOKEN");
const cisloId = hodnota("WHATSAPP_PHONE_NUMBER_ID");
const appSecret = hodnota("WHATSAPP_APP_SECRET");
const verifyToken = hodnota("WHATSAPP_VERIFY_TOKEN");
const waba = hodnota("WHATSAPP_WABA_ID");
const cislo = (hodnota("WHATSAPP_CISLO") || "+421902101967").replace(/[^0-9]/g, "");
const sablona = hodnota("WHATSAPP_SABLONA") || "odpoved_podpory";
const verzia = /^v\d{2,3}\.\d$/.test(hodnota("WHATSAPP_GRAPH_VERSION"))
  ? hodnota("WHATSAPP_GRAPH_VERSION")
  : "v25.0";
const web = String(env.APP_PUBLIC_URL || "https://www.faktero.sk").replace(/\/+$/, "");
const webhook = `${web}/api/public/whatsapp/webhook`;

const chyby = [];
for (const [k, v] of [
  ["WHATSAPP_TOKEN", token],
  ["WHATSAPP_PHONE_NUMBER_ID", cisloId],
  ["WHATSAPP_APP_SECRET", appSecret],
  ["WHATSAPP_VERIFY_TOKEN", verifyToken],
])
  if (!v) chyby.push(k);
if (chyby.length) {
  console.error(`Chýba ${chyby.join(", ")} — vložte: ~/vloz-tajomstvo.sh <NAZOV>`);
  if (!verifyToken)
    console.error("WHATSAPP_VERIFY_TOKEN si vymyslite, napr.: openssl rand -hex 24");
  process.exit(1);
}

async function graph(cesta, telo) {
  const r = await fetch(`https://graph.facebook.com/${verzia}/${cesta}`, {
    method: telo ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${token}`,
      ...(telo ? { "content-type": "application/json" } : {}),
    },
    ...(telo ? { body: JSON.stringify(telo) } : {}),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.error)
    throw new Error(
      `${cesta.split("?")[0]}: ${r.status} kód ${j?.error?.code ?? "?"} ${j?.error?.message ?? ""}`,
    );
  return j;
}

let ok = true;
const zle = (t) => {
  ok = false;
  console.error(`✗ ${t}`);
};

// 1. Číslo
try {
  const c = await graph(
    `${cisloId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,name_status,status,platform_type`,
  );
  console.log(
    `✓ Číslo: ${c.display_phone_number} (${c.verified_name}), kvalita ${c.quality_rating ?? "?"}, ` +
      `stav ${c.status ?? "?"}, meno ${c.name_status ?? "?"}, overenie ${c.code_verification_status ?? "?"}, platforma ${c.platform_type ?? "?"}`,
  );
  if (String(c.display_phone_number).replace(/[^0-9]/g, "") !== cislo)
    zle(`zobrazované číslo nesedí s WHATSAPP_CISLO (+${cislo})`);
  if (c.platform_type && c.platform_type !== "CLOUD_API")
    zle("číslo nie je v Cloud API (platform_type) — dokončite registráciu čísla");
} catch (e) {
  zle(`token alebo WHATSAPP_PHONE_NUMBER_ID neplatí: ${e.message}`);
}

// 2. Webhook u nás
try {
  const ch = String(Math.floor(Math.random() * 1e9));
  const r = await fetch(
    `${webhook}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=${ch}`,
  );
  const t = await r.text();
  if (r.ok && t === ch) console.log(`✓ Webhook ${webhook} odpovedá na overenie`);
  else
    zle(
      `webhook neodpovedá na overenie (HTTP ${r.status}) — je nasadený a sedí WHATSAPP_VERIFY_TOKEN?`,
    );
  const p = await fetch(webhook, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": `sha256=${randomBytes(32).toString("hex")}`,
    },
    body: "{}",
  });
  if (p.status === 401) console.log("✓ Webhook odmieta udalosti bez platného podpisu");
  else zle(`webhook prijal udalosť so zlým podpisom (HTTP ${p.status})`);
} catch (e) {
  zle(`webhook nedostupný: ${e.message}`);
}

// 3. Odber udalostí a 4. šablóna
if (!waba) {
  console.warn(
    "! WHATSAPP_WABA_ID nie je nastavené — odber udalostí a šablónu nekontrolujem.\n" +
      "  Id nájdete v WhatsApp Manager → Nastavenia účtu (WhatsApp Business Account ID).",
  );
} else {
  try {
    if (arg.has("--odoberat")) {
      await graph(`${waba}/subscribed_apps`, {});
      console.log("✓ Aplikácia prihlásená na udalosti WABA");
    }
    const s = await graph(`${waba}/subscribed_apps`);
    const appky = (s.data ?? []).map((a) => a.whatsapp_business_api_data?.name ?? a.name ?? "?");
    if (appky.length) console.log(`✓ Udalosti WABA odoberá: ${appky.join(", ")}`);
    else zle("na udalosti WABA nie je prihlásená žiadna aplikácia — spustite s --odoberat");
  } catch (e) {
    zle(`odber udalostí: ${e.message}`);
  }

  try {
    if (arg.has("--vytvor-sablonu")) {
      const r = await graph(`${waba}/message_templates`, {
        name: sablona,
        language: "sk",
        category: "UTILITY",
        components: [
          {
            type: "BODY",
            text: "Dobrý deň, podpora Faktera odpovedala na vašu požiadavku {{1}}. Odpoveď vám pošleme sem, keď ťuknete na tlačidlo nižšie alebo nám odpíšete. Nájdete ju aj vo Fakteri.",
            example: { body_text: [["P-1042"]] },
          },
          {
            type: "BUTTONS",
            buttons: [
              { type: "QUICK_REPLY", text: "Zobraziť odpoveď" },
              { type: "URL", text: "Otvoriť Faktero", url: `${web}/podpora` },
            ],
          },
        ],
      });
      console.log(`✓ Šablóna ${sablona} podaná na schválenie (stav ${r.status ?? "?"})`);
    }
    const t = await graph(
      `${waba}/message_templates?name=${encodeURIComponent(sablona)}&fields=name,status,language,category`,
    );
    const sab = (t.data ?? []).filter((x) => x.name === sablona);
    if (!sab.length)
      zle(
        `šablóna ${sablona} neexistuje — spustite s --vytvor-sablonu alebo ju založte v WhatsApp Manager`,
      );
    for (const x of sab) {
      const text = `Šablóna ${x.name} (${x.language}, ${x.category}): ${x.status}`;
      if (x.status === "APPROVED") {
        console.log(`✓ ${text}`);
        if (!hodnota("WHATSAPP_SABLONA"))
          console.warn(
            `! Šablóna je schválená, ale WHATSAPP_SABLONA nie je nastavené — vložte: ~/vloz-tajomstvo.sh WHATSAPP_SABLONA (hodnota ${x.name})`,
          );
      } else console.warn(`! ${text} — kým nie je APPROVED, mimo 24 h okna odíde len e-mail`);
    }
  } catch (e) {
    zle(`šablóna: ${e.message}`);
  }
}

console.log(
  ok
    ? `Hotovo. Webhook v Meta: ${webhook}, pole „messages“. Stav vidno v Admin → Podpora → WhatsApp.`
    : "Niečo nesedí — pozrite riadky so ✗.",
);
process.exit(ok ? 0 : 1);
