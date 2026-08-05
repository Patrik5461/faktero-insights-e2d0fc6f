import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/quotes/$id/convert")({
  server: {
    handlers: {
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
          const today = new Date().toISOString().slice(0, 10);
          const { nextInvoiceNumberDetailed } =
            await import("@/lib/faktero/invoice-numbering.server");
          const { invoice_number, sequence_number } = await nextInvoiceNumberDetailed(
            ctx.company_id,
            today,
          );
          const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
          const variable_symbol = invoice_number.replace(/\D/g, "");

          const { data: inv, error: insErr } = await ctx.supabase
            .from("invoices")
            .insert({
              company_id: ctx.company_id,
              customer_id: q.customer_id ?? null,
              invoice_number,
              sequence_number,
              variable_symbol,
              issue_date: today,
              due_date: due,
              currency: q.currency,
              payment_method: "bank_transfer",
              customer_name: q.customer_name,
              customer_ico: q.customer_ico,
              customer_dic: q.customer_dic,
              customer_ic_dph: q.customer_ic_dph,
              customer_street: q.customer_street,
              customer_city: q.customer_city,
              customer_zip: q.customer_zip,
              customer_country: q.customer_country ?? "SK",
              customer_email: q.customer_email,
              subtotal: q.subtotal,
              vat_total: q.vat_total,
              total: q.total,
              notes: q.notes ?? null,
              status: "issued",
            })
            .select()
            .single();
          if (insErr || !inv) return err("db_error", insErr?.message ?? "Insert zlyhal", 500);
          if (items?.length) {
            const rows = items.map((it: any) => ({
              invoice_id: inv.id,
              position: it.position,
              name: it.name,
              description: it.description,
              quantity: it.quantity,
              unit: it.unit,
              unit_price: it.unit_price,
              vat_rate: it.vat_rate,
              subtotal: it.subtotal,
              vat_amount: it.vat_amount,
              total: it.total,
            }));
            await ctx.supabase.from("invoice_items").insert(rows);
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
