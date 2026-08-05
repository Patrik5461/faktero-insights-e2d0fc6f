import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const lookupCompanyByIcoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { ico: string }) => {
    if (!input || typeof input.ico !== "string") throw new Error("invalid_input");
    return { ico: input.ico };
  })
  .handler(async ({ data, context }) => {
    const { lookupCompanyByIco } = await import("./company-lookup.server");
    return lookupCompanyByIco(data.ico, { supabase: context.supabase, userId: context.userId });
  });

export const companyLookupConfiguredFn = createServerFn({ method: "GET" }).handler(async () => {
  const { isCompanyLookupConfigured } = await import("./company-lookup.server");
  return { enabled: isCompanyLookupConfigured() };
});

export const searchCompaniesByNameFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { query: string }) => {
    if (!input || typeof input.query !== "string") throw new Error("invalid_input");
    const q = input.query.trim();
    if (q.length > 100) throw new Error("query_too_long");
    return { query: q };
  })
  .handler(async ({ data }) => {
    const { searchCompaniesByName } = await import("./company-registry.server");
    const res = await searchCompaniesByName(data.query);
    return res;
  });

export const findCustomerByIcoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { ico: string; companyId: string }) => {
    if (!input || typeof input.ico !== "string" || typeof input.companyId !== "string") {
      throw new Error("invalid_input");
    }
    return { ico: input.ico.replace(/\s+/g, "").trim(), companyId: input.companyId };
  })
  .handler(async ({ data, context }) => {
    if (!data.ico || !/^\d{6,8}$/.test(data.ico)) return { match: null };
    const padded = data.ico.padStart(8, "0");
    const { data: rows } = await context.supabase
      .from("customers")
      .select("id, name, ico, email")
      .eq("company_id", data.companyId)
      .or(`ico.eq.${data.ico},ico.eq.${padded}`)
      .limit(1);
    const m = rows?.[0];
    return { match: m ? { id: m.id, name: m.name, ico: m.ico, email: m.email } : null };
  });
