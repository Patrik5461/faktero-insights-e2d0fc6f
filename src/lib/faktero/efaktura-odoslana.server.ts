import { prveOdoslanie } from "./efaktura-odoslana";

/** Ktoré z faktúr už odišli ako eFaktúra — id faktúry → čas prvého odoslania. */
export async function efakturaOdoslane(
  supabase: any,
  invoiceIds: string[],
): Promise<Record<string, string>> {
  if (!invoiceIds.length) return {};
  const { riadkyPreIds } = await import("./strankovanie");
  const dokumenty = await riadkyPreIds<any>(invoiceIds, (kus, zac, kon) =>
    supabase
      .from("efaktura_documents")
      .select("id, invoice_id")
      .in("invoice_id", kus)
      .order("id")
      .range(zac, kon),
  );
  if (!dokumenty.length) return {};
  const dorucenia = await riadkyPreIds<any>(
    dokumenty.map((d: any) => d.id),
    (kus, zac, kon) =>
      supabase
        .from("efaktura_deliveries")
        .select("document_id, status, created_at")
        .in("document_id", kus)
        .order("created_at")
        .range(zac, kon),
  );
  return prveOdoslanie(dokumenty, dorucenia);
}
