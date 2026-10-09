import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { escapeHtml } from "./ponuka-odpoved.server";

const datum = (d: string) => {
  const [y, m, dd] = d.slice(0, 10).split("-");
  return `${Number(dd)}. ${Number(m)}. ${y}`;
};

/** E-mail odberateľovi: potvrdenie novej splatnosti (eFaktúra sa zmeniť nedá). */
export async function posliOznamenieSplatnosti(v: {
  f: { company_id: string; invoice_number: string; due_date: string; total: number; currency: string; customer_email: string };
  nova: string;
  poznamka: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Odosielanie e-mailov nie je nastavené.");
  const { data: firma } = await supabaseAdmin.from("companies").select("name, email").eq("id", v.f.company_id).maybeSingle();
  const nazov = firma?.name ?? "Dodávateľ";
  const suma = `${Number(v.f.total ?? 0).toLocaleString("sk-SK", { minimumFractionDigits: 2 })} ${v.f.currency ?? "EUR"}`;
  const text = [
    "Dobrý deň,",
    "",
    `potvrdzujeme predĺženie splatnosti faktúry ${v.f.invoice_number} (${suma}) z ${datum(v.f.due_date)} na ${datum(v.nova)}.`,
    v.poznamka ? `\n${v.poznamka}\n` : "",
    "Faktúra sa nemení — platí doklad, ktorý ste dostali, len s novým dátumom splatnosti.",
    "",
    nazov,
  ].join("\n");
  const { posliMailFirmy } = await import("./odoslanie-mailu.server");
  try {
    await posliMailFirmy(v.f.company_id, {
      from: `${nazov.replace(/[<>"]/g, "")} cez Faktero <${process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk"}>`,
      fromName: nazov,
      to: [v.f.customer_email],
      reply_to: firma?.email || undefined,
      subject: `Predĺženie splatnosti faktúry ${v.f.invoice_number}`,
      text,
      html: `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;max-width:560px;line-height:1.5">
        <p>Dobrý deň,</p>
        <p>potvrdzujeme predĺženie splatnosti faktúry <strong>${escapeHtml(v.f.invoice_number)}</strong> (${escapeHtml(suma)})
        z ${escapeHtml(datum(v.f.due_date))} na <strong>${escapeHtml(datum(v.nova))}</strong>.</p>
        ${v.poznamka ? `<p style="white-space:pre-wrap">${escapeHtml(v.poznamka)}</p>` : ""}
        <p style="color:#6b7280;font-size:13px">Faktúra sa nemení — platí doklad, ktorý ste dostali, len s novým dátumom splatnosti.</p>
        <p>${escapeHtml(nazov)}</p>
      </div>`,
    });
  } catch {
    throw new Error("Splatnosť je zmenená, ale e-mail odberateľovi sa nepodarilo odoslať.");
  }
}
