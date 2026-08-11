/**
 * Cron endpoint — vykoná zrušenia účtov, ktorým uplynul 14-dňový odklad.
 *
 * Volaný cez pg_cron s hlavičkou `x-cron-token: <FAKTERO_CRON_TOKEN>`.
 * Beží raz denne; nikto sa nezruší skôr, než príde jeho termín.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/ucet-zrusenie")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-cron-token");
        const { isValidCronToken } = await import("@/lib/faktero/cron-auth.server");
        if (!isValidCronToken(token, process.env.FAKTERO_CRON_TOKEN)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { ucetyNaZrusenie, zrusUcet } = await import("@/lib/faktero/ucet-zrusenie.server");
        const ucty = await ucetyNaZrusenie();

        const vysledky: unknown[] = [];
        for (const userId of ucty) {
          try {
            // Po jednom: mazanie firmy siaha na úložisko aj na desiatky tabuliek
            // a súbežne by to zbytočne zaťažilo databázu.
            vysledky.push(await zrusUcet(userId));
          } catch (e: any) {
            // Jeden účet nesmie zastaviť ostatné — ostáva na ďalší beh.
            console.error(`[zrušenie účtu] ${userId} zlyhalo: ${e?.message ?? e}`);
            vysledky.push({ userId, chyba: String(e?.message ?? e).slice(0, 200) });
          }
        }

        return Response.json({ ok: true, spracovanych: ucty.length, vysledky });
      },
    },
  },
});
