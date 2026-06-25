import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Input = z.object({
  name: z.string().min(1).max(255),
  address: z.string().max(500).optional().nullable(),
  active: z.boolean().optional().default(true),
});

export const Route = createFileRoute("/api/v1/warehouses")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({ status: 204, body: {} })),
      GET: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const { data, error } = await ctx.supabase.from("warehouses").select("*").eq("company_id", ctx.company_id).order("created_at");
          if (error) return err("db_error", error.message, 500);
          return ok({ data });
        });
      },
      POST: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const parsed = Input.safeParse(ctx.requestBody);
          if (!parsed.success) return err("validation_error", "Neplatné dáta skladu.", 400, parsed.error.flatten());
          const { data, error } = await ctx.supabase.from("warehouses").insert({ ...parsed.data, company_id: ctx.company_id }).select().single();
          if (error) return err("db_error", error.message, 500);
          return ok(data, 201);
        });
      },
    },
  },
});