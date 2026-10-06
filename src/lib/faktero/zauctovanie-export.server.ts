/*
  Načítanie dokladov na zaúčtovanie pre exporty mimo Pohody (Omega, Money S3,
  ABRA Flexi, súpiska CSV). Číta sa cez klienta prihláseného používateľa —
  RLS pustí len doklady jeho firmy.
*/

import {
  blocekNaUctovanie,
  prijataNaUctovanie,
  vystavenaNaUctovanie,
  type AgendaUctovania,
  type DokladUctovania,
  type KodUctovania,
  type NastaveniaUctovania,
} from "./zauctovanie-export";

type Klient = any;

/** Predvolené kódy a voľby firmy (rovnaké stĺpce, aké používa Pohoda). */
export async function nastaveniaUctovania(
  supabase: Klient,
  company: Record<string, any>,
  doklady: Record<string, any>[],
): Promise<NastaveniaUctovania> {
  const { kodyPodlaKategorie, pomeryPredkontacii } = await import("./predkontacie.server");
  const jobIds = [...new Set(doklady.map((d) => d.job_id).filter(Boolean))];
  let zakazkyDokladov: Record<string, string> = {};
  if (jobIds.length) {
    const { data } = await supabase.from("jobs").select("id, job_number").in("id", jobIds);
    zakazkyDokladov = Object.fromEntries(
      (data ?? [])
        .filter((j: any) => j.job_number)
        .map((j: any) => [String(j.id), String(j.job_number)]),
    );
  }
  return {
    predkontacia: company.pohoda_predkontacia,
    predkontaciaZaloha: company.pohoda_predkontacia_zaloha,
    predkontaciaDobropis: company.pohoda_predkontacia_dobropis,
    clenenieDph: company.pohoda_clenenie_dph,
    clenenieDphPdp: company.pohoda_clenenie_dph_pdp,
    predkontaciaPrijata: company.pohoda_predkontacia_prijata,
    clenenieDphPrijata: company.pohoda_clenenie_dph_prijata,
    predkontaciaDoklady: company.pohoda_predkontacia_doklady,
    clenenieDphDoklady: company.pohoda_clenenie_dph_doklady,
    predkontaciaPokladna: company.pohoda_predkontacia_pokladna,
    podlaKategorie: (await kodyPodlaKategorie(
      supabase,
      company.id,
    )) as NastaveniaUctovania["podlaKategorie"],
    pomeryPredkontacii: await pomeryPredkontacii(supabase, company.id),
    blockyPodlaPlatby: company.pohoda_blocky_agenda === "podla_platby",
    stredisko: company.pohoda_stredisko,
    radPrijate: company.pohoda_rad_prijate,
    radDoklady: company.pohoda_rad_doklady,
    radPokladna: company.pohoda_rad_pokladna,
    radInterne: company.pohoda_rad_interne,
    pokladna: company.pohoda_pokladna,
    zamknuteDo: company.locked_until ?? null,
    zakazkyDokladov,
  };
}

/** Číselník predkontácií s účtami — kód → MD/Dal. */
export async function kodyUctovania(
  supabase: Klient,
  companyId: string,
): Promise<Record<string, KodUctovania>> {
  const { data } = await supabase
    .from("predkontacie")
    .select("kod, popis, ucet_md, ucet_d")
    .eq("company_id", companyId)
    .eq("druh", "predkontacia")
    .eq("aktivne", true);
  return Object.fromEntries(
    (data ?? []).map((r: any) => [
      String(r.kod),
      {
        kod: String(r.kod),
        popis: r.popis ?? null,
        ucetMd: r.ucet_md ?? null,
        ucetD: r.ucet_d ?? null,
      },
    ]),
  );
}

/**
 * Doklady jednej agendy pripravené na zaúčtovanie. Zmazané a nezapočítateľné
 * (prijaté zálohy bez dane, koncepty) sa vynechajú; schvaľovanie stráži volajúci.
 */
export async function nacitajNaUctovanie(
  supabase: Klient,
  company: Record<string, any>,
  agenda: AgendaUctovania,
  ids: string[],
): Promise<DokladUctovania[]> {
  if (!ids.length) return [];
  if (agenda === "vystavena") {
    const { data: invs, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("company_id", company.id)
      .in("id", ids)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    const rows = (invs ?? []).filter((i: any) => i.status !== "draft");
    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .in(
        "invoice_id",
        rows.map((i: any) => i.id),
      )
      .order("position");
    // Dobropis nesie len id opravovanej faktúry — do účtovníctva ide jej číslo.
    const opr = [...new Set(rows.map((i: any) => i.opravuje_fakturu_id).filter(Boolean))];
    const cisla: Record<string, string> = {};
    if (opr.length) {
      const { data } = await supabase.from("invoices").select("id, invoice_number").in("id", opr);
      for (const r of data ?? []) cisla[r.id] = r.invoice_number;
    }
    const nast = await nastaveniaUctovania(supabase, company, rows);
    return rows.map((inv: any) =>
      vystavenaNaUctovanie(
        {
          ...inv,
          _opravujeCislo: inv.opravuje_fakturu_id ? (cisla[inv.opravuje_fakturu_id] ?? null) : null,
        },
        (items ?? []).filter((it: any) => it.invoice_id === inv.id),
        nast,
      ),
    );
  }
  if (agenda === "prijata") {
    const { data, error } = await supabase
      .from("purchase_invoices")
      .select("*")
      .eq("company_id", company.id)
      .in("id", ids)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const nast = await nastaveniaUctovania(supabase, company, rows);
    return rows.map((p: any) => prijataNaUctovanie(p, nast));
  }
  const { data, error } = await supabase
    .from("expense_documents")
    .select("*")
    .eq("company_id", company.id)
    .in("id", ids);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const nast = await nastaveniaUctovania(supabase, company, rows);
  return rows.map((d: any) => blocekNaUctovanie(d, nast));
}
