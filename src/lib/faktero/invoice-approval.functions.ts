import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Authenticated: supplier requests approval from customer.
 * Generates a UUID token, marks status pending, sends email with link.
 */
export const requestInvoiceApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    invoiceId: z.string().uuid(),
    recipientEmail: z.string().email(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    void userId;

    const { data: inv, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, total, currency, status, company_id, customer_email")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error || !inv) throw new Error("Faktúra nenájdená.");
    if (inv.status !== "draft" && inv.status !== "issued") {
      throw new Error("Na schválenie možno poslať len faktúru v stave koncept alebo vystavené.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendApprovalRequestEmail } = await import("./invoice-approval.server");

    const token = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, "");
    const nowIso = new Date().toISOString();

    const { error: upErr } = await supabaseAdmin.from("invoices").update({
      approval_token: token,
      approval_status: "pending",
      approval_requested_at: nowIso,
      approval_responded_at: null,
      approval_note: null,
    }).eq("id", inv.id);
    if (upErr) throw new Error(upErr.message);

    const { data: company } = await supabaseAdmin.from("companies").select("*").eq("id", inv.company_id).maybeSingle();

    await sendApprovalRequestEmail({
      invoice: inv,
      company,
      recipientEmail: data.recipientEmail,
      token,
    });

    return { ok: true, token };
  });

/**
 * Public (no auth): fetch invoice by approval token for the public /schvalit page.
 */
export const getApprovalInvoice = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ token: z.string().min(10).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { getInvoiceForApproval } = await import("./invoice-approval.server");
    const result = await getInvoiceForApproval(data.token);
    if (!result) throw new Error("Neplatný alebo neexistujúci odkaz.");
    if ((result as any).expired) throw new Error("Platnosť odkazu vypršala (7 dní).");
    return result;
  });

/**
 * Public (no auth): customer approves or rejects the invoice.
 * On approve: draft -> issued. Sends result email to supplier.
 */
export const respondToApproval = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    token: z.string().min(10).max(200),
    decision: z.enum(["approved", "rejected"]),
    note: z.string().max(2000).optional(),
  }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendApprovalResultEmail } = await import("./invoice-approval.server");

    const { data: inv } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("approval_token", data.token)
      .maybeSingle();
    if (!inv) throw new Error("Neplatný odkaz.");

    if (inv.approval_requested_at) {
      const ageMs = Date.now() - new Date(inv.approval_requested_at).getTime();
      if (ageMs > 7 * 24 * 3600 * 1000) throw new Error("Platnosť odkazu vypršala.");
    }
    if (inv.approval_status && inv.approval_status !== "pending") {
      throw new Error("Faktúra už bola vybavená.");
    }

    const respondedAt = new Date().toISOString();
    const patch: any = {
      approval_status: data.decision,
      approval_responded_at: respondedAt,
      approval_note: data.decision === "rejected" ? (data.note ?? null) : null,
    };
    // On approval, auto-issue draft
    if (data.decision === "approved" && inv.status === "draft") {
      patch.status = "issued";
    }

    const { error: upErr } = await supabaseAdmin.from("invoices").update(patch).eq("id", inv.id);
    if (upErr) throw new Error(upErr.message);

    // Notify supplier
    const { data: company } = await supabaseAdmin
      .from("companies").select("*").eq("id", inv.company_id).maybeSingle();
    const supplierEmail = company?.email ?? null;
    if (supplierEmail) {
      try {
        await sendApprovalResultEmail({
          invoice: inv, company,
          approved: data.decision === "approved",
          note: data.note ?? null,
          supplierEmail,
        });
      } catch (e) {
        console.error("Approval result email failed", e);
      }
    }

    return { ok: true, decision: data.decision };
  });
