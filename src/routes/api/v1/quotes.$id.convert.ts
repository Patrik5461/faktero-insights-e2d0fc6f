import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/quotes/$id/convert")({
  server: {
    handlers: {
      GET: async () => (await import("@/lib/faktero/api-auth.server")).metodaNepovolena("POST"),
      POST: async ({ request, params }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const id = (params as any).id;
          const { data: q } = await ctx.supabase
            .from("quotes")
            .select("*")
            .eq("company_id", ctx.company_id)
            .eq("id", id)
            .maybeSingle();
          if (!q) return err("not_found", "Ponuka nenájdená.", 404);
          if (q.status === "converted" && q.converted_invoice_id) {
            const { data: inv } = await ctx.supabase
              .from("invoices")
              .select("*")
              .eq("id", q.converted_invoice_id)
              .maybeSingle();
            return ok(inv ?? { invoice_id: q.converted_invoice_id, already: true }, 200);
          }
          const { data: items } = await ctx.supabase
            .from("quote_items")
            .select("*")
            .eq("quote_id", q.id)
            .order("position");
          const { dnesBratislava } = await import("@/lib/faktero/datum-vystavenia");
          const today = dnesBratislava();
          const { nextInvoiceNumberDetailed } =
            await import("@/lib/faktero/invoice-numbering.server");
          const cislo = await nextInvoiceNumberDetailed(ctx.company_id, today);
          const { data: firma } = await ctx.supabase
            .from("companies")
            .select("country")
            .eq("id", ctx.company_id)
            .maybeSingle();
          const { predvolenyJazykFirmy } = await import("@/lib/faktero/faktura-jazyk");
          const { hlavickaZPonuky, polozkyZPonuky } =
            await import("@/lib/faktero/ponuka-na-fakturu");
          const hlavicka = hlavickaZPonuky(
            { ...q, company_id: ctx.company_id },
            cislo,
            today,
            predvolenyJazykFirmy(firma?.country),
          );
          const { doplnovacKurzov } = await import("@/lib/faktero/kurz-dokladu.server");
          Object.assign(hlavicka, await doplnovacKurzov(ctx.company_id)("invoices", hlavicka));

          const { data: inv, error: insErr } = await ctx.supabase
            .from("invoices")
            .insert(hlavicka as any)
            .select()
            .single();
          if (insErr || !inv) return err("db_error", insErr?.message ?? "Insert zlyhal", 500);
          if (items?.length) {
            const rows = polozkyZPonuky(inv.id, items);
            await ctx.supabase.from("invoice_items").insert(rows as any);
          }
          await ctx.supabase
            .from("quotes")
            .update({
              status: "converted",
              converted_invoice_id: inv.id,
              converted_at: new Date().toISOString(),
            })
            .eq("id", q.id);
          try {
            const { triggerEvent, invoicePayload } =
              await import("@/lib/faktero/webhook-trigger.server");
            await triggerEvent({
              company_id: ctx.company_id,
              event: "invoice.created",
              data: invoicePayload(inv),
            });
          } catch (e) {
            console.warn("[webhook] invoice.created trigger zlyhal", e);
          }
          return ok(inv, 201);
        });
      },
    },
  },
});
