import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TEMPLATE_TYPES = [
  "invoice_send",
  "reminder_1",
  "reminder_2",
  "reminder_3",
  "approval_request",
] as const;
const TypeSchema = z.enum(TEMPLATE_TYPES);

export const listEmailTemplatesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ companyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { DEFAULT_TEMPLATES, TEMPLATE_LABELS } = await import("./email-templates.server");
    const { data: rows } = await context.supabase
      .from("email_templates")
      .select("template_type, subject, body, updated_at")
      .eq("company_id", data.companyId);
    const map = new Map((rows ?? []).map((r) => [r.template_type as string, r]));
    return TEMPLATE_TYPES.map((t) => {
      const row = map.get(t);
      const def = DEFAULT_TEMPLATES[t];
      return {
        template_type: t,
        label: TEMPLATE_LABELS[t],
        subject: row?.subject || def.subject,
        body: row?.body || def.body,
        default_subject: def.subject,
        default_body: def.body,
        customized: !!row,
        updated_at: row?.updated_at ?? null,
      };
    });
  });

export const saveEmailTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        template_type: TypeSchema,
        subject: z.string().max(500),
        body: z.string().max(20000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("email_templates").upsert(
      {
        company_id: data.companyId,
        template_type: data.template_type,
        subject: data.subject,
        body: data.body,
      },
      { onConflict: "company_id,template_type" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetEmailTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        template_type: TypeSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("email_templates")
      .delete()
      .eq("company_id", data.companyId)
      .eq("template_type", data.template_type);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTestEmailTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        template_type: TypeSchema,
        subject: z.string().max(500),
        body: z.string().max(20000),
        recipient_email: z.string().email().max(255),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Verify caller is member of the company (RLS-safe read)
    const { data: co } = await context.supabase
      .from("companies")
      .select("id, name, iban, email_sender_name, email_reply_to")
      .eq("id", data.companyId)
      .maybeSingle();
    if (!co) throw new Error("Firma nenájdená alebo nemáte prístup.");

    const { applyTemplateVars } = await import("./email-templates.server");
    const sampleInvoice = {
      invoice_number: "2026001",
      total: 123.45,
      currency: "EUR",
      due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      variable_symbol: "2026001",
      customer_name: "Ukážka s.r.o.",
    };
    const subject =
      "[TEST] " + applyTemplateVars(data.subject, { invoice: sampleInvoice, company: co });
    const bodyText = applyTemplateVars(data.body, { invoice: sampleInvoice, company: co });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY nie je nakonfigurovaný.");
    const senderName = co.email_sender_name || co.name || "Faktero";
    const escape = (s: string) =>
      s.replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
      );
    const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;white-space:pre-wrap">${escape(bodyText)}</div>
      <p style="margin-top:24px;font-size:12px;color:#6b7280">Toto je testovací email z Faktero — v ostrej prevádzke sa nahradia reálnymi údajmi.</p>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: `${senderName} <onboarding@resend.dev>`,
        to: [data.recipient_email],
        subject,
        reply_to: co.email_reply_to || undefined,
        text: bodyText,
        html,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Resend error: ${t.slice(0, 500)}`);
    }
    return { ok: true };
  });
