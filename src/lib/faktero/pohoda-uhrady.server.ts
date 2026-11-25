/**
 * Úhrady z Pohody do Faktera (spätný smer mosta, 25. 11.).
 *
 * Faktúra sa spáruje podľa čísla, ktoré dostala v Pohode (`pohoda_cislo`),
 * inak podľa nášho čísla (vydané) alebo čísla dodávateľa + IČO (prijaté).
 * Každá likvidácia z Pohody je jedna úhrada vo Fakteri s identifikátorom
 * `pohoda:<id likvidácie>` — tá istá sa druhýkrát nezapíše. Úhrada sa
 * nezapíše, keď je faktúra vo Fakteri už uhradená inak (banka, ručne) — inak
 * by bola zaplatená dvakrát; vtedy ide len upozornenie.
 */
import type { FakturaZPohody } from "./pohoda-uhrady";

type Klient = any;

export type VysledokUhrad = {
  faktur: number;
  sparovanych: number;
  novychUhrad: number;
  uhradenych: number;
  rozdiely: string[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const bezMedzier = (s: string | null | undefined) => String(s ?? "").replace(/\s/g, "").toLowerCase();

async function najdiVydanu(admin: Klient, companyId: string, f: FakturaZPohody) {
  // Zálohová v Pohode = proforma/advance_payment vo Fakteri; bežná = regular/debit_note.
  const typy = f.zaloha ? ["proforma", "advance_payment"] : ["regular", "debit_note"];
  const stlpce = "id, invoice_number, total, status, paid_at, type, currency";
  // 1) číslo, ktoré faktúre pridelila Pohoda (potvrdenie konektora v export_logs)
  const { data: logy } = await admin
    .from("export_logs")
    .select("invoice_id")
    .eq("company_id", companyId)
    .eq("pohoda_cislo", f.cislo)
    .not("invoice_id", "is", null)
    .limit(5);
  const ids = [...new Set((logy ?? []).map((l: any) => l.invoice_id))];
  if (ids.length === 1) {
    const { data } = await admin.from("invoices").select(stlpce).eq("id", ids[0]).is("deleted_at", null).maybeSingle();
    if (data && typy.includes(data.type)) return data;
  }
  // 2) naše číslo (Pohoda ho prevezme ako numberRequested)
  const { data } = await admin
    .from("invoices")
    .select(stlpce)
    .eq("company_id", companyId)
    .eq("invoice_number", f.cislo)
    .in("type", typy)
    .is("deleted_at", null)
    .limit(2);
  return data?.length === 1 ? data[0] : null;
}

async function najdiPrijatu(admin: Klient, companyId: string, f: FakturaZPohody) {
  const typy = f.zaloha ? ["proforma", "advance_payment"] : ["regular"];
  const { data: podlaPohody } = await admin
    .from("purchase_invoices")
    .select("id, invoice_number, amount_total, status, supplier_ico, currency")
    .eq("company_id", companyId)
    .eq("pohoda_cislo", f.cislo)
    .in("type", typy)
    .is("deleted_at", null)
    .limit(2);
  if (podlaPohody?.length === 1) return podlaPohody[0];
  const cislo = f.povodneCislo || f.vs;
  if (!cislo) return null;
  const { data } = await admin
    .from("purchase_invoices")
    .select("id, invoice_number, amount_total, status, supplier_ico, currency")
    .eq("company_id", companyId)
    .eq("invoice_number", cislo)
    .in("type", typy)
    .is("deleted_at", null)
    .limit(5);
  const ico = bezMedzier(f.ico);
  const kand = (data ?? []).filter((d: any) => !ico || bezMedzier(d.supplier_ico) === ico);
  return kand.length === 1 ? kand[0] : null;
}

export async function zapisUhradyZPohody(
  admin: Klient,
  companyId: string,
  faktury: FakturaZPohody[],
): Promise<VysledokUhrad> {
  const v: VysledokUhrad = { faktur: faktury.length, sparovanych: 0, novychUhrad: 0, uhradenych: 0, rozdiely: [] };
  for (const f of faktury) {
    if (f.druh === "vydana") {
      const inv = await najdiVydanu(admin, companyId, f);
      if (!inv) continue;
      v.sparovanych++;
      const suma = Number(inv.total ?? 0);
      if (f.suma != null && Math.abs(Math.abs(f.suma) - Math.abs(suma)) > 0.05)
        v.rozdiely.push(`Faktúra ${inv.invoice_number}: v Pohode ${f.suma.toFixed(2)}, vo Fakteri ${suma.toFixed(2)}.`);
      if (!f.likvidacie.length || inv.status === "cancelled" || inv.status === "draft") continue;
      const { data: platby } = await admin.from("payments").select("amount, external_id").eq("invoice_id", inv.id);
      const zname = new Set((platby ?? []).map((p: any) => p.external_id).filter(Boolean));
      let zaplatene = r2((platby ?? []).reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0));
      let posledny = "";
      for (const l of f.likvidacie) {
        const ext = `pohoda:${l.id}`;
        if (zname.has(ext)) continue;
        // Faktúra je vo Fakteri už zaplatená inak (banka, ručne) — druhá úhrada by ju zaplatila dvakrát.
        if (zaplatene >= suma - 0.01) {
          v.rozdiely.push(
            `Faktúra ${inv.invoice_number}: úhradu ${l.suma.toFixed(2)} z ${l.datum} má Pohoda, Faktero ju už má zaplatenú inak — nezapísané.`,
          );
          continue;
        }
        const { error } = await admin.from("payments").insert({
          company_id: companyId,
          invoice_id: inv.id,
          amount: Math.min(l.suma, r2(suma - zaplatene)),
          paid_at: l.datum,
          method: "pohoda",
          note: "Úhrada z Pohody",
          external_id: ext,
        });
        if (error) continue;
        v.novychUhrad++;
        zaplatene = r2(zaplatene + Math.min(l.suma, r2(suma - zaplatene)));
        if (l.datum > posledny) posledny = l.datum;
      }
      if (posledny && zaplatene >= suma - 0.01 && inv.status !== "paid") {
        await admin
          .from("invoices")
          .update({ status: "paid", paid_at: new Date(`${posledny}T12:00:00Z`).toISOString() })
          .eq("id", inv.id);
        v.uhradenych++;
      }
    } else {
      const pf = await najdiPrijatu(admin, companyId, f);
      if (!pf) continue;
      v.sparovanych++;
      const suma = Number(pf.amount_total ?? 0);
      if (f.suma != null && Math.abs(Math.abs(f.suma) - Math.abs(suma)) > 0.05)
        v.rozdiely.push(`Prijatá ${pf.invoice_number}: v Pohode ${f.suma.toFixed(2)}, vo Fakteri ${suma.toFixed(2)}.`);
      if (!f.likvidacie.length || pf.status === "cancelled" || pf.status === "draft") continue;
      const { data: platby } = await admin
        .from("purchase_invoice_payments")
        .select("amount, external_id")
        .eq("purchase_invoice_id", pf.id);
      const zname = new Set((platby ?? []).map((p: any) => p.external_id).filter(Boolean));
      let zaplatene = r2((platby ?? []).reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0));
      for (const l of f.likvidacie) {
        const ext = `pohoda:${l.id}`;
        if (zname.has(ext)) continue;
        if (zaplatene >= Math.abs(suma) - 0.01) {
          v.rozdiely.push(
            `Prijatá ${pf.invoice_number}: úhradu ${l.suma.toFixed(2)} z ${l.datum} má Pohoda, Faktero ju už má zaplatenú inak — nezapísané.`,
          );
          continue;
        }
        const castka = Math.min(l.suma, r2(Math.abs(suma) - zaplatene));
        // Stav faktúry prepočíta spúšťač (uhrady_prijatej_zmena) — ako pri banke.
        const { error } = await admin.from("purchase_invoice_payments").insert({
          company_id: companyId,
          purchase_invoice_id: pf.id,
          amount: castka,
          currency: pf.currency || "EUR",
          paid_at: l.datum,
          method: "prevod",
          zdroj: "pohoda",
          note: "Úhrada z Pohody",
          external_id: ext,
        });
        if (error) continue;
        v.novychUhrad++;
        zaplatene = r2(zaplatene + castka);
        if (zaplatene >= Math.abs(suma) - 0.01) v.uhradenych++;
      }
    }
  }
  return v;
}
