/**
 * Dávka pre Pohodu — to, čo si konektor u účtovníčky stiahne a dá načítať.
 *
 * Odpoveďou je surové XML, nie JSON, aby ho naplánovaná úloha mohla uložiť
 * priamo do vstupného priečinka a spustiť `Pohoda.exe /XML`.
 *
 *   GET /api/v1/pohoda/davka           — dávka a zápis do histórie
 *   GET /api/v1/pohoda/davka?nahlad=1  — to isté, ale bez zápisu (na vyskúšanie)
 *   GET /api/v1/pohoda/davka?od=2026-01-01
 *
 * `204` znamená, že nie je čo posielať — konektor vtedy Pohodu ani nespúšťa.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/pohoda/davka")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { overApiKluc } = await import("@/lib/faktero/api-auth.server");
        const kluc = await overApiKluc(request);
        if (!kluc) {
          return new Response("Chýba alebo neplatí API kľúč.", {
            status: 401,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }

        const url = new URL(request.url);
        const nahlad = url.searchParams.get("nahlad") === "1";
        const od = url.searchParams.get("od");
        if (od && !/^\d{4}-\d{2}-\d{2}$/.test(od)) {
          return new Response("Parameter `od` musí byť dátum v tvare RRRR-MM-DD.", {
            status: 400,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { zostavDavku } = await import("@/lib/faktero/pohoda-konektor.server");
          const davka = await zostavDavku(supabaseAdmin, {
            companyId: kluc.company_id,
            od,
            oznacit: !nahlad,
          });

          if (davka.prazdna) return new Response(null, { status: 204 });

          return new Response(davka.xml, {
            status: 200,
            headers: {
              "content-type": "text/xml; charset=utf-8",
              "content-disposition": 'attachment; filename="davka.xml"',
              // Konektor si ich zapíše do svojho protokolu, nech je po ňom
              // vidieť, čo v dávke bolo, aj keď Pohoda nič nevráti.
              "x-faktero-faktur": String(davka.faktur),
              "x-faktero-dokladov": String(davka.dokladov),
              "x-faktero-pokladnicnych": String(davka.pokladnicnych),
              "x-faktero-zakaznikov": String(davka.zakaznikov),
              "x-faktero-zasob": String(davka.zasob),
              "x-faktero-zakaziek": String(davka.zakaziek),
              ...(davka.jobId ? { "x-faktero-davka": davka.jobId } : {}),
            },
          });
        } catch (e) {
          return new Response(e instanceof Error ? e.message : "Interná chyba", {
            status: 500,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
      },
    },
  },
});
