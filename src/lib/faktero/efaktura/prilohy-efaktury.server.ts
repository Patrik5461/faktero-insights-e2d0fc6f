/**
 * Prílohy eFaktúry na serveri — PDF faktúry a vybrané prílohy dokladu.
 *
 * Volá sa až po overení, že človek k firme patrí (`posliEfakturuFn`), alebo
 * zo serverovej úlohy; prílohy sa čítajú len z faktúry a firmy, ktorú
 * faktúra naozaj má — id príloh z požiadavky inú firmu neotvoria.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { PrilohaNaOdoslanie } from "./epostak-telo";
import {
  EF_MAX_SUBOR,
  dovodNepovolenej,
  mimeEfaktury,
  obsahSediSMime,
  popisPdfFaktury,
  skontrolujVyber,
} from "./prilohy-efaktury";
export { odtlacokTela } from "./odtlacok.server";

export type VolbyPriloh = {
  /** Priložiť PDF faktúry — predvolene áno. */
  sPdf?: boolean;
  /** Id riadkov z `invoice_attachments`. */
  prilohyIds?: string[] | null;
};

/** PDF faktúry tak, ako ide do mailu (aj so ZUGFeRD pri nemeckej firme). */
export async function pdfFakturyNaPrilohu(
  invoice: { id: string; invoice_number?: string | null; language?: string | null },
  company: { country?: string | null } | null,
): Promise<{ nazov: string; bajty: Buffer; popis: string }> {
  const { ensureInvoicePdf, safePdfFileName } = await import("../invoice-pdf.server");
  const { path } = await ensureInvoicePdf(invoice.id);
  const { data: blob, error } = await supabaseAdmin.storage.from("invoice-pdfs").download(path);
  if (error || !blob) throw new Error(error?.message ?? "PDF faktúry sa nepodarilo načítať.");
  const { jazykFaktury } = await import("../email-jazyk");
  return {
    nazov: safePdfFileName(invoice.invoice_number ?? "faktura"),
    bajty: Buffer.from(await blob.arrayBuffer()),
    popis: popisPdfFaktury(jazykFaktury(invoice, company)),
  };
}

/**
 * Zostaví `attachments` pre ePoštáka. Limity a typy kontroluje znova —
 * okno v prehliadači sa dá obísť a veľkosť PDF pozná až server.
 */
export async function pripravPrilohyEfaktury(
  invoice: {
    id: string;
    company_id: string;
    invoice_number?: string | null;
    language?: string | null;
  },
  company: { country?: string | null } | null,
  volby: VolbyPriloh = {},
): Promise<PrilohaNaOdoslanie[]> {
  const sPdf = volby.sPdf !== false;
  const ids = [...new Set((volby.prilohyIds ?? []).filter(Boolean))];

  type Riadok = {
    id: string;
    name: string;
    mime: string | null;
    size: number | null;
    path: string;
  };
  let riadky: Riadok[] = [];
  if (ids.length) {
    const { data, error } = await supabaseAdmin
      .from("invoice_attachments")
      .select("id, name, mime, size, path, created_at")
      .eq("company_id", invoice.company_id)
      .eq("invoice_id", invoice.id)
      .in("id", ids)
      .order("created_at");
    if (error) throw new Error(error.message);
    riadky = (data ?? []) as Riadok[];
    if (riadky.length !== ids.length) {
      throw new Error(
        "Niektorá z vybraných príloh už pri faktúre nie je — obnovte stránku a vyberte znova.",
      );
    }
    // Typ a veľkosť podľa záznamu — skôr, než sa čokoľvek sťahuje.
    for (const r of riadky) {
      const dovod = dovodNepovolenej(r);
      if (dovod) throw new Error(`${r.name}: ${dovod}`);
    }
  }

  const pdf = sPdf ? await pdfFakturyNaPrilohu(invoice, company) : null;

  const subory: { r: Riadok; bajty: Buffer; mime: string }[] = [];
  for (const r of riadky) {
    const { data: blob } = await supabaseAdmin.storage.from("invoice-attachments").download(r.path);
    if (!blob) throw new Error(`${r.name}: súbor sa nepodarilo načítať z úložiska.`);
    const bajty = Buffer.from(await blob.arrayBuffer());
    if (bajty.length > EF_MAX_SUBOR)
      throw new Error(`${r.name}: Súbor je väčší než 10 MB — eFaktúra ho neprenesie.`);
    const mime = mimeEfaktury(r.mime, r.name)!;
    if (!obsahSediSMime(new Uint8Array(bajty), mime)) {
      throw new Error(
        `${r.name}: obsah súboru nezodpovedá jeho typu (${mime}) — ePošták by ho odmietol. Uložte ho znova v správnom formáte.`,
      );
    }
    subory.push({ r, bajty, mime });
  }

  const kontrola = skontrolujVyber(
    pdf ? pdf.bajty.length : null,
    subory.map((s) => ({ id: s.r.id, name: s.r.name, mime: s.mime, size: s.bajty.length })),
    pdf?.nazov,
  );
  if (kontrola.chyby.length) throw new Error(kontrola.chyby.join(" "));

  return [
    ...(pdf
      ? [
          {
            fileName: pdf.nazov,
            mimeType: "application/pdf",
            content: pdf.bajty.toString("base64"),
            description: pdf.popis,
          },
        ]
      : []),
    ...subory.map((s) => ({
      fileName: s.r.name,
      mimeType: s.mime,
      content: s.bajty.toString("base64"),
    })),
  ];
}
