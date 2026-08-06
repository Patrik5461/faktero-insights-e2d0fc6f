import { createFileRoute } from "@tanstack/react-router";
import { handleTatraWebhook } from "@/lib/faktero/tatrabanka-webhook.server";

/**
 * Notifikačný endpoint zaregistrovaný v portáli Tatra banky.
 * Konvencii repa zodpovedá `/api/public/tatrabanka/webhook`; táto cesta existuje
 * preto, že v portáli je zadaná práve ona. Obe vedú na ten istý handler.
 */
const PATH = "/api/bankove-ucty/tatrabanka/webhook";

export const Route = createFileRoute("/api/bankove-ucty/tatrabanka/webhook")({
  server: {
    handlers: {
      GET: ({ request }) => handleTatraWebhook(request, PATH),
      POST: ({ request }) => handleTatraWebhook(request, PATH),
      // Bez týchto by neregistrované metódy spadli na SSR stránku a vrátili 200.
      PUT: ({ request }) => handleTatraWebhook(request, PATH),
      PATCH: ({ request }) => handleTatraWebhook(request, PATH),
      DELETE: ({ request }) => handleTatraWebhook(request, PATH),
    },
  },
});
