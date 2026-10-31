/**
 * E-mail majiteľovi firmy, keď sa blíži koniec súhlasu Tatra banky alebo keď
 * sa z účtu pre vypršaný súhlas prestali sťahovať pohyby.
 *
 * Zvonček to isté ukáže sám (počíta sa pri otvorení), ale do zvončeka sa
 * nikto nepozrie, kým pohyby nechýbajú. Súhlas obnoviť vie len človek
 * prihlásením do banky — preto e-mail s tlačidlom, nie len značka v appke.
 *
 * Volá sa na konci denného behu bánk (`bank-sync-beh.server`), takže chyby
 * pohybov sú čerstvé a nepotrebuje vlastný cron. Každé upozornenie
 * (pripojenie/účet × druh × deň) ide raz — `bank_suhlas_upozornenia`.
 * Do dát bánk nezapisuje nič.
 */
import { stavSuhlasu, druhEmailuSuhlasu, datumSuhlasu } from "./bank-suhlas";
import { pohybyZastarane, jeChybaSuhlasu } from "./bank-stav-pohybov";

const ADRESA = "https://www.faktero.sk/bankove-ucty";

export type Upozornenie = {
  company_id: string;
  ref_id: string;
  druh: "suhlas_14" | "suhlas_3" | "suhlas_vyprsal" | "pohyby";
  termin: string;
  /** Riadok do e-mailu. */
  popis: string;
};

type Pripojenie = {
  id: string;
  company_id: string;
  provider: string;
  status: string;
  token_expires_at: string | null;
};
type Ucet = {
  id: string;
  company_id: string;
  iban: string | null;
  account_name: string | null;
  pohyby_ok_at: string | null;
  pohyby_chyba: string | null;
  unavailable_since: string | null;
};

/** Čo treba komu oznámiť — čistá funkcia, aby sa dala skúšať bez databázy. */
export function zostavUpozornenia(
  pripojenia: Pripojenie[],
  ucty: Ucet[],
  teraz: Date = new Date(),
): Upozornenie[] {
  const out: Upozornenie[] = [];
  for (const c of pripojenia) {
    if (c.provider !== "tatrabanka" || c.status !== "connected") continue;
    const s = stavSuhlasu(c.token_expires_at, teraz);
    const druh = druhEmailuSuhlasu(s);
    if (!s || !druh) continue;
    out.push({
      company_id: c.company_id,
      ref_id: c.id,
      druh: druh as Upozornenie["druh"],
      termin: s.platiDo,
      popis:
        s.stav === "vyprsal"
          ? `Súhlas Tatra banky vypršal ${datumSuhlasu(s.platiDo)} — pohyby sa nesťahujú.`
          : `Súhlas Tatra banky vyprší ${datumSuhlasu(s.platiDo)} (o ${s.dni} ${s.dni === 1 ? "deň" : s.dni <= 4 ? "dni" : "dní"}).`,
    });
  }
  for (const u of ucty) {
    if (u.unavailable_since || !u.pohyby_chyba) continue;
    // Len vypršaný súhlas — iné chyby (výpadok banky) sa opravia samé a e-mail by plašil.
    // `pohyby_chyba` je už ľudský text z `popisChybyPohybov`, surová chyba banky len výnimočne.
    if (!jeChybaSuhlasu(u.pohyby_chyba) && !/vypršal|už neplatí/i.test(u.pohyby_chyba)) continue;
    if (!pohybyZastarane(u, teraz)) continue;
    const ucet = u.account_name || u.iban || "účet";
    out.push({
      company_id: u.company_id,
      ref_id: u.id,
      druh: "pohyby",
      termin: (u.pohyby_ok_at ?? "1970-01-01").slice(0, 10),
      popis: u.pohyby_ok_at
        ? `Z účtu ${ucet} sa nesťahujú pohyby od ${datumSuhlasu(u.pohyby_ok_at.slice(0, 10))} — súhlas banky vypršal.`
        : `Z účtu ${ucet} sa nesťahujú pohyby — súhlas banky vypršal.`,
    });
  }
  return out;
}

