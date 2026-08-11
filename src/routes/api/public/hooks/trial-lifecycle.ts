/**
 * Cron endpoint — denne:
 *  1. Pošle upozornenie 3 dni pred koncom skúšobnej verzie.
 *  2. Automaticky preklopí uplynuté trialy na plán Starter (zdarma).
 *
 * Chránené hlavičkou `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/trial-lifecycle")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token =
          request.headers.get("x-faktero-cron-token") ?? request.headers.get("x-cron-token");
        const { isValidCronToken } = await import("@/lib/faktero/cron-auth.server");
        if (!isValidCronToken(token, process.env.FAKTERO_CRON_TOKEN)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1) Send 3-day reminder emails
          const in3 = new Date(Date.now() + 3 * 86_400_000).toISOString();
          const in4 = new Date(Date.now() + 4 * 86_400_000).toISOString();
          const { data: expiring } = await supabaseAdmin
            .from("subscriptions")
            .select("company_id, trial_ends_at, trial_reminder_sent_at, companies(name, email)")
            .eq("status", "trialing")
            .is("trial_reminder_sent_at", null)
            .gte("trial_ends_at", in3)
            .lt("trial_ends_at", in4);

          const apiKey = process.env.RESEND_API_KEY;
          const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@faktero.sk";
          const appUrl = (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(
            /\/+$/,
            "",
          );
          let sent = 0;
          let failed = 0;

          const { runInBatches } = await import("@/lib/faktero/batch.server");
          const escapeHtml = (s: string) =>
            String(s).replace(
              /[&<>"']/g,
              (ch) =>
                ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
            );

          // Pôvodne sekvenčne: e-mail + DB update na každý riadok, jeden po druhom.
          // Po 5 naraz — Resend má rate limit, takže neobmedzený Promise.all nie.
          await runInBatches(expiring ?? [], 5, async (row) => {
            const to = (row as any).companies?.email as string | undefined;
            const companyName = escapeHtml((row as any).companies?.name ?? "Váš účet vo Faktere");
            if (!to || !apiKey) {
              await supabaseAdmin
                .from("subscriptions")
                .update({ trial_reminder_sent_at: new Date().toISOString() })
                .eq("company_id", row.company_id);
              return;
            }
            const html = `
              <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
                <h1 style="font-size:20px;margin:0 0 12px">Váš trial vo Faktere končí o 3 dni</h1>
                <p>Dobrý deň,</p>
                <p>skúšobná verzia pre <strong>${companyName}</strong> končí o 3 dni. Po jej uplynutí vaše konto automaticky prejde na <strong>bezplatný plán Starter</strong> — aplikácia zostane plne funkčná, no niektoré Premium funkcie (API, webhooky, importy z iných systémov) sa vypnú.</p>
                <p>Ak chcete pokračovať bez obmedzení, aktivujte si plán Premium.</p>
                <p><a href="${appUrl}/predplatne" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Vybrať plán</a></p>
                <p style="color:#64748b;font-size:12px;margin-top:24px">Faktero · <a href="${appUrl}">${appUrl.replace(/^https?:\/\//, "")}</a></p>
              </div>`;
            try {
              const resp = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "content-type": "application/json",
                },
                body: JSON.stringify({
                  from: fromEmail,
                  to: [to],
                  subject: "Váš trial vo Faktere končí o 3 dni",
                  html,
                }),
              });
              if (!resp.ok) throw new Error(`resend ${resp.status}`);
              sent += 1;
              await supabaseAdmin
                .from("subscriptions")
                .update({ trial_reminder_sent_at: new Date().toISOString() })
                .eq("company_id", row.company_id);
            } catch (e: any) {
              // Bez tohto logu sa o neodoslanom upozornení na koniec trialu
              // nedozvie nikto — v odpovedi hooku je len počet.
              console.error("[trial-lifecycle] upozornenie neodoslané", {
                company_id: row.company_id,
                error: e?.message ?? String(e),
              });
              failed += 1;
            }
          });

          // 2) Downgrade expired trials to Starter
          const { data: downgraded, error: downErr } = await supabaseAdmin.rpc(
            "faktero_process_trial_expiry",
          );
          if (downErr) throw downErr;

          return new Response(
            JSON.stringify({
              ok: true,
              reminders_sent: sent,
              reminders_failed: failed,
              downgraded: downgraded ?? 0,
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
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
