import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Prečítanie pokladničného dokladu (bločku).
 *
 * Dve cesty, v tomto poradí:
 *
 * 1. **QR kód** — v ňom je identifikátor, pod ktorým Finančná správa vydá celý
 *    doklad tak, ako je zaevidovaný: predajca, IČO, dátum, sumy aj položky.
 *    Nič sa nehádá a čísla sedia na cent.
 * 2. **Fotka** — keď QR na doklade nie je, nedá sa prečítať, alebo doklad ešte
 *    nie je zaevidovaný. Vtedy sa údaje vyčítajú z obrázka. Je to odhad, preto
 *    to stránka aj takto pomenuje.
 *
 * Skener predtým vedel len druhú cestu a o QR kóde na bločku nevedel nič.
 */

export type BlocekPolozka = {
  name: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  total?: number;
};

export type BlocekVysledok = {
  zdroj: "ekasa" | "qr" | "foto" | "nic";
  overeny: boolean;
  /** Prečo sa nepodarilo prečítať z Finančnej správy — nech to netreba hádať. */
  poznamka?: string;
  supplier?: string;
  supplier_ico?: string;
  supplier_dic?: string;
  supplier_ic_dph?: string;
  supplier_address?: string;
  total?: number;
  vat_amount?: number;
  vat_rate?: number;
  currency?: string;
  date?: string;
  document_number?: string;
  cash_register?: string;
  uid?: string;
  items: BlocekPolozka[];
};

const Vstup = z.object({
  qr: z.string().max(4000).optional(),
  image_data_url: z.string().max(12_000_000).optional(),
});

/** Najčastejšia sadzba z položiek — do hlavičky dokladu treba jednu. */
function prevazujucaSadzba(items: BlocekPolozka[]): number | undefined {
  if (!items.length) return undefined;
  const podla = new Map<number, number>();
  for (const p of items) podla.set(p.vat_rate, (podla.get(p.vat_rate) ?? 0) + (p.total ?? 0));
  return [...podla.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export const nacitajBlocekFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Vstup.parse(d))
  .handler(async ({ data }): Promise<BlocekVysledok> => {
    let poznamka: string | undefined;

    if (data.qr?.trim()) {
      const { processEkasaQr } = await import("./ekasa-decoder.server");
      const r = await processEkasaQr(data.qr.trim());
      if (r.ok && r.source === "ekasa") {
        const d = r.data;
        const items: BlocekPolozka[] = d.polozky.map((p) => ({
          name: p.name,
          quantity: p.quantity,
          unit_price: p.unit_price,
          vat_rate: p.vat_rate,
          total: p.total,
        }));
        return {
          zdroj: "ekasa",
          overeny: true,
          supplier: d.dodavatel,
          supplier_ico: d.ico,
          supplier_dic: d.dic,
          supplier_ic_dph: d.ic_dph,
          supplier_address: d.adresa,
          total: d.suma,
          vat_amount: d.dph,
          vat_rate: prevazujucaSadzba(items),
          currency: d.mena ?? "EUR",
          date: d.datum,
          document_number: d.cisloDokladu,
          cash_register: d.kodPokladnice,
          uid: d.uid,
          items,
        };
      }

      if (r.ok) {
        // QR sa prečítal, ale doklad Finančná správa nevydala. To, čo je priamo
        // v kóde, je aj tak lepšie než nič — a fotka to nižšie ešte doplní.
        const d = r.data;
        const zQr: BlocekVysledok = {
          zdroj: "qr",
          overeny: false,
          poznamka: "Doklad sa vo Finančnej správe nenašiel — údaje sú len z QR kódu.",
          supplier_ico: d.ico,
          supplier_ic_dph: d.ic_dph,
          total: d.suma,
          vat_amount: d.dph,
          currency: d.mena ?? "EUR",
          date: d.datum,
          document_number: d.cisloDokladu,
          cash_register: d.kodPokladnice,
          uid: d.uid,
          items: d.polozky.map((p) => ({
            name: p.name,
            quantity: p.quantity,
            unit_price: p.unit_price,
            vat_rate: p.vat_rate,
            total: p.total,
          })),
        };
        // Keď z QR vypadlo niečo použiteľné, netreba už otravovať OCR.
        if (zQr.total != null || zQr.items.length > 0) return zQr;
        // Inak sa ide na fotku — a poznámka to musí povedať tak, aby si
        // neodporovala s hlavičkou „odhadnuté z fotky".
        poznamka = "Doklad sa vo Finančnej správe nenašiel, údaje sú prečítané z fotky.";
      } else {
        poznamka = "QR kód sa nepodarilo prečítať, údaje sú prečítané z fotky.";
      }
    }

    if (!data.image_data_url) {
      return {
        zdroj: "nic",
        overeny: false,
        poznamka: poznamka ?? "Nebolo z čoho čítať — chýba QR kód aj fotka.",
        items: [],
      };
    }

    const { ocrBlocek } = await import("./blocek-ocr.server");
    const ocr = await ocrBlocek(data.image_data_url);
    if (!ocr) {
      return {
        zdroj: "nic",
        overeny: false,
        poznamka:
          poznamka ??
          "Z fotky sa nepodarilo prečítať nič. Skúste doklad odfotiť zhora, celý a pri lepšom svetle.",
        items: [],
      };
    }

    const items: BlocekPolozka[] = (ocr.items ?? []).map((p: any) => ({
      name: String(p?.name ?? ""),
      quantity: Number(p?.quantity) || 1,
      unit_price: Number(p?.unit_price) || 0,
      vat_rate: Number(p?.vat_rate) || 0,
    }));

    return {
      zdroj: "foto",
      overeny: false,
      poznamka,
      supplier: ocr.supplier ?? undefined,
      supplier_ico: ocr.ico ?? undefined,
      supplier_ic_dph: ocr.ic_dph ?? undefined,
      total: ocr.total ?? undefined,
      vat_amount: ocr.vat_amount ?? undefined,
      vat_rate: ocr.vat_rate ?? prevazujucaSadzba(items),
      currency: ocr.currency ?? "EUR",
      date: ocr.date ?? undefined,
      document_number: ocr.document_number ?? undefined,
      items,
    };
  });
