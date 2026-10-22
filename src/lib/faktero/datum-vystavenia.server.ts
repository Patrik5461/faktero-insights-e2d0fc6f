/*
  Dátum vystavenia pri prvom odoslaní — serverová časť.

  Pravidlo je v `datum-vystavenia.ts`; tu sa zbierajú údaje (či už doklad
  odišiel, zámok obdobia) a zapisuje sa zmena. Odoslanie e-mailom, eFaktúrou
  aj cez verejné API volá `overDatumPredOdoslanim` — okno v prehliadači je len
  pohodlie, rozhoduje server.
*/
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  dorucenieZlyhalo,
  dnesBratislava,
  kontrolaDatumu,
  KOD_STARY_DATUM,
  uzOdoslana,
  zmenaNaDnes,
  type KontrolaDatumu,
} from "./datum-vystavenia";

const STLPCE =
  "id, company_id, type, status, issue_date, delivery_date, due_date, povodna_splatnost, predlzene_at, predlzil, invoice_number, exported_at, sent_at";

/** Odmietnutie prvého odoslania so starým dátumom vystavenia. */
export class StaryDatumVystavenia extends Error {
  code = KOD_STARY_DATUM;
  kontrola: KontrolaDatumu;
  constructor(k: KontrolaDatumu) {
    super(
      k.mozno
        ? `Dátum vystavenia ${datumSk(k.datum)} nie je dnešný. Pred prvým odoslaním ho zmeňte na dnes (${datumSk(k.dnes)}).`
        : `Dátum vystavenia ${datumSk(k.datum)} nie je dnešný a zmeniť sa nedá. Odoslanie s pôvodným dátumom treba výslovne potvrdiť.`,
    );
    this.name = "StaryDatumVystavenia";
    this.kontrola = k;
  }
}

function datumSk(d: string | null | undefined): string {
  if (!d) return "";
  const [r, m, dd] = d.slice(0, 10).split("-");
  return `${Number(dd)}. ${Number(m)}. ${r}`;
}

/** Zistí, či treba pred odoslaním zmeniť dátum. Faktúra musí patriť firme. */
export async function kontrolaPredOdoslanim(
  invoiceId: string,
  companyId: string,
): Promise<KontrolaDatumu> {
  const [{ data: f, error }, { data: firma }, { count: maily }, { data: dokumenty }] =
    await Promise.all([
      supabaseAdmin
        .from("invoices")
        .select(STLPCE)
        .eq("id", invoiceId)
        .eq("company_id", companyId)
        .maybeSingle(),
      supabaseAdmin.from("companies").select("locked_until").eq("id", companyId).maybeSingle(),
      supabaseAdmin
        .from("invoice_email_logs")
        .select("id", { count: "exact", head: true })
        .eq("invoice_id", invoiceId)
        .eq("status", "sent"),
      supabaseAdmin.from("efaktura_documents").select("id").eq("invoice_id", invoiceId),
    ]);
  if (error) throw error;
  if (!f) throw new Error("Faktúra nenájdená");

  let efakturaOdoslana = false;
  const ids = (dokumenty ?? []).map((d) => d.id);
  if (ids.length) {
    const { data: dorucenia } = await supabaseAdmin
      .from("efaktura_deliveries")
      .select("status")
      .in("document_id", ids);
    efakturaOdoslana = (dorucenia ?? []).some((d) => !dorucenieZlyhalo(d.status as string));
  }

  const odoslana = uzOdoslana(f as any, { emailOdoslany: (maily ?? 0) > 0, efakturaOdoslana });
  return kontrolaDatumu(f as any, odoslana, (firma as any)?.locked_until ?? null);
}

/**
 * Pustí prvé odoslanie len s dnešným dátumom vystavenia.
 *
 * `potvrdenyStaryDatum` platí iba pre doklad, ktorý sa zmeniť nedá — keď sa
 * dá, príznak nepomôže a dátum treba najprv zmeniť.
 */
export async function overDatumPredOdoslanim(
  invoiceId: string,
  companyId: string,
  potvrdenyStaryDatum?: boolean,
): Promise<void> {
  const k = await kontrolaPredOdoslanim(invoiceId, companyId);
  if (!k.treba) return;
  if (!k.mozno && potvrdenyStaryDatum) return;
  throw new StaryDatumVystavenia(k);
}

