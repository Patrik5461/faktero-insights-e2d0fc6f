import { runInBatches, selectByIds } from "./batch.server";
import { upomienkaNaRade } from "./upomienky-poradie";
import { menoOdosielatela } from "@/lib/bezpecny-text";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { podpisHtml, podpisText } from "./email-podpis";
import { sUctomFaktury } from "./platobny-ucet";
import { formatujMenu } from "@/lib/faktero/mena";
import { krajinaDane } from "./vat-rates";
import { jePodnikatel, omeskanieDe, upomienkaDe } from "./upomienky-de";
import { datumNaDoklade } from "./faktura-jazyk";
import { jazykFaktury } from "./email-jazyk";

import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
export type ReminderNumber = 1 | 2 | 3;

/** Koľko upomienok naraz. Resend má rate limit, tisíc naraz by ho prekročilo. */
const REMINDER_SEND_CONCURRENCY = 5;

const DEFAULT_SUBJECTS: Record<ReminderNumber, string> = {
  1: "Upomienka: Faktúra {invoice_number} je po splatnosti",
  2: "2. upomienka: Faktúra {invoice_number} je po splatnosti",
  3: "3. upomienka: Faktúra {invoice_number} je po splatnosti",
};

const DEFAULT_MESSAGES: Record<ReminderNumber, string> = {
  1: "Dobrý deň,\n\ndovoľujeme si Vás upozorniť, že faktúra {invoice_number} v sume {total} bola splatná dňa {due_date} a k dnešnému dňu evidujeme, že ešte nebola uhradená.\n\nProsíme Vás o jej úhradu v čo najkratšom možnom čase. V prípade, že platba bola už uskutočnená, považujte túto upomienku za bezpredmetnú.\n\nĎakujeme,\n{company_name}",
  2: "Dobrý deň,\n\ntoto je druhá upomienka k faktúre {invoice_number} v sume {total}, ktorá bola splatná dňa {due_date} a doteraz nebola uhradená.\n\nProsíme o bezodkladnú úhradu, aby sme nemuseli pristúpiť k ďalším krokom.\n\nS pozdravom,\n{company_name}",
  3: "Dobrý deň,\n\njedná sa o tretiu a poslednú upomienku k faktúre {invoice_number} v sume {total}, splatnej dňa {due_date}.\n\nAk nebude čiastka uhradená v najbližších dňoch, budeme nútení postúpiť pohľadávku na ďalšie vymáhanie.\n\nS pozdravom,\n{company_name}",
};

/*
  Česká firma (alebo faktúra po česky) dostávala upomienku po slovensky —
  QA 30. 10.: „Dobrý deň, dovoľujeme si Vás upozorniť…“ k faktúre v CZK.
*/
const DEFAULT_SUBJECTS_CS: Record<ReminderNumber, string> = {
  1: "Upomínka: Faktura {invoice_number} je po splatnosti",
  2: "2. upomínka: Faktura {invoice_number} je po splatnosti",
  3: "3. upomínka: Faktura {invoice_number} je po splatnosti",
};

const DEFAULT_MESSAGES_CS: Record<ReminderNumber, string> = {
  1: "Dobrý den,\n\ndovolujeme si Vás upozornit, že faktura {invoice_number} na částku {total} byla splatná dne {due_date} a k dnešnímu dni evidujeme, že dosud nebyla uhrazena.\n\nProsíme Vás o její úhradu v co nejkratším možném termínu. Pokud již byla platba provedena, považujte prosím tuto upomínku za bezpředmětnou.\n\nDěkujeme,\n{company_name}",
  2: "Dobrý den,\n\ntoto je druhá upomínka k faktuře {invoice_number} na částku {total}, která byla splatná dne {due_date} a dosud nebyla uhrazena.\n\nProsíme o neprodlenou úhradu, abychom nemuseli přistoupit k dalším krokům.\n\nS pozdravem,\n{company_name}",
  3: "Dobrý den,\n\njedná se o třetí a poslední upomínku k faktuře {invoice_number} na částku {total}, splatné dne {due_date}.\n\nPokud nebude částka uhrazena v nejbližších dnech, budeme nuceni postoupit pohledávku k dalšímu vymáhání.\n\nS pozdravem,\n{company_name}",
};

