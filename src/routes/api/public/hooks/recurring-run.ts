import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/recurring-run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Ako ostatné cron hooky: porovnanie v konštantnom čase. Priame `===`
        // skončí pri prvom rozdielnom znaku a čas odpovede tak prezrádza,
        // koľko znakov predpony útočník uhádol.
        const { isValidCronToken } = await import("@/lib/faktero/cron-auth.server");
        const ok = isValidCronToken(
          request.headers.get("x-faktero-cron-token"),
          process.env.FAKTERO_CRON_TOKEN,
        );
        if (!ok) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        try {
          const { runAllDueRecurring } = await import("@/lib/faktero/recurring.server");
          const r = await runAllDueRecurring();
          const created = r.results.filter((x) => x.ok && x.invoice_id).map((x) => x.invoice_id);
          const errors = r.results.filter((x) => !x.ok).map((x) => ({ id: x.id, error: x.error }));
          return new Response(
            JSON.stringify({
              processed: r.processed,
              created: created.length,
              failed: errors.length,
              created_invoice_ids: created,
              errors,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e?.message ?? "internal" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
