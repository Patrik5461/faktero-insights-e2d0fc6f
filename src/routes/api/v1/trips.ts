import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Input = z.object({
  vehicle_id: z.string().uuid(),
  trip_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  driver_name: z.string().max(120).optional().nullable(),
  start_location: z.string().max(255).optional().nullable(),
  end_location: z.string().max(255).optional().nullable(),
  purpose: z.string().max(500).optional().nullable(),
  start_odometer: z.number().min(0).max(10000000),
  end_odometer: z.number().min(0).max(10000000),
  fuel_price: z.number().min(0).max(100).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

export const Route = createFileRoute("/api/v1/trips")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({ status: 204, body: {} })),
      GET: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const url = new URL(request.url);
          const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 500);
          const { data, error } = await ctx.supabase.from("trips").select("*").eq("company_id", ctx.company_id).order("trip_date", { ascending: false }).limit(limit);
          if (error) return err("db_error", error.message, 500);
          return ok({ data });
        });
      },
      POST: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const parsed = Input.safeParse(ctx.requestBody);
          if (!parsed.success) return err("validation_error", "Neplatné dáta jazdy.", 400, parsed.error.flatten());
          const d = parsed.data;
          if (d.end_odometer < d.start_odometer) return err("validation_error", "end_odometer musí byť ≥ start_odometer.", 400);
          const distance = d.end_odometer - d.start_odometer;
          const { data: v } = await ctx.supabase.from("vehicles").select("consumption_l_100km").eq("id", d.vehicle_id).eq("company_id", ctx.company_id).maybeSingle();
          if (!v) return err("not_found", "Vozidlo nenájdené.", 404);
          const fuel_consumption = v.consumption_l_100km ? (distance * Number(v.consumption_l_100km)) / 100 : null;
          const { data, error } = await ctx.supabase.from("trips").insert({
            ...d, company_id: ctx.company_id, distance_km: distance, fuel_consumption,
          }).select().single();
          if (error) return err("db_error", error.message, 500);
          return ok(data, 201);
        });
      },
    },
  },
});