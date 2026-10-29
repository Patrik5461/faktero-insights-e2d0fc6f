import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook bota podpory v Telegrame. Telegram sa preukazuje hlavičkou
 * `X-Telegram-Bot-Api-Secret-Token` (= `TELEGRAM_WEBHOOK_SECRET`, nastavená
 * cez `scripts/telegram-nastav.mjs`); bez zhody 401. Spracovanie je
 * v `telegram-webhook.server.ts`.
 */
export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prijmiWebhookTelegramu } = await import("@/lib/faktero/telegram-webhook.server");
        return prijmiWebhookTelegramu(request);
      },
      GET: () => new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }),
    },
  },
});
