import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Input = z.object({
  vehicle_id: z.string().uuid(),
  fuel_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  liters: z.number().positive().max(10000),
  price_per_liter: z.number().min(0).max(100),
  total_amount: z.number().min(0).max(1000000).optional(),
  station_name: z.string().max(120).optional().nullable(),
  receipt_number: z.string().max(80).optional().nullable(),
});

export const Route = createFileRoute("/api/v1/fuel-records")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({ status: 204, body: {} })),
      GET: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const { data, error } = await ctx.supabase.from("fuel_records").select("*").eq("company_id", ctx.company_id).order("fuel_date", { ascending: false }).limit(200);
          if (error) return err("db_error", error.message, 500);
          return ok({ data });
        });
      },
      POST: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const parsed = Input.safeParse(ctx.requestBody);
          if (!parsed.success) return err("validation_error", "Neplatné dáta tankovania.", 400, parsed.error.flatten());
          const d = parsed.data;
          const total = d.total_amount ?? d.liters * d.price_per_liter;
          const { data, error } = await ctx.supabase.from("fuel_records").insert({
            ...d, total_amount: total, company_id: ctx.company_id,
          }).select().single();
          if (error) return err("db_error", error.message, 500);
          return ok(data, 201);
        });
      },
    },
  },
});