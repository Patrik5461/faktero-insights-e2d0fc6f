import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ReminderNumber = 1 | 2 | 3;

const DEFAULT_SUBJECTS: Record<ReminderNumber, string> = {
  1: "Upomienka: Faktúra {invoice_number} je po splatnosti",
  2: "2. upomienka: Faktúra {invoice_number} je po splatnosti",
  3: "3. upomienka: Faktúra {invoice_number} je po splatnosti",
};

const DEFAULT_MESSAGES: Record<ReminderNumber, string> = {
  1:
    "Dobrý deň,\n\ndovoľujeme si Vás upozorniť, že faktúra {invoice_number} v sume {total} bola splatná dňa {due_date} a k dnešnému dňu evidujeme, že ešte nebola uhradená.\n\nProsíme Vás o jej úhradu v čo najkratšom možnom čase. V prípade, že platba bola už uskutočnená, považujte túto upomienku za bezpredmetnú.\n\nĎakujeme,\n{company_name}",
  2:
    "Dobrý deň,\n\ntoto je druhá upomienka k faktúre {invoice_number} v sume {total}, ktorá bola splatná dňa {due_date} a doteraz nebola uhradená.\n\nProsíme o bezodkladnú úhradu, aby sme nemuseli pristúpiť k ďalším krokom.\n\nS pozdravom,\n{company_name}",
  3:
    "Dobrý deň,\n\njedná sa o tretiu a poslednú upomienku k faktúre {invoice_number} v sume {total}, splatnej dňa {due_date}.\n\nAk nebude čiastka uhradená v najbližších dňoch, budeme nútení postúpiť pohľadávku na ďalšie vymáhanie.\n\nS pozdravom,\n{company_name}",
};

export function defaultReminderSubject(n: ReminderNumber) {
  return DEFAULT_SUBJECTS[n];
}
export function defaultReminderMessage(n: ReminderNumber) {
  return DEFAULT_MESSAGES[n];
}

function applyVars(s: string, inv: any, company: any) {
  const total = `${Number(inv.total ?? 0).toFixed(2)} ${inv.currency ?? "EUR"}`;
  return s
    .replaceAll("{invoice_number}", inv.invoice_number ?? "")
    .replaceAll("{due_date}", inv.due_date ?? "")
    .replaceAll("{total}", total)
    .replaceAll("{company_name}", company?.name ?? "")
    .replaceAll("{iban}", company?.iban ?? "")
    .replaceAll("{variable_symbol}", inv.variable_symbol ?? inv.invoice_number ?? "");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]!));
}

export type BuildReminderInput = {
  invoice: any;
  company: any;
  reminderNumber: ReminderNumber;
  overrideSubject?: string;
  overrideMessage?: string;
};

