import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Patch = z.object({
  name: z.string().min(1).max(255).optional(),
  ico: z.string().max(32).nullable().optional(),
  dic: z.string().max(32).nullable().optional(),
  ic_dph: z.string().max(32).nullable().optional(),
  street: z.string().max(255).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  zip: z.string().max(20).nullable().optional(),
  country: z.string().max(2).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  contact_person: z.string().max(120).nullable().optional(),
  external_id: z.string().max(120).nullable().optional(),
}).strict();

export const Route = createFileRoute("/api/v1/customers/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const { data, error } = await ctx.supabase.from("customers").select("*").eq("id", params.id).eq("company_id", ctx.company_id).maybeSingle();
          if (error) return err("db_error", error.message, 500);
          if (!data) return err("not_found", "Odberateľ nenájdený.", 404);
          return ok(data);
        });
      },
      PUT: async ({ request, params }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const parsed = Patch.safeParse(ctx.requestBody);
          if (!parsed.success) return err("validation_error", "Neplatné dáta.", 400, parsed.error.flatten());
          const { data, error } = await ctx.supabase.from("customers").update(parsed.data).eq("id", params.id).eq("company_id", ctx.company_id).select().maybeSingle();
          if (error) return err("db_error", error.message, 500);
          if (!data) return err("not_found", "Odberateľ nenájdený.", 404);
          return ok(data);
        });
      },
    },
  },
});