/**
 * Cron každých 15 minút: dokončenie rozbehnutých registrácií z FS (napr. po
 * ručnej kontrole u ePoštáka) a odber udalostí pre novo zaregistrované firmy.
 * Ľahká časť nočnej úlohy — bez sťahovania dokladov, aby sa zmestila do 30 s.
 * Volaný cez pg_cron s hlavičkou `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`.
 */
import { createFileRoute } from "@tanstack/react-router";

const json = (status: number, telo: unknown) =>
  new Response(JSON.stringify(telo), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/hooks/efaktura-registracie")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token =
          request.headers.get("x-faktero-cron-token") ?? request.headers.get("x-cron-token");
        const { isValidCronToken } = await import("@/lib/faktero/cron-auth.server");
        if (!isValidCronToken(token, process.env.FAKTERO_CRON_TOKEN)) {
          return json(401, { error: "unauthorized" });
        }
        try {
          const { dokonciRozbehnuteRegistracie, zapniWebhookyFiriem } =
            await import("@/lib/faktero/efaktura/webhooky-obsluha.server");
          await dokonciRozbehnuteRegistracie();
          const w = await zapniWebhookyFiriem();
          return json(200, { ok: true, webhooky: w.zapnutych });
        } catch (e: any) {
          return json(500, { error: e?.message ?? "internal" });
        }
      },
    },
  },
});
