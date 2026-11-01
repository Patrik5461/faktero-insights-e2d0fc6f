/**
 * Prepis `suhrn_vystavenych_faktur` (migrácia 20261029220245) — súčty pod
 * zoznamom vystavených dokladov po menách a sadzbách. Meny sa nesčítavajú.
 */
import type { DemoDb, Riadok } from "./db";
import { dnes } from "./db";

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export function suhrnVystavenychFaktur(a: Record<string, any>, db: DemoDb) {
  const t =
    String(a.p_hladanie ?? "")
      .replace(/[%_,]/g, "")
      .trim()
      .toLowerCase() || null;
  const podla = (i: Riadok) =>
    a.p_podla === "dodanie"
      ? (i.delivery_date ?? i.issue_date)
      : a.p_podla === "splatnost"
        ? i.due_date
        : i.issue_date;
  const upomienky = new Set(
    db
      .tabulka("invoice_reminders")
      .filter((r) => r.status === "sent")
      .map((r) => r.invoice_id),
  );
  const vybrane = db.tabulka("invoices").filter((i) => {
    if (i.company_id !== a.p_company_id || i.deleted_at) return false;
    if (a.p_ids && !a.p_ids.includes(i.id)) return false;
    if (a.p_typy && !a.p_typy.includes(i.type)) return false;
    if (a.p_status && i.status !== a.p_status) return false;
    if (
      t &&
      ![i.invoice_number, i.customer_name, i.customer_ico].some((x) =>
        String(x ?? "")
          .toLowerCase()
          .includes(t),
      )
    )
      return false;
    if (a.p_od && !(podla(i) >= a.p_od)) return false;
    if (a.p_do && !(podla(i) <= a.p_do)) return false;
    if (a.p_stav) {
      if (a.p_stav === "_bez" ? i.stav_id != null : String(i.stav_id) !== a.p_stav) return false;
    }
    if (a.p_stitok && !(i.stitky ?? []).includes(a.p_stitok)) return false;
    if (a.p_export === "ano" && !i.exported_at) return false;
    if (a.p_export === "nie" && (i.exported_at || ["draft", "cancelled"].includes(i.status)))
      return false;
    if (
      a.p_neuhradene &&
      (["draft", "cancelled", "paid"].includes(i.status) ||
        ["proforma", "advance_payment", "credit_note"].includes(i.type) ||
        i.paid_at)
    )
      return false;
    if (
      (a.p_po_splatnosti || a.p_bez_upomienky) &&
      !(["issued", "sent"].includes(i.status) && i.due_date < dnes() && !i.paid_at)
    )
      return false;
    if (a.p_bez_upomienky && upomienky.has(i.id)) return false;
    return true;
  });
  const typy: string[] | null = a.p_typy ?? null;
  const zap = vybrane.filter(
    (v) =>
      v.status !== "cancelled" &&
      (v.status !== "draft" || a.p_status === "draft") &&
      (!["proforma", "advance_payment"].includes(v.type) ||
        (typy?.length === 1 && typy[0] === v.type)),
  );
  const polozky = db.tabulka("invoice_items");
  const meny = new Map<
    string,
    {
      pocet: number;
      zaklad: number;
      dph: number;
      celkom: number;
      sadzby: Map<string, { sadzba: number | null; pdp: boolean; zaklad: number; dph: number }>;
    }
  >();
  for (const z of zap) {
    const mena = String(z.currency || "EUR").toUpperCase();
    const zn = z.type === "credit_note" && Number(z.total) > 0 ? -1 : 1;
    const m = meny.get(mena) ?? { pocet: 0, zaklad: 0, dph: 0, celkom: 0, sadzby: new Map() };
    meny.set(mena, m);
    m.pocet++;
    m.zaklad += zn * Number(z.subtotal || 0);
    m.dph += zn * Number(z.vat_total || 0);
    m.celkom += zn * Number(z.total || 0);
    const pdp = !!z.reverse_charge;
    const its = polozky.filter((p) => p.invoice_id === z.id);
    const pridaj = (sadzba: number | null, zaklad: number, dph: number) => {
      const jePdp = pdp && sadzba == null;
      const k = `${jePdp}:${sadzba}`;
      const s = m.sadzby.get(k) ?? { sadzba, pdp: jePdp, zaklad: 0, dph: 0 };
      s.zaklad += zaklad;
      s.dph += dph;
      m.sadzby.set(k, s);
    };
    if (!its.length) pridaj(null, zn * Number(z.subtotal || 0), zn * Number(z.vat_total || 0));
    else {
      const sz = its.reduce((s, p) => s + Number(p.subtotal || 0), 0);
      const sd = its.reduce((s, p) => s + Number(p.vat_amount || 0), 0);
      const skup = new Map<string, { sadzba: number | null; z: number; d: number }>();
      for (const p of its) {
        const sadzba = pdp ? null : Number(p.vat_rate);
        const g = skup.get(String(sadzba)) ?? { sadzba, z: 0, d: 0 };
        g.z += Number(p.subtotal || 0);
        g.d += Number(p.vat_amount || 0);
        skup.set(String(sadzba), g);
      }
      for (const g of skup.values()) {
        pridaj(
          g.sadzba,
          zn * (sz !== 0 ? (g.z * Number(z.subtotal || 0)) / sz : g.z),
          zn * (sd !== 0 ? (g.d * Number(z.vat_total || 0)) / sd : g.d),
        );
      }
    }
  }
  return {
    pocet: vybrane.length,
    mimo: vybrane.length - zap.length,
    meny: [...meny.entries()]
      .sort(
        (x, y) =>
          (x[0] === "EUR" ? 0 : 1) - (y[0] === "EUR" ? 0 : 1) ||
          y[1].pocet - x[1].pocet ||
          x[0].localeCompare(y[0]),
      )
      .map(([mena, m]) => ({
        mena,
        pocet: m.pocet,
        zaklad: r2(m.zaklad),
        dph: r2(m.dph),
        celkom: r2(m.celkom),
        sadzby: [...m.sadzby.values()]
          .sort((x, y) => Number(x.pdp) - Number(y.pdp) || (y.sadzba ?? -1) - (x.sadzba ?? -1))
          .map((s) => ({
            sadzba: s.sadzba,
            pdp: s.pdp,
            zaklad: r2(s.zaklad),
            dph: r2(s.dph),
            celkom: r2(s.zaklad + s.dph),
          })),
      })),
  };
}

/** Prepis `uloz_upravu_faktury` (migrácia 20261031091035) — len v pamäti. */
export function ulozUpravuFaktury(a: Record<string, any>, db: DemoDb) {
  const f = db.tabulka("invoices").find((i) => i.id === a.p_id);
  if (!f) throw Object.assign(new Error("Faktúra sa nenašla."), { kod: "P0002" });
  const hlavicka = (a.p_hlavicka ?? {}) as Riadok;
  for (const [k, v] of Object.entries(hlavicka)) {
    if (["id", "company_id", "created_at", "updated_at"].includes(k)) continue;
    f[k] = v;
  }
  f.updated_at = new Date().toISOString();
  const polozky = db.tabulka("invoice_items");
  const zostava = polozky.filter((p) => p.invoice_id !== a.p_id);
  polozky.length = 0;
  polozky.push(...zostava);
  db.vloz(
    "invoice_items",
    ((a.p_polozky ?? []) as Riadok[]).map((p) => {
      const { id: _id, created_at: _c, ...zvysok } = p;
      return { ...zvysok, invoice_id: a.p_id };
    }),
  );
  console.info("[demo] RPC uloz_upravu_faktury — uložené len v pamäti");
  return f.updated_at;
}
