/**
 * Aktuálne vydanie webu. Karta otvorená pred nasadením sa podľa neho dozvie,
 * že beží staré vydanie (`sledujNoveVydanie`).
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/verzia")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify({
            vydanie: typeof __FAKTERO_VYDANIE__ === "string" ? __FAKTERO_VYDANIE__ : null,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          },
        ),
    },
  },
});