export function defaultReminderSubject(n: ReminderNumber) {
  return DEFAULT_SUBJECTS[n];
}
export function defaultReminderMessage(n: ReminderNumber) {
  return DEFAULT_MESSAGES[n];
}

function applyVars(s: string, inv: any, company: any) {
  const total = formatujMenu(inv.total ?? 0, inv.currency ?? "EUR");
  const pairs: Array<[string, string]> = [
    ["invoice_number", inv.invoice_number ?? ""],
    // Dátum ako na doklade („30. 9. 2026“), nie „2026-09-30“.
    [
      "due_date",
      inv.due_date
        ? datumNaDoklade(inv.due_date, krajinaDane(company?.country) === "DE" ? "de" : "sk")
        : "",
    ],
    ["total", total],
    ["company_name", company?.name ?? ""],
    ["customer_name", inv.customer_name ?? ""],
    ["iban", sUctomFaktury(company ?? {}, inv).iban ?? ""],
    ["variable_symbol", inv.variable_symbol ?? inv.invoice_number ?? ""],
  ];
  let out = s;
  for (const [k, v] of pairs) {
    out = out.split(`{{${k}}}`).join(v).split(`{${k}}`).join(v);
  }
  return out;
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export type BuildReminderInput = {
  invoice: any;
  company: any;
  reminderNumber: ReminderNumber;
  overrideSubject?: string;
  overrideMessage?: string;
  /** Kedy odišla prvá upomienka (ISO) — nemecká firma od nej počíta omeškanie (§ 286 BGB). */
  prvaUpomienka?: string | null;
  /** Dnešný deň (ISO) — v testoch pevný. */
  dnes?: string;
};

export function buildReminderContent({
  invoice,
  company,
  reminderNumber,
  overrideSubject,
  overrideMessage,
  prvaUpomienka,
  dnes = dnesBratislava(),
}: BuildReminderInput) {
  /*
    Nemecká firma: predvolený text je nemecký a podľa § 286/288 BGB (úroky
    z omeškania, paušál 40 € pri podnikateľovi). Vlastnú šablónu firmy
    (override, stĺpce reminder_*, tabuľka email_templates) Faktero nemení.
  */
  const jeDe = krajinaDane(company?.country) === "DE";
  const de = jeDe
    ? upomienkaDe({
        cislo: reminderNumber,
        invoice,
        firma: String(company?.name ?? ""),
        omeskanie: omeskanieDe({
          suma: Number(invoice?.total ?? 0),
          splatnost: invoice?.due_date,
          prvaUpomienka: reminderNumber > 1 ? prvaUpomienka : null,
          b2b: jePodnikatel(invoice ?? {}),
          dnes,
        }),
      })
    : null;
  const cs = !jeDe && jazykFaktury(invoice, company) === "cs";
  const subjectTpl =
    overrideSubject ??
    (company as any)?.[`reminder_subject_${reminderNumber}`] ??
    de?.predmet ??
    (cs ? DEFAULT_SUBJECTS_CS : DEFAULT_SUBJECTS)[reminderNumber];
  const messageTpl =
    overrideMessage ??
    (company as any)?.[`reminder_message_${reminderNumber}`] ??
    de?.text ??
    (cs ? DEFAULT_MESSAGES_CS : DEFAULT_MESSAGES)[reminderNumber];

  const subject = applyVars(subjectTpl, invoice, company);
  const message = applyVars(messageTpl, invoice, company);
  const L = jeDe
    ? {
        suma: "Betrag",
        splatnost: "Ursprünglich fällig am",
        udaje: "Zahlungsdaten",
        vs: "Verwendungszweck",
      }
    : cs
      ? { suma: "Částka", splatnost: "Původní splatnost", udaje: "Platební údaje", vs: "VS" }
      : { suma: "Suma", splatnost: "Pôvodná splatnosť", udaje: "Platobné údaje", vs: "VS" };

  const paymentDetails = [
    sUctomFaktury(company ?? {}, invoice).iban
      ? `IBAN: ${sUctomFaktury(company ?? {}, invoice).iban}`
      : null,
    invoice?.variable_symbol
      ? `${L.vs}: ${invoice.variable_symbol}`
      : `${L.vs}: ${invoice.invoice_number ?? ""}`,
    `${L.suma}: ${formatujMenu(invoice.total ?? 0, invoice.currency ?? "EUR", jeDe ? "de-DE" : undefined)}`,
    invoice?.due_date
      ? `${L.splatnost}: ${datumNaDoklade(invoice.due_date, jeDe ? "de" : "sk")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Podpis odosielateľa — upomienka bez kontaktu je pre príjemcu slepá ulička.
  const plain = `${message}\n\n${L.udaje}:\n${paymentDetails}${podpisText(company ?? {})}`;

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;white-space:pre-wrap">${escapeHtml(message)}</div>
    <div style="margin-top:24px;padding:16px 20px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#111">
      <div style="font-weight:600;margin-bottom:8px">${L.udaje}</div>
      <div style="white-space:pre-wrap">${escapeHtml(paymentDetails)}</div>
    </div>
    ${podpisHtml(company ?? {})}
  `;

  return { subject, plain, html, sprava: message };
}

/** Dátum prvej odoslanej upomienky k faktúre (ISO deň) — od nej beží omeškanie v DE. */
export async function prvaOdoslanaUpomienka(
  klient: any,
  invoiceId: string,
): Promise<string | null> {
  try {
    const { data } = await klient
      .from("invoice_reminders")
      .select("sent_at")
      .eq("invoice_id", invoiceId)
      .eq("status", "sent")
      .order("sent_at", { ascending: true })
      .limit(1);
    const d = data?.[0]?.sent_at;
    return d ? String(d).slice(0, 10) : null;
  } catch {
    return null;
  }
}

export type SendReminderInput = {
  company_id: string;
  invoice_id: string;
  reminderNumber: ReminderNumber;
  recipient_email?: string;
  overrideSubject?: string;
  overrideMessage?: string;
  triggeredBy?: "auto" | "manual";
  /** Kto odosiela — pre strážcu odosielania; `null` pri automatických upomienkach. */
  userId?: string | null;
};

/**
 * Text upomienky zo šablón firmy: najprv šablóna typu „Upomienka“ v jazyku
 * faktúry (premenné už doplnené), potom stará šablóna pre stupeň upomienky.
 * Nič = predvolený text z `buildReminderContent`.
 */
export async function sablonaUpomienky(
  companyId: string,
  invoice: any,
  company: any,
  reminderNumber: number,
): Promise<{ subject?: string; body?: string }> {
  let dbSubject: string | undefined;
  let dbBody: string | undefined;
  /*
    Šablóna typu „Upomienka“ v jazyku faktúry (Nastavenia → E-mailové
    šablóny) má prednosť pred jednou šablónou pre každý stupeň upomienky.
  */
  try {
    const { sablonaPreDoklad } = await import("./email-sablony.server");
    const { jazykFaktury } = await import("./email-jazyk");
    const { doplnPremenne, hodnotyPremennych } = await import("./email-sablony");
    const jazyk = jazykFaktury(invoice as any, company as any);
    const s = await sablonaPreDoklad(companyId, "upomienka", jazyk);
    if (s) {
      const h = hodnotyPremennych({
        doklad: invoice as any,
        jazyk,
        firma: (company as any)?.name ?? "",
        iban: sUctomFaktury((company as any) ?? {}, invoice as any).iban ?? "",
        krajina: krajinaDane((company as any)?.country),
      });
      dbSubject = doplnPremenne(s.predmet, h);
      dbBody = doplnPremenne(s.text, h);
    }
  } catch {
    /* ignore */
  }
  if (dbSubject === undefined) {
    try {
      const { getEmailTemplate } = await import("./email-templates.server");
      const tpl = await getEmailTemplate(companyId, `reminder_${reminderNumber}` as any);
      if (tpl.fromDb) {
        dbSubject = tpl.subject;
        dbBody = tpl.body;
      }
    } catch {
      /* ignore */
    }
  }

  return { subject: dbSubject, body: dbBody };
}

export async function sendReminder(input: SendReminderInput) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY nie je nakonfigurovaný.");

  const { data: invoice } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("id", input.invoice_id)
    .eq("company_id", input.company_id)
    .maybeSingle();
  if (!invoice) throw new Error("Faktúra nenájdená");

  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("*")
    .eq("id", input.company_id)
    .single();

  let recipient = input.recipient_email ?? null;
  if (!recipient && invoice.customer_id) {
    const { data: c } = await supabaseAdmin
      .from("customers")
      .select("email")
      .eq("id", invoice.customer_id)
      .maybeSingle();
    recipient = c?.email ?? null;
  }
  if (!recipient) throw new Error("Chýba e-mail príjemcu.");

  // Load editable DB template (falls back to hardcoded defaults + legacy company columns)
  // Upravená šablóna firmy (Nastavenia → E-mailové šablóny), inak predvolený text.
  const { subject: dbSubject, body: dbBody } = await sablonaUpomienky(
    input.company_id,
    invoice,
    company,
    input.reminderNumber,
  );

  const built = buildReminderContent({
    invoice,
    company,
    reminderNumber: input.reminderNumber,
    overrideSubject: input.overrideSubject ?? dbSubject,
    overrideMessage: input.overrideMessage ?? dbBody,
    prvaUpomienka: await prvaOdoslanaUpomienka(supabaseAdmin, invoice.id),
  });

  const senderName = menoOdosielatela(company?.email_sender_name || company?.name);
  const fromEmail = process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk";
  const from = `${senderName} <${fromEmail}>`;

  let providerId: string | null = null;
  let errorMessage: string | null = null;
  let status: "sent" | "failed" = "sent";
  let zastavene = false;
  try {
    // Upomienka ide z vlastného SMTP firmy, keď ho má zapnutý.
    const { posliMailFirmy } = await import("./odoslanie-mailu.server");
    const r = await posliMailFirmy(invoice.company_id, {
      from,
      fromName: senderName,
      to: [recipient],
      subject: built.subject,
      reply_to: company?.email_reply_to || undefined,
      text: built.plain,
      html: built.html,
      ochrana: {
        userId: input.userId ?? null,
        druh: "upomienka",
        dokladId: invoice.id,
        sprava: built.sprava,
      },
    });
    providerId = r.id;
  } catch (e: any) {
    status = "failed";
    errorMessage = e?.message ?? "unknown";
    zastavene = e?.name === "OdosielanieZastavene";
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
    // Kto odoslal — zoznam Odoslané upomienky ho ukazuje pri ručných.
    sent_by: input.userId ?? null,
  });

  if (status === "failed")
    throw new Error(
      zastavene ? String(errorMessage) : `Odoslanie upomienky zlyhalo: ${errorMessage}`,
    );
  return { ok: true, provider_message_id: providerId, recipient };
}

