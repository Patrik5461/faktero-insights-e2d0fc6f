/**
 * Cron: denná synchronizácia bankových účtov a transakcií zo všetkých
 * pripojených bánk — Tatra banka, Wise, Revolut aj Wallester.
 * Volaný cez pg_cron s hlavičkou `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`.
 *
 * `POST` prácu **spustí a hneď odpovie** — celý beh trvá dlhšie, než nginx
 * necháva spojenie otvorené. Výsledok sa dá prečítať cez `GET` na tej istej
 * adrese, s tým istým tokenom.
 *
 * Voliteľné telo: {"days_back": 30} — dokedy dozadu ťahať transakcie (default 14).
 */
import { createFileRoute } from "@tanstack/react-router";

async function overToken(request: Request): Promise<boolean> {
  const token = request.headers.get("x-faktero-cron-token") ?? request.headers.get("x-cron-token");
  const { isValidCronToken } = await import("@/lib/faktero/cron-auth.server");
  return isValidCronToken(token, process.env.FAKTERO_CRON_TOKEN);
}

function odpoved(telo: unknown, status = 200) {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/hooks/bank-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await overToken(request))) return odpoved({ error: "unauthorized" }, 401);

        const { MAX_DAYS_BACK } = await import("@/lib/faktero/bank-sync.server");
        let daysBack = 14;
        try {
          const body = await request.json();
          const n = Number(body?.days_back);
          // Strop je najdlhšie okno, aké banka dá — dlhší dopyt aj tak
          // orežeme na dátum, ktorý ponúkne sama.
          if (Number.isFinite(n) && n > 0 && n <= MAX_DAYS_BACK) daysBack = n;
        } catch {
          // prázdne telo je v poriadku — ostáva default
        }

        const { spustiDennyBeh, stavBehu } = await import("@/lib/faktero/bank-sync-beh.server");
        const spustene = spustiDennyBeh(daysBack);
        // 202: prijaté a beží. Cron sa na výsledok nepýta, ale človek áno.
        return odpoved(
          spustene
            ? { ok: true, spustene: true, days_back: daysBack }
            : { ok: true, spustene: false, dovod: "beh už prebieha", stav: stavBehu() },
          202,
        );
      },

      /** Ako dopadol posledný beh. */
      GET: async ({ request }) => {
        if (!(await overToken(request))) return odpoved({ error: "unauthorized" }, 401);
        const { stavBehu } = await import("@/lib/faktero/bank-sync-beh.server");
        return odpoved({ ok: true, ...stavBehu() });
      },
    },
  },
});
