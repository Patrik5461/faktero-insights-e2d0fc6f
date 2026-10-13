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
  // FS chce presne „Kód“ s dĺžňom — `Kod` nespozná a odpoveď berie ako chybnú.
  new Response(JSON.stringify({ Kód: kod, Popis: popis }), {
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
        // Podpis sa počíta z presných prijatých bajtov — telo sa pred overením neprepisuje.
        const surove = Buffer.from(await request.arrayBuffer());
        const telo = surove.toString("utf8");
        const { overPdsPodpis, rozparsujPds, diagnostikaPdsPodpisu } = await import(
          "@/lib/faktero/efaktura/webhooky.server"
        );
        const { zapisOdmietnutie } = await import("@/lib/faktero/efaktura/upozornenia.server");
        const tajomstvo = process.env.EFAKTURA_PDS_SECRET;
        const ip =
          request.headers.get("x-real-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          null;
        if (!overPdsPodpis(surove, request.headers.get("x-pds-secret"), tajomstvo)) {
          // Ohlási sa len telo, ktoré vyzerá ako žiadosť FS — nie hocijaký pokus zvonku.
          const r = rozparsujPds(telo);
          if ("ziadosti" in r) {
            /*
              Kým FS podpisuje iným secretom, než aký nám dala, môže žiadosť
              počkať na ručné schválenie namiesto odmietnutia
              (EFAKTURA_PDS_NEOVERENE=schvalit). FS dostane OK.
            */
            if (tajomstvo && process.env.EFAKTURA_PDS_NEOVERENE === "schvalit") {
              try {
                const { prijmiZiadostiFs } = await import(
                  "@/lib/faktero/efaktura/webhooky-obsluha.server"
                );
                const ok = await prijmiZiadostiFs(telo, ip, {
                  via: request.headers.get("via"),
                  diagnostika: diagnostikaPdsPodpisu(telo, request.headers.get("x-pds-secret"), tajomstvo, {}),
                });
                if (ok.ok) return odpoved(200, "OK");
              } catch (e: any) {
                console.error("[efaktura-pds] neoverená žiadosť:", String(e?.message ?? e));
                return odpoved(500, "Server error");
              }
            }
            await zapisOdmietnutie(tajomstvo ? "zly_podpis" : "bez_tajomstva", {
              firmy: r.ziadosti,
              ip,
              // Ktorá odchýlka od špecifikácie by sedela — bez tajomstva aj bez tela.
              chyba: diagnostikaPdsPodpisu(telo, request.headers.get("x-pds-secret"), tajomstvo, {
                "content-type": request.headers.get("content-type"),
                "content-encoding": request.headers.get("content-encoding"),
                "user-agent": request.headers.get("user-agent"),
              }),
            });
          }
          return odpoved(401, "Unauthorized");
        }
        try {
          const { prijmiZiadostiFs } = await import("@/lib/faktero/efaktura/webhooky-obsluha.server");
          const r = await prijmiZiadostiFs(telo, ip);
          if (!r.ok) {
            await zapisOdmietnutie("zly_obsah", { chyba: r.chyba, ip });
            return odpoved(400, r.chyba);
          }
          return odpoved(200, "OK");
        } catch (e: any) {
          console.error("[efaktura-pds]", String(e?.message ?? e));
          await zapisOdmietnutie("chyba_servera", { chyba: String(e?.message ?? e).slice(0, 300), ip });
          return odpoved(500, "Server error");
        }
      },
    },
  },
});
