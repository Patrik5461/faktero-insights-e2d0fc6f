import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type TemplateType =
  "invoice_send" | "reminder_1" | "reminder_2" | "reminder_3" | "approval_request";

export const TEMPLATE_LABELS: Record<TemplateType, string> = {
  invoice_send: "Odoslanie faktúry",
  reminder_1: "Upomienka 1",
  reminder_2: "Upomienka 2",
  reminder_3: "Upomienka 3",
  approval_request: "Schválenie faktúry zákazníkom",
};

export const AVAILABLE_VARIABLES = [
  "{{invoice_number}}",
  "{{total}}",
  "{{due_date}}",
  "{{company_name}}",
  "{{customer_name}}",
  "{{iban}}",
  "{{variable_symbol}}",
];

export const DEFAULT_TEMPLATES: Record<TemplateType, { subject: string; body: string }> = {
  invoice_send: {
    subject: "Faktúra {{invoice_number}}",
    body: "Dobrý deň,\n\nv prílohe Vám posielame faktúru {{invoice_number}} na sumu {{total}} so splatnosťou {{due_date}}.\n\nPlatobné údaje:\nIBAN: {{iban}}\nVariabilný symbol: {{variable_symbol}}\n\nS pozdravom,\n{{company_name}}",
  },
  reminder_1: {
    subject: "Upomienka: Faktúra {{invoice_number}} je po splatnosti",
    body: "Dobrý deň,\n\ndovoľujeme si Vás upozorniť, že faktúra {{invoice_number}} v sume {{total}} bola splatná dňa {{due_date}} a k dnešnému dňu evidujeme, že ešte nebola uhradená.\n\nProsíme Vás o jej úhradu v čo najkratšom možnom čase. V prípade, že platba bola už uskutočnená, považujte túto upomienku za bezpredmetnú.\n\nĎakujeme,\n{{company_name}}",
  },
  reminder_2: {
    subject: "2. upomienka: Faktúra {{invoice_number}} je po splatnosti",
    body: "Dobrý deň,\n\ntoto je druhá upomienka k faktúre {{invoice_number}} v sume {{total}}, ktorá bola splatná dňa {{due_date}} a doteraz nebola uhradená.\n\nProsíme o bezodkladnú úhradu, aby sme nemuseli pristúpiť k ďalším krokom.\n\nS pozdravom,\n{{company_name}}",
  },
  reminder_3: {
    subject: "3. upomienka: Faktúra {{invoice_number}} je po splatnosti",
    body: "Dobrý deň,\n\njedná sa o tretiu a poslednú upomienku k faktúre {{invoice_number}} v sume {{total}}, splatnej dňa {{due_date}}.\n\nAk nebude čiastka uhradená v najbližších dňoch, budeme nútení postúpiť pohľadávku na ďalšie vymáhanie.\n\nS pozdravom,\n{{company_name}}",
  },
  approval_request: {
    subject: "Žiadosť o schválenie faktúry {{invoice_number}}",
    body: "Dobrý deň,\n\ndodávateľ {{company_name}} Vás žiada o schválenie faktúry {{invoice_number}} v sume {{total}}.\n\nFaktúru si môžete pozrieť a schváliť alebo zamietnuť cez odkaz v tomto emaile.\n\nS pozdravom,\n{{company_name}}",
  },
};

export function applyTemplateVars(s: string, ctx: { invoice?: any; company?: any }): string {
  const inv = ctx.invoice ?? {};
  const co = ctx.company ?? {};
  const total = inv.total != null ? `${Number(inv.total).toFixed(2)} ${inv.currency ?? "EUR"}` : "";
  const map: Record<string, string> = {
    "{{invoice_number}}": inv.invoice_number ?? "",
    "{{total}}": total,
    "{{due_date}}": inv.due_date ?? "",
    "{{company_name}}": co.name ?? "",
    "{{customer_name}}": inv.customer_name ?? "",
    "{{iban}}": co.iban ?? "",
    "{{variable_symbol}}": inv.variable_symbol ?? inv.invoice_number ?? "",
  };
  let out = s;
  for (const [k, v] of Object.entries(map)) out = out.split(k).join(v);
  // Backward compatibility for single-brace placeholders in existing data
  const single: Record<string, string> = {
    "{invoice_number}": map["{{invoice_number}}"],
    "{total}": map["{{total}}"],
    "{due_date}": map["{{due_date}}"],
    "{company_name}": map["{{company_name}}"],
    "{customer_name}": map["{{customer_name}}"],
    "{iban}": map["{{iban}}"],
    "{variable_symbol}": map["{{variable_symbol}}"],
  };
  for (const [k, v] of Object.entries(single)) out = out.split(k).join(v);
  return out;
}

/** Load a template from DB; falls back to DEFAULT_TEMPLATES when missing. */
export async function getEmailTemplate(
  companyId: string,
  type: TemplateType,
): Promise<{ subject: string; body: string; fromDb: boolean }> {
  const { data } = await supabaseAdmin
    .from("email_templates")
    .select("subject, body")
    .eq("company_id", companyId)
    .eq("template_type", type)
    .maybeSingle();
  if (data && (data.subject || data.body)) {
    return {
      subject: data.subject || DEFAULT_TEMPLATES[type].subject,
      body: data.body || DEFAULT_TEMPLATES[type].body,
      fromDb: true,
    };
  }
  return { ...DEFAULT_TEMPLATES[type], fromDb: false };
}
