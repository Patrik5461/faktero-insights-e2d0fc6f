/*
  Samofaktúra na serveri — PDF, e-mail dodávateľovi a jeho rozhodnutie.

  PDF kreslí ten istý generátor ako vydané faktúry, len s vymenenými stranami:
  vystavovateľ (`company`) je dodávateľ z dokladu, odberateľ (`customer_*`) sme
  my. Logo ani pečiatka našej firmy na doklad nepatria — faktúra je jeho.
*/

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { escapeHtml, zakladnaAdresa } from "./ponuka-odpoved.server";
import { safePdfFileName } from "./invoice-pdf.server";
import { prepocitajPolozku, dodavatelPlatitel, sumySamofaktury } from "./samofakturacia";

const odosielatel = () => process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk";

export function odkazNaOdsuhlasenie(token: string): string {
  return `${zakladnaAdresa()}/samofaktura/${token}`;
}

export const STLPCE_SAMOFAKTURY =
  "id, company_id, invoice_number, issue_date, delivery_date, due_date, currency, variable_symbol, payment_method, note, items, amount_without_vat, vat_amount, amount_total, status, deleted_at, samofakturacia, samofakturacia_stav, samofakturacia_token, samofakturacia_poznamka, samofakturacia_odoslana_at, samofakturacia_rozhodnutie_at, samofakturacia_rozhodol, customer_id, supplier_name, supplier_ico, supplier_dic, supplier_ic_dph, supplier_iban, supplier_street, supplier_city, supplier_zip, supplier_country, supplier_email, file_path, constant_symbol, specific_symbol, intro_note, language, reverse_charge, reverse_charge_type, eu_plnenie, osobitna_uprava, opravuje_id, opravuje_cislo, exchange_rate, amount_without_vat_eur, vat_amount_eur, discount_type, discount_value, discount_total, advance_invoice_id, advance_amount, naskladnene_at";

export type Samofaktura = Record<string, any>;

/** PDF samofaktúry. Číta cez admin klienta — oprávnenie overí volajúci. */
export async function pdfSamofaktury(
  sf: Samofaktura,
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const { data: firma } = await supabaseAdmin
    .from("companies")
    .select("name, ico, dic, ic_dph, street, city, zip, country, email")
    .eq("id", sf.company_id)
    .maybeSingle();
  if (!firma) throw new Error("Firma nenájdená");

  const platitel = dodavatelPlatitel(sf.supplier_ic_dph);
  const prenesenie = Boolean(sf.reverse_charge);
  const polozky = (Array.isArray(sf.items) ? sf.items : []).map((p: any) =>
    prepocitajPolozku(p, platitel),
  );
  const sumy = sumySamofaktury(polozky, Number(sf.discount_total ?? 0));
  // Pri prenesení daň na doklade nie je — vyčísli si ju odberateľ (my).
  const dan = prenesenie ? 0 : sumy.dan;
  const mena = sf.currency || "EUR";

  let kurz: { kurz: number; den: string; dan: number } | null = null;
  if (mena !== "EUR" && dan !== 0) {
    const { prepocitajDoklad } = await import("./kurzy.server");
    const p = await prepocitajDoklad(mena, String(sf.delivery_date || sf.issue_date), {
      zaklad: sumy.zaklad,
      dan,
      celkom: sumy.zaklad + dan,
    });
    if (p) kurz = { kurz: p.kurz, den: p.den, dan: p.dan };
  }

  const dodavatel = {
    name: sf.supplier_name,
    ico: sf.supplier_ico,
    dic: sf.supplier_dic,
    ic_dph: sf.supplier_ic_dph,
    street: sf.supplier_street,
    city: sf.supplier_city,
    zip: sf.supplier_zip,
    country: sf.supplier_country || "SK",
    email: sf.supplier_email,
    iban: sf.supplier_iban,
    vat_payer: platitel,
  };
  const doklad = {
    invoice_number: sf.invoice_number,
    type: sf.opravuje_cislo ? "credit_note" : "regular",
    opravuje_cislo: sf.opravuje_cislo,
    issue_date: sf.issue_date,
    delivery_date: sf.delivery_date || sf.issue_date,
    due_date: sf.due_date,
    currency: mena,
    language: sf.language || "sk",
    variable_symbol: sf.variable_symbol,
    constant_symbol: sf.constant_symbol,
    specific_symbol: sf.specific_symbol,
    payment_method: sf.payment_method || "prevod",
    intro_note: sf.intro_note,
    notes: sf.note,
    status: sf.status === "paid" ? "paid" : "issued",
    subtotal: sumy.zaklad,
    vat_total: dan,
    total: Math.round((sumy.zaklad + dan) * 100) / 100,
    discount_total: sumy.zlava,
    advance_amount: sf.advance_amount ?? null,
    reverse_charge: prenesenie,
    reverse_charge_type: sf.reverse_charge_type,
    eu_plnenie: sf.eu_plnenie,
    osobitna_uprava: sf.osobitna_uprava,
    exchange_rate: kurz?.kurz ?? null,
    exchange_rate_date: kurz?.den ?? null,
    vat_total_eur: kurz?.dan ?? null,
    samofakturacia: true,
    customer_name: firma.name,
    customer_ico: firma.ico,
    customer_dic: firma.dic,
    customer_ic_dph: firma.ic_dph,
    customer_street: firma.street,
    customer_city: firma.city,
    customer_zip: firma.zip,
    customer_country: firma.country || "SK",
    customer_email: firma.email,
  };

  const { generateInvoicePdfBytes } = await import("./pdf-generator.server");
  const bytes = await generateInvoicePdfBytes({
    company: dodavatel,
    invoice: doklad,
    /*
      Stĺpec „Celkom“ je na faktúre s DPH (ako `invoice_items.total`); položka
      samofaktúry si drží sumu bez DPH, tak sa daň pripočíta tu.
    */
    items: polozky.map((p, i) => {
      const sadzba = prenesenie ? 0 : p.vat_rate;
      return {
        ...p,
        vat_rate: sadzba,
        subtotal: p.total,
        total: Math.round(p.total * (1 + sadzba / 100) * 100) / 100,
        position: i,
      };
    }),
  });
  return { bytes, fileName: safePdfFileName(sf.invoice_number ?? "samofaktura") };
}

