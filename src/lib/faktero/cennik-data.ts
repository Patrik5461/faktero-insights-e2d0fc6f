/*
  Načítanie cenníka firmy pre export a náhľad importu — v prehliadači cez
  klienta prihláseného používateľa (RLS), po stránkach, lebo PostgREST vráti
  najviac 1 000 riadkov a cenník s piatimi hladinami ich má ľahko 5 000.
*/
import { supabase } from "@/integrations/supabase/client";
import { vsetkyRiadky } from "./strankovanie";
import type { CenaHladiny, ExistujuciProdukt, Hladina } from "./cennik-import";

export type CennikFirmy = {
  produkty: ExistujuciProdukt[];
  hladiny: Hladina[];
  ceny: CenaHladiny[];
};

export async function nacitajCennikFirmy(companyId: string): Promise<CennikFirmy> {
  const [produkty, hladiny, ceny] = await Promise.all([
    vsetkyRiadky((od, po) =>
      supabase
        .from("products")
        .select("id, code, name, unit, unit_price, vat_rate, external_id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("id")
        .range(od, po),
    ),
    vsetkyRiadky((od, po) =>
      supabase
        .from("price_groups")
        .select("id, name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("id")
        .range(od, po),
    ),
    vsetkyRiadky((od, po) =>
      supabase
        .from("product_prices")
        .select("id, product_id, price_group_id, customer_id, unit_price, min_quantity")
        .eq("company_id", companyId)
        .is("customer_id", null)
        .not("price_group_id", "is", null)
        .lte("min_quantity", 1)
        .order("id")
        .range(od, po),
    ),
  ]);
  return {
    produkty: produkty as ExistujuciProdukt[],
    hladiny: hladiny as Hladina[],
    ceny: ceny as CenaHladiny[],
  };
}

export function stiahniBajty(nazov: string, data: BlobPart, mime: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nazov;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const MIME_CSV = "text/csv;charset=utf-8";
