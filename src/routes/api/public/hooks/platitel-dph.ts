/**
 * Cron: overenie platiteľstva DPH firiem v registroch (FS SR, Registr plátců DPH).
 * Volaný cez pg_cron s hlavičkou `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`
 * každých 10 minút — vezme nové firmy a firmy so zmeneným IČO / IČ DPH a tie,
 * ktoré sa neoverovali 20 hodín. Beží najviac ~20 s (nginx spojenie po 30 s
 * preruší); čo nestihne, dorobí ďalší beh.
 *
 * Telo `{"nanecisto": true}` nič nezapíše a vráti návrh spätného doplnenia
 * pre všetky firmy (firma, čo je nastavené, čo hovorí register).
 */
import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/hooks/platitel-dph")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token =
          request.headers.get("x-faktero-cron-token") ?? request.headers.get("x-cron-token");
        const { isValidCronToken } = await import("@/lib/faktero/cron-auth.server");
        if (!isValidCronToken(token, process.env.FAKTERO_CRON_TOKEN))
          return json({ error: "unauthorized" }, 401);
        const telo = (await request.json().catch(() => ({}))) as { nanecisto?: boolean };
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const m = await import("@/lib/faktero/platitel-dph.server");
          if (telo?.nanecisto)
            return json({ ok: true, navrh: await m.navrhSpatnehoDoplnenia(supabaseAdmin as any) });
          return json({ ok: true, ...(await m.overCakajuceFirmy(supabaseAdmin as any)) });
        } catch (e: any) {
          return json({ error: e?.message ?? "internal" }, 500);
        }
      },
    },
  },
});