export function buildReminderContent({ invoice, company, reminderNumber, overrideSubject, overrideMessage }: BuildReminderInput) {
  const subjectTpl =
    overrideSubject ??
    (company as any)?.[`reminder_subject_${reminderNumber}`] ??
    DEFAULT_SUBJECTS[reminderNumber];
  const messageTpl =
    overrideMessage ??
    (company as any)?.[`reminder_message_${reminderNumber}`] ??
    DEFAULT_MESSAGES[reminderNumber];

  const subject = applyVars(subjectTpl, invoice, company);
  const message = applyVars(messageTpl, invoice, company);

  const paymentDetails = [
    company?.iban ? `IBAN: ${company.iban}` : null,
    invoice?.variable_symbol ? `VS: ${invoice.variable_symbol}` : `VS: ${invoice.invoice_number ?? ""}`,
    `Suma: ${Number(invoice.total ?? 0).toFixed(2)} ${invoice.currency ?? "EUR"}`,
    invoice?.due_date ? `Pôvodná splatnosť: ${invoice.due_date}` : null,
  ].filter(Boolean).join("\n");

  const plain = `${message}\n\nPlatobné údaje:\n${paymentDetails}`;

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;white-space:pre-wrap">${escapeHtml(message)}</div>
    <div style="margin-top:24px;padding:16px 20px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#111">
      <div style="font-weight:600;margin-bottom:8px">Platobné údaje</div>
      <div style="white-space:pre-wrap">${escapeHtml(paymentDetails)}</div>
    </div>
  `;

  return { subject, plain, html };
}

export type SendReminderInput = {
  company_id: string;
  invoice_id: string;
  reminderNumber: ReminderNumber;
  recipient_email?: string;
  overrideSubject?: string;
  overrideMessage?: string;
  triggeredBy?: "auto" | "manual";
};

export async function sendReminder(input: SendReminderInput) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY nie je nakonfigurovaný.");

  const { data: invoice } = await supabaseAdmin
    .from("invoices").select("*").eq("id", input.invoice_id).eq("company_id", input.company_id).maybeSingle();
  if (!invoice) throw new Error("Faktúra nenájdená");

  const { data: company } = await supabaseAdmin
    .from("companies").select("*").eq("id", input.company_id).single();

  let recipient = input.recipient_email ?? null;
  if (!recipient && invoice.customer_id) {
    const { data: c } = await supabaseAdmin
      .from("customers").select("email").eq("id", invoice.customer_id).maybeSingle();
    recipient = c?.email ?? null;
  }
  if (!recipient) throw new Error("Chýba e-mail príjemcu.");

  const built = buildReminderContent({
    invoice, company,
    reminderNumber: input.reminderNumber,
    overrideSubject: input.overrideSubject,
    overrideMessage: input.overrideMessage,
  });

  const senderName = company?.email_sender_name || company?.name || "Faktero";
  const from = `${senderName} <onboarding@resend.dev>`;

  let providerId: string | null = null;
  let errorMessage: string | null = null;
  let status: "sent" | "failed" = "sent";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: built.subject,
        reply_to: company?.email_reply_to || undefined,
        text: built.plain,
        html: built.html,
      }),
    });
    const txt = await res.text();
    let json: any = {}; try { json = JSON.parse(txt); } catch {}
    if (!res.ok) {
      status = "failed";
      errorMessage = json?.message ?? txt.slice(0, 500);
    } else {
      providerId = json?.id ?? null;
    }
  } catch (e: any) {
    status = "failed";
    errorMessage = e?.message ?? "unknown";
  }

  await supabaseAdmin.from("invoice_reminders").insert({
    invoice_id: invoice.id,
    company_id: invoice.company_id,
    reminder_number: input.reminderNumber,
    email_to: recipient,
    subject: built.subject,
    message: built.plain,
    status,
    error_message: errorMessage,
    triggered_by: input.triggeredBy ?? "manual",
    provider_message_id: providerId,
  });

  if (status === "failed") throw new Error(`Odoslanie upomienky zlyhalo: ${errorMessage}`);
  return { ok: true, provider_message_id: providerId, recipient };
}

/** Cron: iterate all overdue invoices and send due reminders. */
export async function runOverdueReminders() {
  const today = new Date().toISOString().slice(0, 10);
  const { data: invoices, error } = await supabaseAdmin
    .from("invoices")
    .select("id, company_id, invoice_number, due_date, status, paid_at, deleted_at, reminders_enabled, customer_id")
    .in("status", ["issued", "sent"])
    .lt("due_date", today)
    .is("paid_at", null)
    .is("deleted_at", null)
    .eq("reminders_enabled", true)
    .limit(1000);
  if (error) throw new Error(error.message);

  const companyIds = Array.from(new Set((invoices ?? []).map((i) => i.company_id)));
  const { data: companies } = await supabaseAdmin
    .from("companies")
    .select("id, reminders_enabled, reminder_days_1, reminder_days_2, reminder_days_3")
    .in("id", companyIds);
  const companyMap = new Map((companies ?? []).map((c) => [c.id, c]));

  const results: Array<{ invoice_id: string; reminder_number: number; ok: boolean; error?: string; skipped?: string }> = [];

  for (const inv of invoices ?? []) {
    const co: any = companyMap.get(inv.company_id);
    if (!co || co.reminders_enabled === false) {
      results.push({ invoice_id: inv.id, reminder_number: 0, ok: false, skipped: "company_disabled" });
      continue;
    }
    const dueDate = new Date(inv.due_date + "T00:00:00Z");
    const daysOverdue = Math.floor((Date.now() - dueDate.getTime()) / 86400000);
    const thresholds: Array<[ReminderNumber, number]> = [
      [3, co.reminder_days_3 ?? 14],
      [2, co.reminder_days_2 ?? 7],
      [1, co.reminder_days_1 ?? 3],
    ];
    let targetNumber: ReminderNumber | null = null;
    for (const [n, d] of thresholds) {
      if (daysOverdue >= d) { targetNumber = n; break; }
    }
    if (!targetNumber) continue;

    const { count } = await supabaseAdmin
      .from("invoice_reminders")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", inv.id)
      .eq("reminder_number", targetNumber)
      .eq("status", "sent");
    if ((count ?? 0) > 0) continue;

    try {
      await sendReminder({
        company_id: inv.company_id,
        invoice_id: inv.id,
        reminderNumber: targetNumber,
        triggeredBy: "auto",
      });
      results.push({ invoice_id: inv.id, reminder_number: targetNumber, ok: true });
    } catch (e: any) {
      results.push({ invoice_id: inv.id, reminder_number: targetNumber, ok: false, error: e?.message ?? "unknown" });
    }
  }

  return { checked: invoices?.length ?? 0, results };
}
