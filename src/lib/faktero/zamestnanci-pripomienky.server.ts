/**
 * Cron: denné pripomienky k zamestnancom — prihláška do Sociálnej poisťovne
 * pred nástupom, oznámenie zdravotnej poisťovni do 8 dní, koniec skúšobnej
 * doby, koniec zmluvy na dobu určitú, lekárske prehliadky a BOZP.
 *
 * Ten istý mechanizmus ako upozornenia na sklad: e-mail cez Resend na adresu
 * firmy, a keď firma adresu nemá, jej zakladateľovi. V zvončeku sa tie isté
 * pripomienky ukážu samé — počítajú sa pri otvorení z rovnakých dát.
 *
 * Každá pripomienka (zamestnanec × druh × termín) sa e-mailom pošle raz;
 * pamätá si to `employee_reminder_log`. Po termíne ostane v zvončeku, kým sa
 * vec nevybaví, ale e-mail sa neopakuje každý deň.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pripomienkyZamestnancov, datumSk, type Pripomienka } from "./zamestnanci";

function escapeHtml(s: string) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

async function sendMail(opts: { to: string; subject: string; html: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY nie je nakonfigurovaný.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: `Faktero <${process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk"}>`,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    }),
  });
  if (!res.ok) throw new Error(`Resend error: ${(await res.text()).slice(0, 500)}`);
}

function dnes(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(new Date());
}

/** Obsah e-mailu — mená a termíny, žiadne citlivé údaje. */
export function textPripomienok(firma: string, pripomienky: Pripomienka[]) {
  const riadky = pripomienky.map((p) => `• ${p.nadpis}: ${p.text}`);
  const text = `Dobrý deň,\n\npre firmu ${firma} treba vybaviť:\n\n${riadky.join("\n")}\n\nKartu zamestnanca nájdete vo Fakteri v časti Zamestnanci.\n`;
  const html = `<p>Dobrý deň,</p><p>pre firmu <strong>${escapeHtml(firma)}</strong> treba vybaviť:</p><ul>${pripomienky
    .map((p) => `<li><strong>${escapeHtml(p.nadpis)}</strong>: ${escapeHtml(p.text)}</li>`)
    .join("")}</ul><p>Kartu zamestnanca nájdete vo Fakteri v časti <a href="https://www.faktero.sk/zamestnanci">Zamestnanci</a>.</p>`;
  return { text, html };
}

export async function runEmployeeReminders() {
  const { data: firmy, error } = await supabaseAdmin
    .from("companies")
    .select("id, name, email, created_by")
    .eq("module_employees", true);
  if (error) throw new Error(error.message);

  const dnesnyDen = dnes();
  const vysledky: { company_id: string; pripomienok: number; odoslanych: number; chyba?: string }[] = [];

  for (const f of firmy ?? []) {
    try {
      const [zam, zml, log] = await Promise.all([
        supabaseAdmin
          .from("employees")
          .select("id, first_name, last_name, title_before, title_after, start_date, end_date, status, sp_registered_at, zp_registered_at, medical_check_due, bozp_training_due")
          .eq("company_id", f.id)
          .eq("status", "active"),
        supabaseAdmin
          .from("employee_contracts")
          .select("id, employee_id, kind, start_date, end_date, probation_end, status")
          .eq("company_id", f.id)
          .eq("status", "active"),
        supabaseAdmin.from("employee_reminder_log").select("employee_id, kind, due_date").eq("company_id", f.id),
      ]);
      if (zam.error) throw new Error(zam.error.message);

      const vsetky = pripomienkyZamestnancov(dnesnyDen, (zam.data ?? []) as any, (zml.data ?? []) as any);
      const poslane = new Set((log.data ?? []).map((r: any) => `${r.employee_id}|${r.kind}|${r.due_date}`));
      const nove = vsetky.filter((p) => !poslane.has(`${p.employee_id}|${p.druh}|${p.termin}`));
      if (!nove.length) {
        vysledky.push({ company_id: f.id, pripomienok: vsetky.length, odoslanych: 0 });
        continue;
      }

      let prijemca = f.email as string | null;
      if (!prijemca && f.created_by) {
        const { data: p } = await supabaseAdmin.from("profiles").select("email").eq("id", f.created_by).maybeSingle();
        prijemca = (p?.email as string | null) ?? null;
      }
      if (!prijemca) {
        vysledky.push({ company_id: f.id, pripomienok: vsetky.length, odoslanych: 0, chyba: "firma nemá e-mail" });
        continue;
      }

      const { text, html } = textPripomienok(f.name, nove);
      await sendMail({
        to: prijemca,
        subject: `Zamestnanci: ${nove.length === 1 ? nove[0].nadpis : `${nove.length} veci na vybavenie`} — ${f.name}`,
        text,
        html,
      });
      // Zapísať až po úspešnom odoslaní — pri chybe to cron skúsi zajtra znova.
      await supabaseAdmin.from("employee_reminder_log").upsert(
        nove.map((p) => ({ company_id: f.id, employee_id: p.employee_id, kind: p.druh, due_date: p.termin })),
        { onConflict: "employee_id,kind,due_date", ignoreDuplicates: true },
      );
      vysledky.push({ company_id: f.id, pripomienok: vsetky.length, odoslanych: nove.length });
    } catch (e: any) {
      vysledky.push({ company_id: f.id, pripomienok: 0, odoslanych: 0, chyba: e?.message ?? "chyba" });
    }
  }
  return { den: dnesnyDen, datum: datumSk(dnesnyDen), firiem: (firmy ?? []).length, vysledky };
}