/** Cron: iterate all overdue invoices and send due reminders. */
export async function runOverdueReminders() {
  const today = dnesBratislava();
  // Po stránkach: importované faktúry po splatnosti by inak zaplnili limit
  // PostgRESTu a skutočné faktúry na rade by sa do výberu nedostali.
  const invoices: Array<{
    id: string;
    company_id: string;
    invoice_number: string;
    due_date: string;
    created_at: string;
    customer_id: string | null;
  }> = [];
  for (let od = 0; ; od += 1000) {
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select("id, company_id, invoice_number, due_date, created_at, customer_id")
      .in("status", ["issued", "sent"])
      .lt("due_date", today)
      .is("paid_at", null)
      .is("deleted_at", null)
      .eq("reminders_enabled", true)
      /*
        Upomínať sa dá len ostrá faktúra. Dobropis je peniaz, ktorý firma dlhuje
        zákazníkovi — výzva na zaplatenie po splatnosti by mu prišla naopak.
        Zálohová faktúra zase v celej aplikácii nie je pohľadávka (`jeOtvorena`
        ju vynecháva), takže ju nemá čo upomínať ani cron. `reminders_enabled`
        je v databáze štandardne zapnuté, takže bez tohto filtra by sa oboje
        odoslalo samo, hneď ako by taký doklad prešiel splatnosťou.
      */
      .or("type.is.null,type.eq.regular")
      .order("id")
      .range(od, od + 999);
    if (error) throw new Error(error.message);
    invoices.push(...((data ?? []) as any[]));
    if ((data ?? []).length < 1000) break;
  }

  const companyIds = Array.from(new Set(invoices.map((i) => i.company_id)));
  const { data: companies } = companyIds.length
    ? await supabaseAdmin
        .from("companies")
        .select("id, reminders_enabled, reminder_days_1, reminder_days_2, reminder_days_3")
        .in("id", companyIds)
    : { data: [] as any[] };
  const companyMap = new Map((companies ?? []).map((c) => [c.id, c]));

  const results: Array<{
    invoice_id: string;
    reminder_number: number;
    ok: boolean;
    error?: string;
    skipped?: string;
  }> = [];

  /*
    Odoslané upomienky naraz pre všetky faktúry — stránkovane, lebo chýbajúci
    riadok by znamenal odoslať tú istú upomienku druhýkrát. Podľa nich sa
    určí ďalší stupeň (1 → 2 → 3), nie podľa samotných dní po splatnosti.
  */
  const aktivne = invoices.filter((inv) => {
    const co: any = companyMap.get(inv.company_id);
    if (!co || co.reminders_enabled === false) {
      results.push({ invoice_id: inv.id, reminder_number: 0, ok: false, skipped: "company_disabled" });
      return false;
    }
    return true;
  });
  const sentRows = await selectByIds<{ invoice_id: string; reminder_number: number; sent_at: string }>(
    aktivne.map((i) => i.id),
    (part, from, to) =>
      supabaseAdmin
        .from("invoice_reminders")
        .select("invoice_id, reminder_number, sent_at")
        .in("invoice_id", part)
        .eq("status", "sent")
        .range(from, to),
  );
  const odoslanePodlaFaktury = new Map<string, { stupen: number; kedy: string }[]>();
  for (const r of sentRows) {
    const z = odoslanePodlaFaktury.get(r.invoice_id) ?? [];
    z.push({ stupen: r.reminder_number, kedy: r.sent_at });
    odoslanePodlaFaktury.set(r.invoice_id, z);
  }

  const toSend: Array<{ invoice: (typeof invoices)[number]; reminderNumber: ReminderNumber }> = [];
  for (const inv of aktivne) {
    const co: any = companyMap.get(inv.company_id);
    const naRade = upomienkaNaRade({
      splatnost: inv.due_date,
      zalozena: inv.created_at,
      dnes: today,
      prahy: [co.reminder_days_1 ?? 3, co.reminder_days_2 ?? 7, co.reminder_days_3 ?? 14],
      odoslane: odoslanePodlaFaktury.get(inv.id) ?? [],
    });
    if (naRade.stupen) toSend.push({ invoice: inv, reminderNumber: naRade.stupen });
    else if (naRade.dovod === "importovana") {
      results.push({ invoice_id: inv.id, reminder_number: 0, ok: false, skipped: "imported_after_due" });
    }
  }

  // Krok 3 — odoslanie po dávkach. Každý sendReminder je e-mail cez Resend,
  // takže sa nesmie spustiť tisíc naraz, ale ani jeden po druhom.
  const sendResults = await runInBatches(toSend, REMINDER_SEND_CONCURRENCY, async (c) => {
    try {
      await sendReminder({
        company_id: c.invoice.company_id,
        invoice_id: c.invoice.id,
        reminderNumber: c.reminderNumber,
        triggeredBy: "auto",
      });
      return { invoice_id: c.invoice.id, reminder_number: c.reminderNumber, ok: true };
    } catch (e: any) {
      return {
        invoice_id: c.invoice.id,
        reminder_number: c.reminderNumber,
        ok: false,
        error: e?.message ?? "unknown",
      };
    }
  });
  results.push(...sendResults);

  return { checked: invoices.length, results };
}
