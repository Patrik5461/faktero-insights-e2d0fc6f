import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/quotes/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const { data, error } = await ctx.supabase
            .from("quotes")
            .select("*")
            .eq("company_id", ctx.company_id)
            .eq("id", (params as any).id)
            .maybeSingle();
          if (error) return err("db_error", error.message, 500);
          if (!data) return err("not_found", "Ponuka nenájdená.", 404);
          const { data: items } = await ctx.supabase
            .from("quote_items")
            .select("*")
            .eq("quote_id", data.id)
            .order("position");
          return ok({ ...data, items: items ?? [] });
        });
      },
    },
  },
});
