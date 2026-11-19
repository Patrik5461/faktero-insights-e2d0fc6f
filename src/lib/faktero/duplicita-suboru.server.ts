import { createHash } from "node:crypto";
import {
  vyberDuplicitu,
  type KandidatDuplicity,
  type VysledokDuplicity,
} from "./duplicita-suboru";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Klient = any;

/** SHA-256 obsahu súboru (hex) — odtlačok na porovnanie „ten istý súbor“. */
export function odtlacokSuboru(bajty: Uint8Array): string {
  return createHash("sha256").update(bajty).digest("hex");
}

const s = (v: unknown) => (v == null || v === "" ? null : String(v));

/**
 * Hľadá vo firme doklad s rovnakým odtlačkom súboru — v Nespracovaných,
 * prijatých faktúrach, bločkoch, iných dokladoch a v koši. Chyba dotazu
 * (napr. chýbajúci stĺpec pred migráciou) nahratie nezablokuje.
 */
export async function najdiRovnakySubor(
  sb: Klient,
  companyId: string,
  hash: string,
): Promise<VysledokDuplicity> {
  const dotaz = async (p: () => PromiseLike<{ data: unknown; error: unknown }>) => {
    try {
      const { data, error } = await p();
      return error ? [] : ((data ?? []) as Record<string, any>[]);
    } catch {
      return [];
    }
  };
  const [nespracovane, prijate, blocky, ostatne, kos] = await Promise.all([
    dotaz(() =>
      sb
        .from("nespracovane_doklady")
        .select("id, created_at, udaje")
        .eq("company_id", companyId)
        .eq("subor_hash", hash)
        .limit(5),
    ),
    dotaz(() =>
      sb
        .from("purchase_invoices")
        .select("id, invoice_number, supplier_name, nahrane_at, created_at, deleted_at")
        .eq("company_id", companyId)
        .eq("subor_hash", hash)
        .limit(5),
    ),
    dotaz(() =>
      sb
        .from("expense_documents")
        .select("id, document_number, supplier_name, nahrane_at, created_at")
        .eq("company_id", companyId)
        .eq("subor_hash", hash)
        .limit(5),
    ),
    dotaz(() =>
      sb
        .from("other_documents")
        .select("id, subject, sender, nahrane_at, created_at")
        .eq("company_id", companyId)
        .eq("subor_hash", hash)
        .limit(5),
    ),
    dotaz(() =>
      sb
        .from("kos_dokladov")
        .select("id")
        .eq("company_id", companyId)
        .eq("zaznam->>subor_hash", hash)
        .limit(1),
    ),
  ]);
  const kandidati: KandidatDuplicity[] = [
    ...nespracovane.map((r) => ({
      agenda: "nespracovany" as const,
      id: r.id,
      cislo: s(r.udaje?.cislo),
      partner: s(r.udaje?.dodavatel?.nazov),
      nahrane: s(r.created_at),
    })),
    ...prijate.map((r) => ({
      agenda: "prijata" as const,
      id: r.id,
      cislo: s(r.invoice_number),
      partner: s(r.supplier_name),
      nahrane: s(r.nahrane_at ?? r.created_at),
      vKosi: Boolean(r.deleted_at),
    })),
    ...blocky.map((r) => ({
      agenda: "blocek" as const,
      id: r.id,
      cislo: s(r.document_number),
      partner: s(r.supplier_name),
      nahrane: s(r.nahrane_at ?? r.created_at),
    })),
    ...ostatne.map((r) => ({
      agenda: "ostatny" as const,
      id: r.id,
      cislo: s(r.subject),
      partner: s(r.sender),
      nahrane: s(r.nahrane_at ?? r.created_at),
    })),
    ...kos.map((r) => ({
      agenda: "nespracovany" as const,
      id: r.id,
      cislo: null,
      partner: null,
      nahrane: null,
      vKosi: true,
    })),
  ];
  return vyberDuplicitu(kandidati);
}
