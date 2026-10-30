import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook podpory vo WhatsAppe (WhatsApp Business Cloud API).
 * GET = overenie adresy pri nastavení v Meta (`hub.verify_token` =
 * `WHATSAPP_VERIFY_TOKEN`), POST = udalosti s podpisom `X-Hub-Signature-256`
 * (tajomstvo aplikácie `WHATSAPP_APP_SECRET`); bez platného podpisu 401.
 * Spracovanie je v `whatsapp-webhook.server.ts`.
 */
export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prijmiWebhookWhatsApp } = await import("@/lib/faktero/whatsapp-webhook.server");
        return prijmiWebhookWhatsApp(request);
      },
      GET: async ({ request }) => {
        const { overWebhookWhatsApp } = await import("@/lib/faktero/whatsapp-webhook.server");
        return overWebhookWhatsApp(request);
      },
    },
  },
});
