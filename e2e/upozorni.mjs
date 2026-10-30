#!/usr/bin/env node
/*
  Upozornenie Patrikovi, že E2E testy po nasadení zlyhali:
  e-mail cez Resend (ako strážca výpadkov) a správa do Telegramu
  do admin chatov spárovaných v Admin → Podpora (`telegram_admin_chaty`).

    node e2e/upozorni.mjs <cesta k suhrn.json>

  Kľúče sa berú z /home/patrik/ecosystem.config.cjs (E2E_ECOSYSTEM ho prebije).
  Bez kľúča sa daný kanál ticho preskočí; zlyhanie odoslania beh nezastaví.
*/
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const suhrn = JSON.parse(readFileSync(process.argv[2], "utf8"));
const ECOSYSTEM = process.env.E2E_ECOSYSTEM || "/home/patrik/ecosystem.config.cjs";
const PRIJEMCA = process.env.E2E_PRIJEMCA || "info@tobify.sk";

let env = {};
try {
  env = createRequire(import.meta.url)(ECOSYSTEM).apps[0].env ?? {};
} catch (e) {
  console.error("ecosystem sa nedá načítať:", e?.message ?? e);
}

/** Z textu chyby nič citlivé — tokeny a heslo QA účtu. */
function bezTajomstiev(text) {
  let t = String(text ?? "");
  for (const h of [
    process.env.QA_HESLO,
    env.RESEND_API_KEY,
    env.TELEGRAM_BOT_TOKEN,
    env.SUPABASE_SERVICE_ROLE_KEY,
  ])
    if (h && h.length > 5) t = t.split(h).join("[skryté]");
  return t.replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[skryté]");
}

const zlyhane = (suhrn.toky ?? []).filter((x) => !x.ok);
const riadky = [
  `E2E testy po nasadení ${suhrn.commit} zlyhali (${zlyhane.length} z ${(suhrn.toky ?? []).length} tokov, ${suhrn.trvanie_s ?? "?"} s).`,
  ...(suhrn.chyba ? [`Beh sa nespustil: ${suhrn.chyba}`] : []),
  "",
  ...zlyhane.map(
    (x) =>
      `• ${x.tok} — ${x.popis ?? ""}\n  ${x.chyba ?? "?"}${x.prvyPokus ? "\n  (zlyhal aj na druhý pokus)" : ""}`,
  ),
  "",
  `Výsledky na serveri: ${suhrn.vystup}`,
  "Súhrn: suhrn.json, snímky obrazovky *-chyba*.png, stiahnuté súbory v subory/.",
  "Nasadenie sa nevracia — vydanie beží ďalej.",
].map(bezTajomstiev);
const predmet = `Faktero E2E: zlyhalo ${zlyhane.map((x) => x.tok).join(", ") || "spustenie"} (${suhrn.commit})`;

async function mail() {
  if (!env.RESEND_API_KEY) return console.log("e-mail preskočený: chýba RESEND_API_KEY");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: `Faktero E2E <${env.RESEND_FROM_NOREPLY || "noreply@faktero.sk"}>`,
      to: [PRIJEMCA],
      subject: predmet,
      text: riadky.join("\n"),
    }),
    signal: AbortSignal.timeout(20000),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
  console.log(
    r.ok ? "e-mail odoslaný" : `e-mail NEODOŠIEL: ${r.status} ${(await r.text()).slice(0, 200)}`,
  );
}

async function telegram() {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    return console.log("telegram preskočený: chýba token bota alebo prístup k databáze");
  const db = async (cesta) => {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${cesta}`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      signal: AbortSignal.timeout(15000),
    });
    return r.ok ? r.json() : [];
  };
  const chaty = await db("telegram_admin_chaty?select=chat_id,user_id");
  if (!chaty.length) return console.log("telegram: žiadny spárovaný admin chat");
  const admini = new Set(
    (
      await db(
        `platform_admins?select=user_id&user_id=in.(${chaty.map((c) => c.user_id).join(",")})`,
      )
    ).map((a) => a.user_id),
  );
  let poslane = 0;
  for (const c of chaty) {
    if (!admini.has(c.user_id)) continue;
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: c.chat_id,
        text: `${predmet}\n\n${riadky.join("\n")}`.slice(0, 4000),
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (j?.ok) poslane++;
    else console.log("telegram zlyhal:", String(j?.description ?? r?.status ?? "").slice(0, 200));
  }
  console.log(`telegram: odoslané ${poslane}`);
}

await mail().catch((e) => console.log("e-mail zlyhal:", e?.message ?? e));
await telegram().catch((e) => console.log("telegram zlyhal:", e?.message ?? e));
