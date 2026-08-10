import { supabase } from "@/integrations/supabase/client";
import type { BlocekVysledok } from "./blocek.functions";

/**
 * Uloženie dokladu z mobilnej aplikácie.
 *
 * Zámerne oddelené od stránok: ten istý postup potrebuje bloček z QR, faktúra
 * v PDF aj viacstranový doklad. Rozdiel je len v tom, čo sa prikladá.
 */

export type UlozenyDoklad = { id: string };

/** Data URL → bajty. Fotka aj PDF chodia z fotoaparátu i z výberu súborov rovnako. */
export function dataUrlNaBajty(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const [hlavicka, telo] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(hlavicka)?.[1] ?? "application/octet-stream";
  const bin = atob(telo ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

export async function nahrajPrilohu(
  companyId: string,
  dataUrl: string,
): Promise<{ path: string; mime: string; size: number } | null> {
  const { bytes, mime } = dataUrlNaBajty(dataUrl);
  const pripona = mime === "application/pdf" ? "pdf" : (mime.split("/")[1] ?? "jpg");
  const path = `${companyId}/${crypto.randomUUID()}.${pripona}`;
  const { error } = await supabase.storage
    .from("expense-receipts")
    .upload(path, bytes, { contentType: mime });
  if (error) return null;
  return { path, mime, size: bytes.length };
}

/**
 * Zlepí odfotené strany do jedného PDF.
 *
 * Viacstranový doklad sa inak uloží ako kopa nesúvisiacich fotiek a účtovník
 * ich musí skladať ručne. Jeden súbor navyše prejde aj čítaním údajov naraz.
 */
export async function stranyDoPdf(strany: string[]): Promise<string> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  for (const strana of strany) {
    const { bytes, mime } = dataUrlNaBajty(strana);
    const obrazok = mime.includes("png")
      ? await pdf.embedPng(bytes)
      : await pdf.embedJpg(bytes);
    const stranaPdf = pdf.addPage([obrazok.width, obrazok.height]);
    stranaPdf.drawImage(obrazok, { x: 0, y: 0, width: obrazok.width, height: obrazok.height });
  }
  const base64 = await pdf.saveAsBase64();
  return `data:application/pdf;base64,${base64}`;
}

/** Doklad prečítaný zo skenera → záznam vo výdavkoch. */
export function dokladNaZaznam(
  companyId: string,
  r: BlocekVysledok,
  uhrada: "hotovost" | "karta" | "prevod",
  priloha: { path: string; mime: string; size: number } | null,
) {
  const spolu = r.total ?? null;
  const dph = r.vat_amount ?? null;
  return {
    company_id: companyId,
    source: (r.zdroj === "foto" ? "photo" : "qr") as "photo" | "qr",
    status: "processed" as const,
    supplier_name: r.supplier ?? null,
    supplier_ico: r.supplier_ico ?? null,
    supplier_ic_dph: r.supplier_ic_dph ?? null,
    document_number: r.document_number ?? null,
    issue_date: r.date ?? null,
    total_amount: spolu,
    vat_amount: dph,
    net_amount: r.net_amount ?? (spolu != null && dph != null ? round2(spolu - dph) : null),
    vat_rate: r.vat_rate ?? null,
    currency: r.currency ?? "EUR",
    payment_method: uhrada,
    file_path: priloha?.path ?? null,
    file_mime: priloha?.mime ?? null,
    file_size: priloha?.size ?? null,
    qr_raw: r.qr_raw ?? null,
    items: r.items.length ? r.items : null,
    vat_breakdown: r.vat_breakdown?.length ? r.vat_breakdown : null,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