type Klient = { from: (typeof supabaseAdmin)["from"] };

/**
 * Zmení dátum vystavenia na dnešok. Splatnosť sa posunie o rovnaký počet dní,
 * dátum dodania ostáva, číslo faktúry tiež.
 *
 * Zapisuje sa klientom, ktorý dostane volajúci: v prehliadači prihláseným
 * používateľom (RLS aj zámok obdobia platia ako pri oprave faktúry), vo
 * verejnom API kľúčom firmy. Uložené PDF a XML eFaktúry sa zahodia, aby sa
 * vyrobili s novým dátumom.
 */
export async function zmenDatumNaDnes(
  klient: Klient,
  invoiceId: string,
  companyId: string,
): Promise<KontrolaDatumu & { zmenene: boolean }> {
  const k = await kontrolaPredOdoslanim(invoiceId, companyId);
  if (!k.treba) return { ...k, zmenene: false };
  if (!k.mozno) throw new Error(k.dovod ?? "Dátum vystavenia sa zmeniť nedá.");

  const { data: f } = await supabaseAdmin
    .from("invoices")
    .select(STLPCE)
    .eq("id", invoiceId)
    .eq("company_id", companyId)
    .single();
  const dnes = dnesBratislava();
  const zmena = zmenaNaDnes(f as any, dnes);

  const { data: zapisane, error } = await (klient.from("invoices") as any)
    .update({
      issue_date: zmena.issue_date,
      due_date: zmena.due_date,
      delivery_date: zmena.delivery_date,
      // PDF a jeho odtlačok — nové sa vyrobí pri odoslaní.
      pdf_url: null,
      pdf_source_hash: null,
    })
    .eq("id", invoiceId)
    .eq("company_id", companyId)
    // Súbeh: niekto ho medzitým zmenil alebo odoslal — nezapisovať naslepo.
    .eq("issue_date", (f as any).issue_date)
    .select("id");
  if (error) throw new Error(error.message);
  if (!zapisane?.length) {
    throw new Error(
      "Faktúru sa nepodarilo zmeniť — skontrolujte oprávnenie alebo ju otvorte znova.",
    );
  }

  /*
    Spúšťač `zapamataj_povodnu_splatnost` berie každú zmenu splatnosti
    vystavenej faktúry ako predĺženie: zapíše pôvodnú splatnosť a kto ju
    predĺžil. Tu o predĺženie nejde — lehota je rovnaká, len sa posunula s
    dátumom vystavenia, a od pôvodnej splatnosti sa rátajú lehoty § 25a.
    Druhý zápis (už bez due_date, takže spúšťač mlčí) vráti stav predĺženia
    tam, kde bol: bez predĺženia prázdny, pri skoršom predĺžení posunutý.
  */
  const { error: chybaPredlzenia } = await (klient.from("invoices") as any)
    .update({
      povodna_splatnost: zmena.povodna_splatnost,
      predlzene_at: (f as any).predlzene_at ?? null,
      predlzil: (f as any).predlzil ?? null,
    })
    .eq("id", invoiceId)
    .eq("company_id", companyId);
  if (chybaPredlzenia) throw new Error(chybaPredlzenia.message);

  await zahodXmlEfaktury(invoiceId, companyId, dnes);
  return { ...k, zmenene: true };
}

/** Vygenerované, ale neodoslané XML eFaktúry nesie starý dátum — preč s ním. */
async function zahodXmlEfaktury(invoiceId: string, companyId: string, dnes: string) {
  const { data: doc } = await supabaseAdmin
    .from("efaktura_documents")
    .select("id")
    .eq("invoice_id", invoiceId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!doc) return;
  await supabaseAdmin.storage.from("efaktura-xml").remove([`${companyId}/${invoiceId}.xml`]);
  const { count } = await supabaseAdmin
    .from("efaktura_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("document_id", doc.id);
  if (!count) {
    await supabaseAdmin.from("efaktura_documents").delete().eq("id", doc.id);
  } else {
    // Zlyhané pokusy ostávajú v histórii, dokument sa len vyprázdni.
    await supabaseAdmin
      .from("efaktura_documents")
      .update({
        status: "draft",
        xml_payload: null,
        payload_hash: null,
        validation_errors: [],
        issue_date: dnes,
      } as any)
      .eq("id", doc.id);
  }
}
