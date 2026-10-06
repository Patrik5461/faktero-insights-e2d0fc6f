/**
 * Webhook ePoštáka — udalosti o dokladoch firmy (document.received,
 * document.delivered, …). Podpis `X-Webhook-Signature: sha256=<hex>` nad
 * `${X-Webhook-Timestamp}.${telo}` tajomstvom predplatného danej firmy.
 *
 * Udalosť je len signál: firma sa dorovná tým istým kódom ako v nočnej úlohe
 * (stiahnuť prijaté, doplniť stavy). Preto nezáleží na presnom tvare správy.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/efaktura/epostak")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const telo = await request.text();
        try {
          const { prijmiUdalostEpostaka } = await import(
            "@/lib/faktero/efaktura/webhooky-obsluha.server"
          );
          const r = await prijmiUdalostEpostaka({
            telo,
            podpis: request.headers.get("x-webhook-signature"),
            pecatka: request.headers.get("x-webhook-timestamp"),
          });
          if (!r.ok) {
            return new Response(JSON.stringify({ error: r.dovod ?? "invalid_signature" }), {
              status: 401,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (e: any) {
          console.error("[efaktura-webhook]", String(e?.message ?? e));
          return new Response(JSON.stringify({ error: "internal" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
