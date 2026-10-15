/**
 * Cron: denný e-mailový súhrn úloh (na schválenie, komentáre, nespracované
 * doklady, faktúry po splatnosti) o 7:00 v Bratislave.
 * Volaný cez pg_cron s hlavičkou `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`.
 *
 * Cron beží o 5:00 aj 6:00 UTC — jeden z nich je 7:00 v lete, druhý v zime.
 * Hook pustí ďalej len ten, ktorý v Bratislave trafí 7:00, takže sa čas
 * nemusí dvakrát do roka prestavovať. Dvojité odoslanie aj tak stráži
 * `denny_suhrn_odoslane` (človek × deň).
 *
 * Voliteľné telo:
 *   {"hocikedy": true}   — spustiť hneď bez ohľadu na hodinu (ručné dobehnutie),
 *   {"nanecisto": true}  — nič neposlať ani nezapísať, len vypísať do logu komu by šlo,
 *   {"den": "2026-10-15"} — kľúč dňa proti dvojitému odoslaniu (predvolene dnešok).
 *
 * Odpovedá hneď (202) a robotu dokončí na pozadí — pg_net čaká najviac pár
 * sekúnd a nginx po 30 s spojenie preruší. Výsledok ide do logu servera.
 */
import { createFileRoute } from "@tanstack/react-router";

/** Aby sa dva behy neprekrývali, keby hook niekto spustil druhýkrát. */
let bezi = false;

const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/hooks/denny-suhrn")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token =
          request.headers.get("x-faktero-cron-token") ?? request.headers.get("x-cron-token");
        const { isValidCronToken } = await import("@/lib/faktero/cron-auth.server");
        if (!isValidCronToken(token, process.env.FAKTERO_CRON_TOKEN)) {
          return json({ error: "unauthorized" }, 401);
        }
        let telo: { hocikedy?: unknown; nanecisto?: unknown; den?: unknown } = {};
        try {
          telo = (await request.json()) ?? {};
        } catch {
          // prázdne telo je v poriadku
        }
        const den =
          typeof telo.den === "string" && /^\d{4}-\d{2}-\d{2}$/.test(telo.den)
            ? telo.den
            : undefined;
        const nanecisto = telo.nanecisto === true;

        const { jeCasNaSuhrn, HODINA_SUHRNU } = await import("@/lib/faktero/denny-suhrn");
        if (telo.hocikedy !== true && !jeCasNaSuhrn()) {
          return json({ ok: true, preskocene: `v Bratislave nie je ${HODINA_SUHRNU}:00` });
        }
        if (bezi) return json({ ok: true, uz_bezi: true }, 202);

        bezi = true;
        void (async () => {
          try {
            const { spustiDennySuhrn } = await import("@/lib/faktero/denny-suhrn.server");
            const r = await spustiDennySuhrn({ den, nanecisto });
            console.log("[denny-suhrn] hotovo:", JSON.stringify(r));
          } catch (e: any) {
            console.error("[denny-suhrn] beh zlyhal:", e?.message ?? e);
          } finally {
            bezi = false;
          }
        })();
        return json({ ok: true, spustene: true, den: den ?? null, nanecisto }, 202);
      },
    },
  },
});
