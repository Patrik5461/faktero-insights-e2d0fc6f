import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CustomerInput = z.object({
  name: z.string().min(1).max(255),
  ico: z.string().max(32).optional().nullable(),
  dic: z.string().max(32).optional().nullable(),
  ic_dph: z.string().max(32).optional().nullable(),
  street: z.string().max(255).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  zip: z.string().max(20).optional().nullable(),
  country: z.string().max(2).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  contact_person: z.string().max(120).optional().nullable(),
  external_id: z.string().max(120).optional().nullable(),
});

export const Route = createFileRoute("/api/v1/customers")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      GET: async ({ request }) => {
        const { handleApi, ok } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const url = new URL(request.url);
          const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
          const { data, error } = await ctx.supabase
            .from("customers")
            .select("*")
            .eq("company_id", ctx.company_id)
            .order("created_at", { ascending: false })
            .limit(limit);
          if (error)
            return { status: 500, body: { error: { code: "db_error", message: error.message } } };
          return ok({ data });
        });
      },
      POST: async ({ request }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        const { triggerEvent, customerPayload } =
          await import("@/lib/faktero/webhook-trigger.server");
        return handleApi(request, async (ctx) => {
          const parsed = CustomerInput.safeParse(ctx.requestBody);
          if (!parsed.success)
            return err(
              "validation_error",
              "Neplatné dáta odberateľa.",
              400,
              parsed.error.flatten(),
            );
          if (parsed.data.external_id) {
            const { data: existing } = await ctx.supabase
              .from("customers")
              .select("*")
              .eq("company_id", ctx.company_id)
              .eq("external_id", parsed.data.external_id)
              .maybeSingle();
            if (existing) return ok(existing, 200);
          }
          const { data, error } = await ctx.supabase
            .from("customers")
            .insert({ ...parsed.data, company_id: ctx.company_id })
            .select()
            .single();
          if (error) return err("db_error", error.message, 500);
          await triggerEvent({
            company_id: ctx.company_id,
            event: "customer.created",
            data: customerPayload(data),
          });
          return ok(data, 201);
        });
      },
    },
  },
});
