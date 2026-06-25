import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Input = z.object({
  name: z.string().min(1).max(255),
  license_plate: z.string().max(20).optional().nullable(),
  vehicle_type: z.string().max(80).optional().nullable(),
  fuel_type: z.string().max(40).optional().nullable(),
  consumption_l_100km: z.number().min(0).max(100).optional().nullable(),
  initial_odometer: z.number().min(0).max(10000000).optional().default(0),
  active: z.boolean().optional().default(true),
});

export const Route = createFileRoute("/api/v1/vehicles")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({ status: 204, body: {} })),
      GET: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const { data, error } = await ctx.supabase.from("vehicles").select("*").eq("company_id", ctx.company_id).order("name");
          if (error) return err("db_error", error.message, 500);
          return ok({ data });
        });
      },
      POST: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const parsed = Input.safeParse(ctx.requestBody);
          if (!parsed.success) return err("validation_error", "Neplatné dáta vozidla.", 400, parsed.error.flatten());
          const { data, error } = await ctx.supabase.from("vehicles").insert({ ...parsed.data, company_id: ctx.company_id }).select().single();
          if (error) return err("db_error", error.message, 500);
          return ok(data, 201);
        });
      },
    },
  },
});