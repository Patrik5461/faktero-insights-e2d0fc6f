/*
  Nastavenie bota podpory v Telegrame — spustiť raz po vložení tokenu
  (a znova po zmene TELEGRAM_WEBHOOK_SECRET alebo adresy webu):

    node scripts/telegram-nastav.mjs

  Hodnoty berie z /home/patrik/ecosystem.config.cjs (tam ich vloží
  ~/vloz-tajomstvo.sh): TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET a
  voliteľne TELEGRAM_BOT_USERNAME. Token ani tajomstvo nikdy nevypíše.

  1. getMe — overí token a povie meno bota.
  2. setWebhook — https://www.faktero.sk/api/public/telegram/webhook so
     secret_token (Telegram ho posiela v hlavičke X-Telegram-Bot-Api-Secret-Token)
     a len udalosťami message + callback_query.
  3. setMyCommands — ponuka príkazov v chate.
  4. getWebhookInfo — stav (posledná chyba doručenia, čakajúce správy).
*/
import { createRequire } from "node:module";

const ECOSYSTEM = "/home/patrik/ecosystem.config.cjs";
const require = createRequire(import.meta.url);
const env = { ...require(ECOSYSTEM).apps[0].env, ...process.env };

const token = String(env.TELEGRAM_BOT_TOKEN ?? "").trim();
const tajomstvo = String(env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
const web = String(env.APP_PUBLIC_URL || "https://www.faktero.sk").replace(/\/+$/, "");
const url = `${web}/api/public/telegram/webhook`;

if (!token) {
  console.error("Chýba TELEGRAM_BOT_TOKEN — vložte ho: ~/vloz-tajomstvo.sh TELEGRAM_BOT_TOKEN");
  process.exit(1);
}
// Telegram povolí v secret_token len A–Z, a–z, 0–9, _ a -, 1–256 znakov.
if (!/^[A-Za-z0-9_-]{16,256}$/.test(tajomstvo)) {
  console.error(
    "TELEGRAM_WEBHOOK_SECRET chýba alebo nie je platný (16–256 znakov A–Z a–z 0–9 _ -).\n" +
      "Vyrobte ho napr.: openssl rand -hex 32  a vložte: ~/vloz-tajomstvo.sh TELEGRAM_WEBHOOK_SECRET",
  );
  process.exit(1);
}

async function volaj(metoda, telo = {}) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${metoda}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(telo),
  });
  const j = await r.json().catch(() => null);
  if (!j?.ok) throw new Error(`${metoda}: ${r.status} ${j?.description ?? ""}`);
  return j.result;
}

const ja = await volaj("getMe");
console.log(`Bot: @${ja.username} (${ja.first_name}), id ${ja.id}`);
const menoVEnv = String(env.TELEGRAM_BOT_USERNAME ?? "")
  .replace(/^@/, "")
  .trim();
if (!menoVEnv) {
  console.warn(
    `TELEGRAM_BOT_USERNAME nie je nastavený — odkaz „Napíšte nám na Telegram“ sa neukáže.\n` +
      `Vložte: ~/vloz-tajomstvo.sh TELEGRAM_BOT_USERNAME  (hodnota ${ja.username})`,
  );
} else if (menoVEnv.toLowerCase() !== String(ja.username).toLowerCase()) {
  console.warn(
    `Pozor: TELEGRAM_BOT_USERNAME je ${menoVEnv}, ale token patrí botovi @${ja.username}.`,
  );
}

await volaj("setWebhook", {
  url,
  secret_token: tajomstvo,
  allowed_updates: ["message", "callback_query"],
  max_connections: 10,
});
console.log(`Webhook: ${url}`);

await volaj("setMyCommands", {
  commands: [
    { command: "start", description: "Ako napísať podpore" },
    { command: "chyba", description: "Nahlásiť chybu v aplikácii" },
    { command: "nova", description: "Začať novú požiadavku" },
    { command: "pomoc", description: "Nápoveda" },
  ],
});

const info = await volaj("getWebhookInfo");
console.log(
  `Stav: čaká ${info.pending_update_count ?? 0} správ` +
    (info.last_error_message
      ? `, posledná chyba ${new Date(info.last_error_date * 1000).toISOString()}: ${info.last_error_message}`
      : ", bez chýb"),
);
console.log(
  "Hotovo. Ďalší krok: Admin → Podpora → Telegram → „Prepojiť Telegram“ a poslať botovi /admin <kód>.",
);
