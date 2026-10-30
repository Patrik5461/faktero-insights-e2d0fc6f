/**
 * Hook: odpoveď zákazníkovi po nasadení automatickej opravy.
 *
 * Volá ho spúšťač scripts/auto-oprava/oprava.mjs na 127.0.0.1, keď overí, že
 * commit opravy beží na webe. Hlavička `x-faktero-cron-token:
 * <FAKTERO_CRON_TOKEN>`, telo `{"id": "<id riadku podpora_auto_opravy>"}`.
 * Text si server berie z DB a sám skontroluje, či smie odpovedať
 * (nasadená, automatika zapnutá, ešte neodoslaná).
 */
import { createFileRoute } from "@tanstack/react-router";

const json = (telo: unknown, status = 200) =>
  new Response(JSON.stringify(telo), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/hooks/auto-oprava-odpoved")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token =
          request.headers.get("x-faktero-cron-token") ?? request.headers.get("x-cron-token");
        const { isValidCronToken } = await import("@/lib/faktero/cron-auth.server");
        if (!isValidCronToken(token, process.env.FAKTERO_CRON_TOKEN))
          return json({ error: "unauthorized" }, 401);
        let id = "";
        try {
          id = String((await request.json())?.id ?? "");
        } catch {
          /* prázdne telo — nižšie 400 */
        }
        if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "id" }, 400);
        try {
          const { odosliOdpovedPoOprave } =
            await import("@/lib/faktero/auto-oprava-odpoved.server");
          const r = await odosliOdpovedPoOprave({ id });
          return json(r, r.ok ? 200 : 500);
        } catch (e) {
          return json({ ok: false, chyba: e instanceof Error ? e.message : "internal" }, 500);
        }
      },
    },
  },
});
