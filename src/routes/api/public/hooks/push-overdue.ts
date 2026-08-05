/**
 * Cron endpoint — každé ráno o 8:00 pošle push notifikácie pre faktúry po splatnosti.
 *
 * Volaný cez pg_cron s hlavičkou `x-cron-token: <FAKTERO_CRON_TOKEN>`.
 *
 * Príjemcovia sa načítajú dvoma dotazmi pre všetky dotknuté firmy naraz — pri
 * limite 500 faktúr by dotaz na každú faktúru znamenal až 1000 DB round-tripov
 * v jednom HTTP requeste. Samotné odoslanie beží v dávkach, aby sa naraz
 * neotvorilo niekoľko stoviek spojení na FCM.
 */
import { createFileRoute } from "@tanstack/react-router";

const SEND_BATCH_SIZE = 25;

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
        const { isPushConfigured, sendPushToTokens } = await import("@/lib/faktero/push.server");

        if (!isPushConfigured()) {
          return Response.json({ ok: false, skipped: true, reason: "FCM not configured" });
        }

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
        if (!invoices || invoices.length === 0) {
          return Response.json({ ok: true, checked: 0, sent: 0 });
        }

        const companyIds = [...new Set(invoices.map((i) => i.company_id).filter(Boolean))];

        const { data: members, error: membersError } = await supabaseAdmin
          .from("company_users")
          .select("company_id, user_id")
          .in("company_id", companyIds);
        if (membersError) {
          return Response.json({ ok: false, error: membersError.message }, { status: 500 });
        }

        const userIds = [...new Set((members ?? []).map((m) => m.user_id))];
        const { data: profiles, error: profilesError } = userIds.length
          ? await supabaseAdmin
              .from("profiles")
              .select("id, push_token")
              .in("id", userIds)
              .not("push_token", "is", null)
          : { data: [], error: null };
        if (profilesError) {
          return Response.json({ ok: false, error: profilesError.message }, { status: 500 });
        }

        const tokenByUser = new Map<string, string>();
        for (const p of profiles ?? []) {
          if (p.push_token) tokenByUser.set(p.id, p.push_token);
        }

        const tokensByCompany = new Map<string, Set<string>>();
        for (const m of members ?? []) {
          const pushToken = tokenByUser.get(m.user_id);
          if (!pushToken) continue;
          const set = tokensByCompany.get(m.company_id) ?? new Set<string>();
          set.add(pushToken);
          tokensByCompany.set(m.company_id, set);
        }

        const jobs = invoices.flatMap((inv) => {
          const tokens = tokensByCompany.get(inv.company_id);
          if (!tokens || tokens.size === 0) return [];
          return [
            {
              tokens: [...tokens],
              title: "Faktúra po splatnosti ⚠️",
              body: `Faktúra ${inv.invoice_number} (${inv.total} ${inv.currency ?? "EUR"}) je po splatnosti.`,
              data: { path: `/faktury/${inv.id}`, invoice_id: inv.id },
            },
          ];
        });

        let sent = 0;
        for (let i = 0; i < jobs.length; i += SEND_BATCH_SIZE) {
          const results = await Promise.all(
            jobs.slice(i, i + SEND_BATCH_SIZE).map((job) =>
              sendPushToTokens(job.tokens, {
                title: job.title,
                body: job.body,
                data: job.data,
              }),
            ),
          );
          for (const r of results) sent += r.sent ?? 0;
        }

        return Response.json({ ok: true, checked: invoices.length, sent });
      },
    },
  },
});
