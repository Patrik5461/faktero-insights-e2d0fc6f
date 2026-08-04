/**
 * Cron endpoint — každé ráno o 8:00 pošle push notifikácie pre faktúry po splatnosti.
 *
 * Volaný cez pg_cron s hlavičkou `x-cron-token: <FAKTERO_CRON_TOKEN>`.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/push-overdue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-cron-token");
        const { isValidCronToken } = await import("@/lib/faktero/cron-auth.server");
        if (!isValidCronToken(token, process.env.FAKTERO_CRON_TOKEN)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendPush } = await import("@/lib/faktero/push.server");

        const today = new Date().toISOString().slice(0, 10);
        const { data: invoices, error } = await supabaseAdmin
          .from("invoices")
          .select("id, invoice_number, company_id, total, currency, due_date, status")
          .lt("due_date", today)
          .eq("status", "sent")
          .is("paid_at", null)
          .is("deleted_at", null)
          .limit(500);

        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        let sent = 0;
        for (const inv of invoices ?? []) {
          const r = await sendPush({
            company_id: inv.company_id,
            title: "Faktúra po splatnosti ⚠️",
            body: `Faktúra ${inv.invoice_number} (${inv.total} ${inv.currency ?? "EUR"}) je po splatnosti.`,
            data: { path: `/faktury/${inv.id}`, invoice_id: inv.id },
          });
          if (r.ok) sent += r.sent ?? 0;
        }
        return Response.json({ ok: true, checked: invoices?.length ?? 0, sent });
      },
    },
  },
});