function suma(n: number, mena = "EUR") {
  return `${Number(n ?? 0).toLocaleString("sk-SK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${mena}`;
}

async function posli(body: Record<string, unknown>): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Odosielanie e-mailov nie je nastavené.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || `E-mail sa nepodarilo odoslať (${res.status}).`);
  return json?.id ?? null;
}

/** Dodávateľovi pošle PDF a odkaz, kde faktúru odsúhlasí alebo vráti. */
export async function posliDodavatelovi(opts: {
  sf: Samofaktura;
  komu: string;
  token: string;
  sprava?: string | null;
}): Promise<void> {
  const { sf, komu, token } = opts;
  const { data: firma } = await supabaseAdmin
    .from("companies")
    .select("name, email")
    .eq("id", sf.company_id)
    .maybeSingle();
  const { bytes, fileName } = await pdfSamofaktury(sf);
  const odkaz = odkazNaOdsuhlasenie(token);
  // Dodávateľ dostane e-mail v jazyku faktúry, nie po slovensky.
  const { textyDodavatela, localeDodavatela } = await import("./samofakturacia-texty");
  const T = textyDodavatela(sf.language);
  const nazovFirmy = firma?.name ?? T.odberatel;
  const spolu = `${Number(sf.amount_total ?? 0).toLocaleString(localeDodavatela(sf.language), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${sf.currency ?? "EUR"}`;
  const druh = sf.opravuje_cislo ? T.dobropis : T.faktura;
  const predmet = T.predmet(druh, sf.invoice_number, nazovFirmy);
  const sprava = String(opts.sprava ?? "").trim();
  const telo = T.mailTelo(druh, sf.invoice_number, spolu, sf.opravuje_cislo ?? null);

  const text = [
    T.pozdrav,
    "",
    telo,
    sprava ? `\n${sprava}\n` : "",
    T.mailProsba,
    `  ${odkaz}`,
    "",
    T.mailAkNesedi,
    "",
    nazovFirmy,
  ].join("\n");

  const tlacidlo = (url: string, t: string, plne: boolean) =>
    `<a href="${url}" style="display:inline-block;${
      plne
        ? "background:#12734f;border:1px solid #12734f;color:#ffffff;"
        : "background:#ffffff;border:1px solid #d1d5db;color:#374151;"
    }text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:600;font-size:15px;line-height:1;font-family:Inter,Arial,sans-serif">${escapeHtml(t)}</a>`;

  const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;max-width:560px;line-height:1.5">
    <p>${escapeHtml(T.pozdrav)}</p>
    <p>${escapeHtml(telo)}</p>
    ${sprava ? `<p style="white-space:pre-wrap">${escapeHtml(sprava)}</p>` : ""}
    <p>${escapeHtml(T.mailProsba)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:20px">
      <tr><td style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:20px 22px">
        <div style="font-size:13px;color:#6b7280;margin-bottom:2px">${escapeHtml(druh)} ${escapeHtml(sf.invoice_number)}</div>
        <div style="font-size:22px;font-weight:700;color:#111;margin-bottom:16px">${escapeHtml(spolu)}</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding-right:10px">${tlacidlo(`${odkaz}?odpoved=suhlas`, T.suhlasim, true)}</td>
          <td>${tlacidlo(`${odkaz}?odpoved=nesuhlas`, T.nesuhlasim, false)}</td>
        </tr></table>
        <div style="font-size:13px;color:#6b7280;margin-top:14px">
          ${escapeHtml(T.mailOtvorit)} <a href="${odkaz}" style="color:#12734f">${escapeHtml(T.mailOdkaz)}</a>
        </div>
      </td></tr>
    </table>
    <p style="margin-top:12px;font-size:13px;color:#6b7280">${escapeHtml(T.mailAkNesedi)}</p>
    <p style="margin-top:24px">${escapeHtml(nazovFirmy)}</p>
  </div>`;

  await posli({
    from: `${nazovFirmy.replace(/[<>"]/g, "")} ${sf.language && !["sk", "cs"].includes(sf.language) ? "via" : sf.language === "cs" ? "přes" : "cez"} Faktero <${odosielatel()}>`,
    to: [komu],
    reply_to: firma?.email || undefined,
    subject: predmet,
    text,
    html,
    attachments: [{ filename: fileName, content: Buffer.from(bytes).toString("base64") }],
  });
}

/** Odberateľovi (nám) príde správa, ako dodávateľ rozhodol. */
export async function oznamRozhodnutie(opts: {
  sf: Samofaktura;
  suhlas: boolean;
  poznamka?: string | null;
}): Promise<void> {
  const { sf, suhlas } = opts;
  if (!process.env.RESEND_API_KEY) return;
  const { data: firma } = await supabaseAdmin
    .from("companies")
    .select("email")
    .eq("id", sf.company_id)
    .maybeSingle();
  if (!firma?.email) return;
  const odkaz = `${zakladnaAdresa()}/prijate-faktury/${sf.id}`;
  const vysledok = suhlas ? "odsúhlasil" : "neodsúhlasil";
  const text = [
    `${sf.supplier_name} ${vysledok} samofaktúru ${sf.invoice_number} (${suma(Number(sf.amount_total ?? 0), sf.currency ?? "EUR")}).`,
    opts.poznamka ? `\nPoznámka dodávateľa: ${opts.poznamka}` : "",
    suhlas
      ? "\nFaktúra je teraz riadna prijatá faktúra — vstupuje do DPH a dá sa uhradiť."
      : "\nOpravte ju a pošlite znova na odsúhlasenie.",
    `\n${odkaz}`,
  ].join("");
  try {
    await posli({
      from: `Faktero <${odosielatel()}>`,
      to: [firma.email],
      subject: `Samofaktúra ${sf.invoice_number}: dodávateľ ${vysledok}`,
      text,
    });
  } catch (e) {
    console.warn("[samofakturacia] oznam rozhodnutia:", String((e as Error)?.message ?? e));
  }
}

/**
 * Po odsúhlasení sa PDF uloží ako príloha prijatej faktúry — presne v tej
 * podobe, ktorú dodávateľ odsúhlasil. Neskoršia úprava ho už neprepíše.
 */
export async function ulozOdsuhlasenePdf(sf: Samofaktura): Promise<string | null> {
  try {
    const { bytes } = await pdfSamofaktury(sf);
    const cesta = `${sf.company_id}/samofaktura-${sf.id}.pdf`;
    const { error } = await supabaseAdmin.storage
      .from("purchase-invoices")
      .upload(cesta, bytes, { contentType: "application/pdf", upsert: true });
    if (error) throw error;
    await supabaseAdmin
      .from("purchase_invoices")
      .update({ file_path: cesta, file_mime: "application/pdf", file_size: bytes.byteLength })
      .eq("id", sf.id);
    return cesta;
  } catch (e) {
    console.warn("[samofakturacia] PDF k odsúhlaseniu:", String((e as Error)?.message ?? e));
    return null;
  }
}
