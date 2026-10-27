import { createFileRoute } from "@tanstack/react-router";

/**
 * Firmy, ku ktorým API kľúč smie. Kľúč firmy vráti svoju firmu, kľúč účtu
 * všetky firmy, kde je jeho majiteľ vlastník alebo admin (prípadne len vybrané).
 * Do ostatných požiadaviek sa firma posiela hlavičkou `X-Company` (id alebo IČO).
 */
export const Route = createFileRoute("/api/v1/companies")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        (await import("@/lib/faktero/api-auth.server")).handleApi(request, async () => ({
          status: 204,
          body: {},
        })),
      GET: async ({ request }) => {
        const { handleApi, ok, firmyKluca } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const { data: k } = await ctx.supabase
            .from("api_keys")
            .select("id, company_id, ucet_user_id, firmy")
            .eq("id", ctx.api_key_id)
            .maybeSingle();
          const firmy = k ? await firmyKluca(k as any) : [];
          return ok({
            account_key: Boolean(k?.ucet_user_id),
            data: firmy.map((f) => ({
              id: f.id,
              name: f.name,
              ico: f.ico,
              ic_dph: f.ic_dph,
              country: f.country,
            })),
          });
        });
      },
    },
  },
});
