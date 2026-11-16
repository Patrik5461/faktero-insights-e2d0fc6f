/*
  Ručne zaúčtovaný bloček sa zároveň spracuje.

  Bloček v Nespracovaných (`status = 'new'`) po zaúčtovaní (predkontácia
  v detaile, hromadne v Nespracovaných alebo v Bločkoch) prejde do stavu
  `processed` — presunie sa do Fakturácia → Prijaté bločky (Doklady → Bločky,
  záložka Spracované). Rovnako ako tlačidlo „Spracovať“ (`nastavStavDokladovFn`)
  to ide len so sumou a dátumom (`daSaSpracovat`); bez nich ostáva zaúčtovaný
  v Nespracovaných a človek sa dozvie prečo.

  Volá sa len zo `zauctujDokladyFn` (ručné zaúčtovanie). Autopilot
  (auto-uctovanie.server.ts) zapisuje sám a stav dokladu nemení.

  Nemení sa odovzdaný (`exported_at`), ručne zamknutý (`locked_at`) ani
  zmazaný doklad — rovnako ako pri zaúčtovaní a jeho zrušení.
*/
import { chybajuceUdaje, daSaSpracovat } from "./doklad-stav";

type Klient = any;

export type VysledokSpracovania = {
  /** Id bločkov, ktoré sa presunuli medzi spracované. */
  spracovane: string[];
  /** Zaúčtované bločky bez sumy alebo dátumu — ostali v Nespracovaných. */
  ostavaju: { id: string; popis: string; dovod: string }[];
};

/** Prečo zaúčtovaný bloček ostal v Nespracovaných. */
export function textNespracovania(chyba: string[]): string {
  const co = chyba.filter((x) => x === "suma" || x === "dátum");
  return `chýba ${co.join(" a ")} — ostáva v Nespracovaných`;
}

export async function spracujZauctovaneBlocky(
  sb: Klient,
  args: { companyId: string; ids: string[]; userId: string },
): Promise<VysledokSpracovania> {
  if (!args.ids.length) return { spracovane: [], ostavaju: [] };
  const { data: riadky, error } = await sb
    .from("expense_documents")
    .select(
      "id, status, document_number, supplier_name, total_amount, issue_date, zauctovane_at, exported_at, locked_at, deleted_at",
    )
    .eq("company_id", args.companyId)
    .in("id", args.ids);
  if (error) throw new Error(error.message);

  const meno = (r: any) => r.document_number || r.supplier_name || "Bloček";
  const naSpracovanie: string[] = [];
  const ostavaju: VysledokSpracovania["ostavaju"] = [];
  for (const r of (riadky ?? []) as any[]) {
    if (r.status !== "new" || !r.zauctovane_at) continue;
    if (r.exported_at || r.locked_at || r.deleted_at) continue;
    if (daSaSpracovat(r)) naSpracovanie.push(r.id);
    else ostavaju.push({ id: r.id, popis: meno(r), dovod: textNespracovania(chybajuceUdaje(r)) });
  }
  if (!naSpracovanie.length) return { spracovane: [], ostavaju };

  const { data: zmenene, error: e2 } = await sb
    .from("expense_documents")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
      processed_by: args.userId,
    })
    .eq("company_id", args.companyId)
    .eq("status", "new")
    .in("id", naSpracovanie)
    .select("id");
  if (e2) throw new Error(e2.message);
  return { spracovane: ((zmenene ?? []) as any[]).map((r) => r.id), ostavaju };
}