function escapeHtml(s: string) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Obsah e-mailu pre jednu firmu. */
export function textUpozorneniaSuhlasu(firma: string, polozky: Upozornenie[]) {
  const riadky = polozky.map((p) => `• ${p.popis}`);
  const text =
    `Dobrý deň,\n\npri bankovom pripojení firmy ${firma} treba obnoviť súhlas banky:\n\n` +
    `${riadky.join("\n")}\n\n` +
    `Otvorte Bankové účty a pri Tatra banke kliknite na „Obnoviť súhlas“. Prihlásite sa do banky ` +
    `a potvrdíte prístup — účty, pohyby ani výpisy sa pritom nezmažú.\n\n${ADRESA}\n`;
  const html =
    `<p>Dobrý deň,</p><p>pri bankovom pripojení firmy <strong>${escapeHtml(firma)}</strong> treba obnoviť súhlas banky:</p>` +
    `<ul>${polozky.map((p) => `<li>${escapeHtml(p.popis)}</li>`).join("")}</ul>` +
    `<p><a href="${ADRESA}" style="display:inline-block;padding:10px 16px;background:#047857;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Obnoviť súhlas</a></p>` +
    `<p style="color:#555">Pri Tatra banke kliknite na „Obnoviť súhlas“, prihláste sa do banky a potvrďte prístup. Účty, pohyby ani výpisy sa pritom nezmažú.</p>`;
  return { text, html };
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

/** Majiteľ firmy; keď ho nemá (alebo nemá e-mail), adresa firmy. */
async function prijemcaFirmy(supabaseAdmin: any, companyId: string) {
  const { data: firma } = await supabaseAdmin
    .from("companies")
    .select("name, email, created_by, suspended_at")
    .eq("id", companyId)
    .maybeSingle();
  if (!firma || firma.suspended_at) return null;
  const { data: majitelia } = await supabaseAdmin
    .from("company_users")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("role", "owner")
    .limit(1);
  const userId = majitelia?.[0]?.user_id ?? firma.created_by;
  let email: string | null = null;
  if (userId) {
    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    email = (p?.email as string | null) ?? null;
  }
  email = email || (firma.email as string | null) || null;
  return email ? { email, nazov: String(firma.name ?? "") } : null;
}

export async function runBankConsentReminders(teraz: Date = new Date()) {
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  // `bank_suhlas_upozornenia` ešte nie je vo vygenerovaných typoch — doplní ich hlavná relácia.
  const supabaseAdmin: any = admin;
  const [{ data: pripojenia }, { data: ucty }] = await Promise.all([
    supabaseAdmin
      .from("bank_connections")
      .select("id, company_id, provider, status, token_expires_at")
      .eq("provider", "tatrabanka")
      .eq("status", "connected")
      .not("token_expires_at", "is", null),
    supabaseAdmin
      .from("bank_accounts")
      .select("id, company_id, iban, account_name, pohyby_ok_at, pohyby_chyba, unavailable_since")
      .not("pohyby_chyba", "is", null)
      .is("unavailable_since", null),
  ]);

  const vsetky = zostavUpozornenia(
    (pripojenia ?? []) as Pripojenie[],
    (ucty ?? []) as Ucet[],
    teraz,
  );
  const poFirmach = new Map<string, Upozornenie[]>();
  for (const u of vsetky) {
    poFirmach.set(u.company_id, [...(poFirmach.get(u.company_id) ?? []), u]);
  }

  const vysledky: { company_id: string; odoslanych: number; chyba?: string }[] = [];
  for (const [companyId, polozky] of poFirmach) {
    try {
      const { data: log } = await supabaseAdmin
        .from("bank_suhlas_upozornenia")
        .select("ref_id, druh, termin")
        .eq("company_id", companyId);
      const poslane = new Set((log ?? []).map((r: any) => `${r.ref_id}|${r.druh}|${r.termin}`));
      const nove = polozky.filter((p) => !poslane.has(`${p.ref_id}|${p.druh}|${p.termin}`));
      if (!nove.length) continue;

      const prijemca = await prijemcaFirmy(supabaseAdmin, companyId);
      if (!prijemca) {
        vysledky.push({ company_id: companyId, odoslanych: 0, chyba: "bez e-mailu" });
        continue;
      }
      const { text, html } = textUpozorneniaSuhlasu(prijemca.nazov, nove);
      const vyprsal = nove.some((p) => p.druh === "suhlas_vyprsal" || p.druh === "pohyby");
      await sendMail({
        to: prijemca.email,
        subject: `${vyprsal ? "Súhlas banky vypršal" : "Súhlas banky čoskoro vyprší"} — ${prijemca.nazov}`,
        text,
        html,
      });
      // Zapísať až po odoslaní — pri chybe to denný beh skúsi zajtra znova.
      await supabaseAdmin.from("bank_suhlas_upozornenia").upsert(
        nove.map((p) => ({
          company_id: p.company_id,
          ref_id: p.ref_id,
          druh: p.druh,
          termin: p.termin,
          prijemca: prijemca.email,
        })),
        { onConflict: "ref_id,druh,termin", ignoreDuplicates: true },
      );
      vysledky.push({ company_id: companyId, odoslanych: nove.length });
    } catch (e: any) {
      vysledky.push({ company_id: companyId, odoslanych: 0, chyba: e?.message ?? "chyba" });
    }
  }
  const odoslanych = vysledky.reduce((s, v) => s + v.odoslanych, 0);
  console.log(
    `[bank-suhlas] upozornení: ${vsetky.length}, odoslaných e-mailov za ${odoslanych} položiek, chýb ${vysledky.filter((v) => v.chyba).length}`,
  );
  return { upozorneni: vsetky.length, vysledky };
}
