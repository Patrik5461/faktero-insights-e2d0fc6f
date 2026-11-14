/**
 * Odpoveď z Pohody (`responsePack`) — čo sa z dávky naozaj založilo.
 *
 * Toto je celý rozdiel oproti posielaniu XML mailom: doklad, ktorý Pohoda
 * odmietla, sa vráti späť do fronty, a doklad, ktorý prijala, si k sebe zapíše
 * číslo, ktoré mu pridelila.
 *
 *   POST /api/v1/pohoda/odpoved
 *   Content-Type: text/xml   (telo je súbor z `response_dir`)
 *   POST /api/v1/pohoda/odpoved?bez_odpovede=1 — POHODA nevrátila nič, vráť dávku do fronty
 *
 * Doklad je odovzdaný (a zamknutý) až tu, po potvrdení POHODOU — pri
 * stiahnutí dávky sa len zapíše, že je na ceste.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/pohoda/odpoved")({
  server: {
    handlers: {
      GET: async () => (await import("@/lib/faktero/api-auth.server")).metodaNepovolena("POST"),
      POST: async ({ request }) => {
        const { overApiKluc } = await import("@/lib/faktero/api-auth.server");
        const kluc = await overApiKluc(request);
        if (!kluc) {
          return new Response(JSON.stringify({ error: "Chýba alebo neplatí API kľúč." }), {
            status: 401,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        }
        if (kluc.mode === "test") {
          return new Response(
            JSON.stringify({
              error: "Testovací kľúč smie len čítať. Konektor potrebuje live kľúč.",
            }),
            { status: 403, headers: { "content-type": "application/json; charset=utf-8" } },
          );
        }

        try {
          /*
            Konektor hlási, že POHODA nevrátila žiadnu odpoveď (alebo dávka prišla
            odrezaná) — posledná čakajúca dávka sa vráti do fronty hneď (K3).
          */
          if (new URL(request.url).searchParams.get("bez_odpovede") === "1") {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { odmietniPoslednuDavku } = await import(
              "@/lib/faktero/pohoda-konektor-potvrdenie.server"
            );
            const r = await odmietniPoslednuDavku(
              supabaseAdmin,
              kluc.company_id,
              "POHODA nevrátila žiadnu odpoveď (zlé meno alebo heslo, iná databáza, POHODA sa nespustila alebo dávka prišla neúplná) — doklady sa vrátili do fronty a pôjdu znova v ďalšej dávke.",
            );
            const { zapisVolanieKonektora } = await import("@/lib/faktero/api-auth.server");
            await zapisVolanieKonektora(kluc, request, 200);
            return new Response(JSON.stringify({ ok: true, ...r }), {
              status: 200,
              headers: { "content-type": "application/json; charset=utf-8" },
            });
          }
          const { dekodujOdpoved, spracujOdpoved } =
            await import("@/lib/faktero/pohoda-konektor.server");
          // Pohoda zapisuje odpoveď vo Windows-1250; kódovanie sa berie z
          // hlavičky súboru, inak by sa diakritika v chybách rozsypala.
          const xml = dekodujOdpoved(await request.arrayBuffer());
          if (!/responsePack/i.test(xml)) {
            return new Response(
              JSON.stringify({ error: "Telo požiadavky nie je odpoveď z Pohody." }),
              { status: 400, headers: { "content-type": "application/json; charset=utf-8" } },
            );
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const r = await spracujOdpoved(supabaseAdmin, {
            companyId: kluc.company_id,
            xml,
          });
          const { zapisVolanieKonektora } = await import("@/lib/faktero/api-auth.server");
          await zapisVolanieKonektora(kluc, request, 200);
          return new Response(JSON.stringify({ ok: true, ...r }), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : "Interná chyba" }),
            { status: 500, headers: { "content-type": "application/json; charset=utf-8" } },
          );
        }
      },
    },
  },
});
