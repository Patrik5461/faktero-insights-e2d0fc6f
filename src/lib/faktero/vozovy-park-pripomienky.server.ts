/**
 * Cron: denné pripomienky k termínom vozového parku — STK, emisná kontrola,
 * PZP, havarijné poistenie, diaľničná známka a servis.
 *
 * Rovnaký mechanizmus ako pripomienky k zamestnancom: e-mail cez Resend na
 * adresu firmy, a keď ju firma nemá, jej zakladateľovi. V zvončeku sa tie isté
 * termíny ukážu samé (počítajú sa pri otvorení z tých istých dát).
 *
 * Každý termín (vozidlo × druh × dátum) ide e-mailom raz — `vehicle_reminder_log`.
 * Po predĺžení STK je nový dátum novým termínom a o 30 dní pred ním príde ďalší.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { terminyNaRiesenie, type Termin } from "./vozovy-park";

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

const datumSk = (d: string) => d.split("-").reverse().join(". ");

export type PripomienkaVozidla = Termin & { vehicle_id: string; vozidlo: string };

export function popisTerminu(p: PripomienkaVozidla): string {
  if (p.stav === "prepadnute") return `${p.nazov}: platnosť skončila ${datumSk(p.datum)}`;
  if (p.dni === 0) return `${p.nazov}: platnosť končí dnes`;
  return `${p.nazov}: platnosť končí ${datumSk(p.datum)} (o ${p.dni} ${p.dni === 1 ? "deň" : p.dni <= 4 ? "dni" : "dní"})`;
}

/** Obsah e-mailu — vozidlá a termíny, nič viac. */
export function textPripomienokVozidiel(firma: string, pripomienky: PripomienkaVozidla[]) {
  const riadky = pripomienky.map((p) => `• ${p.vozidlo} — ${popisTerminu(p)}`);
  const text = `Dobrý deň,\n\nvo vozovom parku firmy ${firma} sa blížia termíny:\n\n${riadky.join("\n")}\n\nVozidlá nájdete vo Fakteri v časti Vozový park: https://www.faktero.sk/vozovy-park\n`;
  const html = `<p>Dobrý deň,</p><p>vo vozovom parku firmy <strong>${escapeHtml(firma)}</strong> sa blížia termíny:</p><ul>${pripomienky
    .map(
      (p) =>
        `<li><a href="https://www.faktero.sk/vozovy-park/${p.vehicle_id}"><strong>${escapeHtml(p.vozidlo)}</strong></a> — ${escapeHtml(popisTerminu(p))}</li>`,
    )
    .join("")}</ul><p>Keď termín predĺžite, stačí vo Fakteri prepísať dátum pri vozidle.</p>`;
  return { text, html };
}

export async function runVehicleReminders() {
  const dnesnyDen = dnes();
  // Len aktívne vozidlá s aspoň jedným termínom — ostatné nemajú čo pripomínať.
  const { data: vozidla, error } = await supabaseAdmin
    .from("vehicles")
    .select(
      "id, company_id, name, license_plate, stk_do, ek_do, pzp_do, havarijne_do, dialnicna_znamka_do, servis_datum",
    )
    .eq("active", true)
    .or(
      "stk_do.not.is.null,ek_do.not.is.null,pzp_do.not.is.null,havarijne_do.not.is.null,dialnicna_znamka_do.not.is.null,servis_datum.not.is.null",
    );
  if (error) throw new Error(error.message);

  const poFirmach = new Map<string, PripomienkaVozidla[]>();
  for (const v of vozidla ?? []) {
    const nazov = [v.name, v.license_plate].filter(Boolean).join(" · ");
    for (const t of terminyNaRiesenie(v, dnesnyDen)) {
      const zoznam = poFirmach.get(v.company_id) ?? [];
      zoznam.push({ ...t, vehicle_id: v.id, vozidlo: nazov });
      poFirmach.set(v.company_id, zoznam);
    }
  }

  const vysledky: { company_id: string; terminov: number; odoslanych: number; chyba?: string }[] =
    [];
  for (const [companyId, vsetky] of poFirmach) {
    try {
      const { data: log } = await supabaseAdmin
        .from("vehicle_reminder_log")
        .select("vehicle_id, kind, due_date")
        .eq("company_id", companyId);
      const poslane = new Set(
        (log ?? []).map((r: any) => `${r.vehicle_id}|${r.kind}|${r.due_date}`),
      );
      const nove = vsetky.filter((p) => !poslane.has(`${p.vehicle_id}|${p.kluc}|${p.datum}`));
      if (!nove.length) {
        vysledky.push({ company_id: companyId, terminov: vsetky.length, odoslanych: 0 });
        continue;
      }

      const { data: f } = await supabaseAdmin
        .from("companies")
        .select("name, email, created_by")
        .eq("id", companyId)
        .maybeSingle();
      let prijemca = (f?.email as string | null) ?? null;
      if (!prijemca && f?.created_by) {
        const { data: p } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .eq("id", f.created_by)
          .maybeSingle();
        prijemca = (p?.email as string | null) ?? null;
      }
      if (!prijemca) {
        vysledky.push({
          company_id: companyId,
          terminov: vsetky.length,
          odoslanych: 0,
          chyba: "firma nemá e-mail",
        });
        continue;
      }

      const firma = (f?.name as string) ?? "";
      const { text, html } = textPripomienokVozidiel(firma, nove);
      await sendMail({
        to: prijemca,
        subject: `Vozový park: ${nove.length === 1 ? `${nove[0].nazov} ${nove[0].vozidlo}` : `${nove.length} termíny`} — ${firma}`,
        text,
        html,
      });
      // Zapísať až po úspešnom odoslaní — pri chybe to cron skúsi zajtra znova.
      await supabaseAdmin.from("vehicle_reminder_log").upsert(
        nove.map((p) => ({
          company_id: companyId,
          vehicle_id: p.vehicle_id,
          kind: p.kluc,
          due_date: p.datum,
        })),
        { onConflict: "vehicle_id,kind,due_date", ignoreDuplicates: true },
      );
      vysledky.push({ company_id: companyId, terminov: vsetky.length, odoslanych: nove.length });
    } catch (e: any) {
      vysledky.push({
        company_id: companyId,
        terminov: 0,
        odoslanych: 0,
        chyba: e?.message ?? "chyba",
      });
    }
  }
  return { den: dnesnyDen, firiem: poFirmach.size, vysledky };
}
