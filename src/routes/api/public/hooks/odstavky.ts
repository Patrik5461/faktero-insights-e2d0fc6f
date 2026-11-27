/**
 * Cron endpoint — každú hodinu (v minúte 17) stiahne plánované odstávky
 * Finančnej správy, slovensko.sk a Sociálnej poisťovne do `odstavky_institucii`
 * (FAK-523, odstavky.server.ts).
 *
 * Volaný cez pg_cron s hlavičkou `x-cron-token: <FAKTERO_CRON_TOKEN>`.
 * Chyba jedného zdroja sa vráti v súhrne, ostatné sa spracujú.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/odstavky")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-cron-token");
        const { isValidCronToken } = await import("@/lib/faktero/cron-auth.server");
        if (!isValidCronToken(token, process.env.FAKTERO_CRON_TOKEN)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { stiahniOdstavky } = await import("@/lib/faktero/odstavky.server");

        // Tabuľka ešte nie je v generovaných typoch databázy.
        const suhrn = await stiahniOdstavky(supabaseAdmin as any);
        const ok = Object.values(suhrn).some((z) => !z.chyba);
        return Response.json({ ok, ...suhrn }, { status: ok ? 200 : 502 });
      },
    },
  },
});
