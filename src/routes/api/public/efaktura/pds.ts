/**
 * Webhook Finančnej správy: „Poskytnutie údajov subjektu pre poskytovateľa
 * doručovacej služby“ (PDS/PFS). Firma si na Portáli FS vybrala Faktero.
 *
 * Overenie: `X-PDS-Secret` = hex(SHA-512(telo + tajomstvo)), tajomstvo je v
 * `EFAKTURA_PDS_SECRET`. Kým nie je nastavené, každá požiadavka dostane 401 —
 * nič neoverené sa nezapíše. Odpoveď je synchrónna: 200 / 400 / 401 / 500.
 *
 * FS posiela z 194.1.4.58, ale za naším routerom skutočnú IP nevidíme
 * spoľahlivo — zapisuje sa len na kontrolu, nevynucuje sa.
 */
import { createFileRoute } from "@tanstack/react-router";

const odpoved = (kod: number, popis: string) =>
  new Response(JSON.stringify({ Kod: kod, Popis: popis }), {
    status: kod,
    headers: { "content-type": "application/json" },
  });

export const Route = createFileRoute("/api/public/efaktura/pds")({
  server: {
    handlers: {
      /*
        Otvorenie v prehliadači (GET) — adresa žije, len údaje prijíma cez POST.
        Bez toho ukazovala 404 a pôsobila ako nefunkčná pri vypĺňaní tlačiva.
      */
      GET: async () => odpoved(200, "Faktero — webhook PDS je dostupný, údaje prijíma metódou POST."),
      POST: async ({ request }) => {
        const telo = await request.text();
        const { overPdsPodpis } = await import("@/lib/faktero/efaktura/webhooky.server");
        if (!overPdsPodpis(telo, request.headers.get("x-pds-secret"), process.env.EFAKTURA_PDS_SECRET)) {
          return odpoved(401, "Unauthorized");
        }
        const ip =
          request.headers.get("x-real-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          null;
        try {
          const { prijmiZiadostiFs } = await import("@/lib/faktero/efaktura/webhooky-obsluha.server");
          const r = await prijmiZiadostiFs(telo, ip);
          if (!r.ok) return odpoved(400, r.chyba);
          return odpoved(200, "OK");
        } catch (e: any) {
          console.error("[efaktura-pds]", String(e?.message ?? e));
          return odpoved(500, "Server error");
        }
      },
    },
  },
});
