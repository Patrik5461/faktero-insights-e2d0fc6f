import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MarkPaidInput = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1).max(500),
});

export const bulkMarkPaidFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MarkPaidInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error: selErr } = await supabase
      .from("invoices")
      .select("id, status, company_id")
      .in("id", data.invoiceIds);
    if (selErr) throw new Error(selErr.message);

    const eligible = (rows ?? []).filter((r) => r.status !== "paid" && r.status !== "cancelled");
    if (eligible.length === 0) return { updated: 0, skipped: (rows ?? []).length };

    const paidAt = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("invoices")
      .update({ status: "paid", paid_at: paidAt })
      .in(
        "id",
        eligible.map((r) => r.id),
      );
    if (upErr) throw new Error(upErr.message);

    return {
      updated: eligible.length,
      skipped: (rows ?? []).length - eligible.length,
    };
  });
