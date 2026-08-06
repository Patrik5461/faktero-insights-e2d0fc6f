import { createFileRoute } from "@tanstack/react-router";
import { handleTatraWebhook } from "@/lib/faktero/tatrabanka-webhook.server";

/**
 * Notifikačný endpoint Tatra banky na ceste podľa konvencie repa — verejné,
 * neprihlásené endpointy patria pod `/api/public/`. Rovnaký handler ako
 * `/api/bankove-ucty/tatrabanka/webhook`, ktorý je zadaný v portáli TB.
 */
const PATH = "/api/public/tatrabanka/webhook";

export const Route = createFileRoute("/api/public/tatrabanka/webhook")({
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
