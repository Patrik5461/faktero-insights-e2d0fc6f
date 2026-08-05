import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const input = z.object({ invoiceId: z.string().uuid() });

export const generateInvoicePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    // RLS check: the caller must be able to see the invoice.
    const { data: invoice, error } = await context.supabase
      .from("invoices")
      .select("id")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error || !invoice) throw new Error("Faktúra nenájdená");

    const { ensureInvoicePdf, signInvoicePdf } = await import("./invoice-pdf.server");
    const { path, fileName } = await ensureInvoicePdf(data.invoiceId, { force: true });
    return { path, signedUrl: await signInvoicePdf(path, fileName), fileName };
  });

export const getInvoicePdfSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: invoice, error } = await context.supabase
      .from("invoices")
      .select("id")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error || !invoice) throw new Error("Faktúra nenájdená");

    const { ensureInvoicePdf, signInvoicePdf } = await import("./invoice-pdf.server");
    // Regenerates automatically when the cached PDF is stale or missing.
    const { path, fileName } = await ensureInvoicePdf(data.invoiceId);
    return { signedUrl: await signInvoicePdf(path, fileName), fileName };
  });
