/**
 * Doklady za zdaňovacie obdobie pre výkazy k DPH.
 *
 * Zbiera sa tu len to, čo výkazy potrebujú, a prekladá sa to na tvar z
 * `dph-vykazy.ts`. Doklad v cudzej mene sa nezamlčí — do výkazu by vošiel
 * v cudzej sume, čo je horšie než chýbajúci riadok, takže sa vypíše ako výtka.
 */

import {
  hraniceObdobia,
  odvodRezimPrijatej,
  riadokZoSum,
  type Obdobie,
  type PrijataFaktura,
  type PrijatyDoklad,
  type SadzbovyRiadok,
  type Vstup,
  type Vytka,
  type VystavenaFaktura,
} from "./dph-vykazy";

type Klient = {
  from: (t: string) => any;
};

/** Stavy, v ktorých doklad ešte nie je vystavený alebo už je zrušený. */
const NEPLATNE_STAVY = ["draft", "cancelled"];

function riadkyZPoloziek(
  polozky: {
    vat_rate: number | null;
    subtotal?: number | null;
    total?: number | null;
    quantity?: number | null;
    unit_price?: number | null;
  }[],
): SadzbovyRiadok[] {
  const mapa = new Map<number, SadzbovyRiadok>();
  for (const p of polozky) {
    const sadzba = Number(p.vat_rate ?? 0);
    const zaklad =
      p.subtotal != null ? Number(p.subtotal) : Number(p.quantity ?? 0) * Number(p.unit_price ?? 0);
    const dan = (zaklad * sadzba) / 100;
    const s = mapa.get(sadzba) ?? { sadzba, zaklad: 0, dan: 0 };
    s.zaklad += zaklad;
    s.dan += dan;
    mapa.set(sadzba, s);
  }
  return [...mapa.values()].map((s) => ({
    sadzba: s.sadzba,
    zaklad: Math.round(s.zaklad * 100) / 100,
    dan: Math.round(s.dan * 100) / 100,
  }));
}

export async function nacitajVstup(
  supabase: Klient,
  companyId: string,
  obdobie: Obdobie,
): Promise<{ vstup: Vstup; vytky: Vytka[] }> {
  const { od, do: doDna } = hraniceObdobia(obdobie);
  const vytky: Vytka[] = [];

  const [fakturyRes, prijateRes, dokladyRes] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, type, status, issue_date, delivery_date, currency, customer_ic_dph, customer_name, reverse_charge, reverse_charge_type, eu_plnenie, opravuje_fakturu_id, subtotal, vat_total, invoice_items(vat_rate, subtotal, quantity, unit_price)",
      )
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .limit(5000),
    supabase
      .from("purchase_invoices")
      .select(
        "id, invoice_number, supplier_name, supplier_ic_dph, supplier_dic, issue_date, delivery_date, currency, dph_rezim, odpocet, opravuje_cislo, amount_without_vat, vat_amount",
      )
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .limit(5000),
    supabase
      .from("expense_documents")
      .select(
        "id, document_number, supplier_name, supplier_ic_dph, issue_date, currency, vat_rate, net_amount, vat_amount, vat_breakdown, odpocet",
      )
      .eq("company_id", companyId)
      .limit(5000),
  ]);

  const vDobe = (d: string | null | undefined) => {
    const s = String(d ?? "");
    return s >= od && s <= doDna;
  };

  const cisla = new Map<string, string>();
  for (const f of fakturyRes.data ?? []) cisla.set(f.id, f.invoice_number);

  const vystavene: VystavenaFaktura[] = [];
  for (const f of (fakturyRes.data ?? []) as any[]) {
    const den = f.delivery_date || f.issue_date;
    if (!vDobe(den)) continue;
    if (NEPLATNE_STAVY.includes(String(f.status))) continue;
    if (f.currency && f.currency !== "EUR") {
      vytky.push({
        doklad: f.invoice_number,
        text: `Faktúra je v mene ${f.currency}. Do výkazu patria sumy v eurách — prepočítajte ju a sumu opravte ručne.`,
      });
    }
    vystavene.push({
      cislo: String(f.invoice_number),
      typ: String(f.type),
      datumDodania: String(den),
      odberatelIcDph: f.customer_ic_dph,
      odberatelNazov: f.customer_name,
      prenosDane: Boolean(f.reverse_charge),
      prenosTyp: f.reverse_charge_type,
      euPlnenie: f.eu_plnenie,
      opravujeCislo: f.opravuje_fakturu_id ? (cisla.get(f.opravuje_fakturu_id) ?? null) : null,
      riadky: riadkyZPoloziek(f.invoice_items ?? []),
    });
  }

  const prijate: PrijataFaktura[] = [];
  for (const p of (prijateRes.data ?? []) as any[]) {
    const den = p.delivery_date || p.issue_date;
    if (!vDobe(den)) continue;
    if (p.currency && p.currency !== "EUR") {
      vytky.push({
        doklad: p.invoice_number ?? p.supplier_name ?? "prijatá faktúra",
        text: `Prijatá faktúra je v mene ${p.currency}. Do výkazu patria sumy v eurách.`,
      });
    }
    const dan = Number(p.vat_amount ?? 0);
    prijate.push({
      cislo: String(p.invoice_number ?? ""),
      dodavatelNazov: p.supplier_name,
      dodavatelIcDph: p.supplier_ic_dph,
      dodavatelDic: p.supplier_dic,
      datumDodania: String(den),
      rezim: (p.dph_rezim as PrijataFaktura["rezim"]) ?? odvodRezimPrijatej(p.supplier_ic_dph, dan),
      odpocet: p.odpocet !== false,
      opravujeCislo: p.opravuje_cislo,
      riadky: [riadokZoSum(Number(p.amount_without_vat ?? 0), dan, den)],
    });
    if (!p.invoice_number) {
      vytky.push({
        doklad: p.supplier_name ?? "prijatá faktúra",
        text: "Prijatá faktúra nemá číslo — kontrolný výkaz ho vyžaduje.",
      });
    }
  }

  const doklady: PrijatyDoklad[] = [];
  for (const d of (dokladyRes.data ?? []) as any[]) {
    if (!vDobe(d.issue_date)) continue;
    const dan = Number(d.vat_amount ?? 0);
    if (dan === 0) continue;
    const rozpis = Array.isArray(d.vat_breakdown) ? d.vat_breakdown : null;
    const riadky: SadzbovyRiadok[] = rozpis?.length
      ? rozpis.map((r: any) =>
          riadokZoSum(Number(r.base ?? r.zaklad ?? 0), Number(r.vat ?? r.dan ?? 0), d.issue_date),
        )
      : [riadokZoSum(Number(d.net_amount ?? 0), dan, d.issue_date)];
    doklady.push({
      dodavatelNazov: d.supplier_name,
      dodavatelIcDph: d.supplier_ic_dph,
      odpocet: d.odpocet !== false,
      riadky,
    });
  }

  return { vstup: { obdobie, vystavene, prijate, doklady }, vytky };
}
