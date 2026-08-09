import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Input = z.object({
  warehouse_id: z.string().uuid(),
  stock_item_id: z.string().uuid(),
  type: z.enum(["prijem", "vydaj", "oprava", "inventura"]),
  quantity: z.number().refine((v) => v !== 0, "Množstvo nemôže byť 0"),
  unit_price: z.number().nonnegative().optional().default(0),
  note: z.string().max(500).optional().nullable(),
  job_id: z.string().uuid().optional().nullable(),
});

export const Route = createFileRoute("/api/v1/stock/movements")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      GET: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const url = new URL(request.url);
          const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 500);
          const { data, error } = await ctx.supabase
            .from("stock_movements")
            .select("*")
            .eq("company_id", ctx.company_id)
            .order("created_at", { ascending: false })
            .limit(limit);
          if (error) return err("db_error", error.message, 500);
          return ok({ data });
        });
      },
      POST: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const parsed = Input.safeParse(ctx.requestBody);
          if (!parsed.success)
            return err("validation_error", "Neplatné dáta pohybu.", 400, parsed.error.flatten());
          const d = parsed.data;
          // Cross-company guard
          const [{ data: wh }, { data: si }] = await Promise.all([
            ctx.supabase
              .from("warehouses")
              .select("company_id")
              .eq("id", d.warehouse_id)
              .maybeSingle(),
            ctx.supabase
              .from("stock_items")
              .select("company_id")
              .eq("id", d.stock_item_id)
              .maybeSingle(),
          ]);
          if (!wh || wh.company_id !== ctx.company_id)
            return err("invalid_warehouse", "Sklad neexistuje alebo nepatrí firme.", 403);
          if (!si || si.company_id !== ctx.company_id)
            return err(
              "invalid_stock_item",
              "Skladová položka neexistuje alebo nepatrí firme.",
              403,
            );
          const { data, error } = await ctx.supabase
            .from("stock_movements")
            .insert({
              company_id: ctx.company_id,
              warehouse_id: d.warehouse_id,
              stock_item_id: d.stock_item_id,
              type: d.type,
              quantity: d.quantity,
              unit_price: d.unit_price ?? 0,
              total_value: Math.abs(d.quantity) * (d.unit_price ?? 0),
              note: d.note ?? null,
              job_id: d.job_id ?? null,
            })
            .select()
            .single();
          if (error) {
            if (error.message.includes("FAKTERO_STOCK:negative_stock"))
              return err("negative_stock", "Pohyb by spôsobil záporný stav skladu.", 409);
            if (error.message.includes("FAKTERO_STOCK:zero_quantity"))
              return err("zero_quantity", "Množstvo nemôže byť 0.", 400);
            if (error.message.includes("FAKTERO_STOCK:cross_company"))
              return err("cross_company", "Sklad a položka musia patriť tej istej firme.", 403);
            if (error.message.includes("FAKTERO_STOCK:warehouse_inactive"))
              return err("warehouse_inactive", "Sklad je neaktívny.", 409);
            if (error.message.includes("FAKTERO_STOCK:movement_immutable"))
              return err(
                "movement_immutable",
                "Skladové pohyby nie je možné upravovať ani mazať.",
                409,
              );
            return err("db_error", error.message, 500);
          }
          return ok(data, 201);
        });
      },
    },
  },
});
