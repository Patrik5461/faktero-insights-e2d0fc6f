/*
  Kontrola pred odovzdaním a rozdiely oproti Pohode — serverová časť.

  Číta prihláseným klientom (RLS). Nič nezapisuje: odkazy na skeny sa pri
  skladaní XML vypnú, aby kontrola nezakladala tokeny.
*/

import { pohodaPrekazka, buildPohodaInvoiceXml, buildPohodaExpensesXml } from "./export.server";
import {
  nastaveniaDokladovPohody,
  nastaveniaFaktur,
  pripravFaktury,
} from "./export-priprava.server";
import { prekazkaDokladu } from "./pohoda-kontrola";
import { poliaDokladovXml, rozdielyPoli, type RozdielPola } from "./pohoda-rozdiely";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import { vsetkoAkoData } from "./strankovanie";

type Klient = any;
type Riadok = Record<string, any>;
export type DruhDokladu = "faktura" | "prijata" | "doklad";

export type ZastavenyDoklad = { druh: DruhDokladu; id: string; cislo: string; dovod: string };

/** Firma bez odkazov na skeny — kontrola nemá zakladať tokeny. */
const bezOdkazov = (company: Riadok) => ({
  ...company,
  pohoda_odkaz_na_doklady: false,
  pohoda_odkaz_na_pdf: false,
});

async function firma(supabase: Klient, companyId: string): Promise<Riadok> {
  const { data, error } = await supabase.from("companies").select("*").eq("id", companyId).single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Firma nenájdená");
  return data;
}

/** Ešte neodovzdané doklady, ktoré by kontrola pred odovzdaním zastavila. */
export async function zastaveneDoklady(
  supabase: Klient,
  companyId: string,
  /** Od dátumu vystavenia (predvolene 4 mesiace dozadu — to, čo ešte čaká na odovzdanie). */
  od?: string | null,
): Promise<ZastavenyDoklad[]> {
  const company = await firma(supabase, companyId);
  const odDna = od || new Date(Date.now() - 122 * 86400000).toISOString().slice(0, 10);
  const out: ZastavenyDoklad[] = [];

  const [faktury, prijate, doklady] = await Promise.all([
    vsetkoAkoData((z, k) =>
      supabase
        .from("invoices")
        .select("*")
        .eq("company_id", companyId)
        .is("exported_at", null)
        .gte("issue_date", odDna)
        .is("deleted_at", null)
        .not("status", "in", "(draft,cancelled)")
        .order("id")
        .range(z, k),
    ),
    vsetkoAkoData((z, k) =>
      supabase
        .from("purchase_invoices")
        .select("*")
        .eq("company_id", companyId)
        .is("exported_at", null)
        .gte("issue_date", odDna)
        .is("deleted_at", null)
        .eq("type", "regular")
        .not("status", "in", "(draft,cancelled)")
        .order("id")
        .range(z, k),
    ),
    vsetkoAkoData((z, k) =>
      supabase
        .from("expense_documents")
        .select("*")
        .eq("company_id", companyId)
        .is("exported_at", null)
        .gte("issue_date", odDna)
        .eq("status", "processed")
        .order("id")
        .range(z, k),
    ),
  ]);

  if (faktury.data?.length) {
    const { bundle } = await pripravFaktury(supabase, companyId, faktury.data);
    const nast = nastaveniaFaktur(company);
    for (const { invoice, items } of bundle) {
      const dovod = pohodaPrekazka(invoice as any, company as any, {
        items: items as any,
        nastavenia: nast,
      });
      if (dovod)
        out.push({ druh: "faktura", id: invoice.id, cislo: invoice.invoice_number, dovod });
    }
  }
  const vsetkyDoklady = [...(doklady.data ?? []), ...(prijate.data ?? []).map(prijataAkoDoklad)];
  if (vsetkyDoklady.length) {
    const nast = await nastaveniaDokladovPohody(supabase, bezOdkazov(company), vsetkyDoklady);
    for (const p of prijate.data ?? []) {
      const dovod = prekazkaDokladu(prijataAkoDoklad(p), company, nast as any);
      if (dovod) out.push({ druh: "prijata", id: p.id, cislo: p.invoice_number, dovod });
    }
    for (const d of doklady.data ?? []) {
      const dovod = prekazkaDokladu(d, company, nast as any);
      if (dovod) out.push({ druh: "doklad", id: d.id, cislo: d.document_number || "", dovod });
    }
  }
  return out;
}

export type RozdielDokladu = {
  druh: DruhDokladu;
  id: string;
  cislo: string;
  partner: string | null;
  odoslane: string | null;
  /** Doklad je vo Fakteri zmazaný, v Pohode ostal. */
  zmazany: boolean;
  /** Dnes by ho kontrola do Pohody nepustila. */
  dovod: string | null;
  rozdiely: RozdielPola[];
};

/** Strop dokladov jedného druhu — porovnanie má zbehnúť pod 30 s. */
export const STROP_POROVNANIA = 200;

/**
 * Odovzdané doklady, ktorých dnešné XML sa líši od posledného odoslaného.
 * Doklady bez uloženého XML (prijaté pred 23. 10. 2026) sa len spočítajú.
 */
export async function rozdielyOprotiPohode(
  supabase: Klient,
  companyId: string,
): Promise<{ doklady: RozdielDokladu[]; skontrolovanych: number; bezXml: number }> {
  const company = await firma(supabase, companyId);
  const out: RozdielDokladu[] = [];
  let skontrolovanych = 0;
  let bezXml = 0;
  const subory = new Map<string, Record<string, Record<string, string>>>();
  const suborJobu = async (jobIds: string[]) => {
    const chybaju = [...new Set(jobIds.filter((j) => j && !subory.has(j)))];
    for (let i = 0; i < chybaju.length; i += 20) {
      const { data } = await supabase
        .from("export_jobs")
        .select("id, file_content, format")
        .in("id", chybaju.slice(i, i + 20));
      for (const j of data ?? [])
        subory.set(
          j.id,
          j.format === "pohoda_xml" ? poliaDokladovXml(String(j.file_content ?? "")) : {},
        );
    }
  };

  /* ---------------------------------------------------- vydané faktúry */
  const { data: faktury } = await supabase
    // aj-zmazane: odovzdaný a potom zmazaný doklad je rozdiel voči Pohode, ktorý treba ukázať
    .from("invoices")
    .select("*")
    .eq("company_id", companyId)
    .not("exported_at", "is", null)
    .order("exported_at", { ascending: false })
    .limit(STROP_POROVNANIA);
  if (faktury?.length) {
    const ids = faktury.map((f: Riadok) => f.id);
    const { data: logy } = await supabase
      .from("export_logs")
      .select("invoice_id, export_job_id, created_at, status")
      .in("invoice_id", ids)
      .eq("status", "ok")
      .order("created_at", { ascending: false });
    const posledny = new Map<string, Riadok>();
    for (const l of logy ?? []) if (!posledny.has(l.invoice_id)) posledny.set(l.invoice_id, l);
    await suborJobu([...posledny.values()].map((l) => l.export_job_id));
    const { bundle, zalohy } = await pripravFaktury(supabase, companyId, faktury);
    const nast = nastaveniaFaktur(company);
    for (const { invoice, items } of bundle) {
      const log = posledny.get(invoice.id);
      const odoslane = log ? subory.get(log.export_job_id)?.[invoice.id] : undefined;
      if (!odoslane) {
        bezXml++;
        continue;
      }
      skontrolovanych++;
      const dovod = pohodaPrekazka(invoice as any, company as any, {
        items: items as any,
        nastavenia: nast,
      });
      const xml = dovod
        ? ""
        : buildPohodaInvoiceXml({
            company: bezOdkazov(company),
            invoices: [{ invoice, items }] as any,
            nastavenia: nast,
            zalohy,
          });
      const teraz = xml ? (poliaDokladovXml(xml)[invoice.id] ?? {}) : {};
      const rozdiely = dovod ? [] : rozdielyPoli(odoslane, teraz);
      if (rozdiely.length || dovod || invoice.deleted_at)
        out.push({
          druh: "faktura",
          id: invoice.id,
          cislo: invoice.invoice_number,
          partner: invoice.customer_name ?? null,
          odoslane: log?.created_at ?? null,
          zmazany: Boolean(invoice.deleted_at),
          dovod: invoice.deleted_at ? null : dovod,
          rozdiely,
        });
    }
  }

  /* -------------------------------------- prijaté faktúry a bločky */
  const [{ data: prijate }, { data: doklady }] = await Promise.all([
    supabase
      // aj-zmazane: odovzdaný a potom zmazaný doklad je rozdiel voči Pohode, ktorý treba ukázať
      .from("purchase_invoices")
      .select("*")
      .eq("company_id", companyId)
      .not("exported_at", "is", null)
      .order("exported_at", { ascending: false })
      .limit(STROP_POROVNANIA),
    supabase
      .from("expense_documents")
      .select("*")
      .eq("company_id", companyId)
      .not("exported_at", "is", null)
      .order("exported_at", { ascending: false })
      .limit(STROP_POROVNANIA),
  ]);
  const vsetky = [
    ...(prijate ?? []).map((p: Riadok) => ({
      druh: "prijata" as const,
      riadok: p,
      doklad: prijataAkoDoklad(p),
    })),
    ...(doklady ?? []).map((d: Riadok) => ({ druh: "doklad" as const, riadok: d, doklad: d })),
  ];
  if (vsetky.length) {
    await suborJobu(vsetky.map((x) => x.riadok.export_job_id).filter(Boolean));
    const nast = await nastaveniaDokladovPohody(
      supabase,
      bezOdkazov(company),
      vsetky.map((x) => x.doklad),
    );
    for (const x of vsetky) {
      const odoslane = x.riadok.export_job_id
        ? subory.get(x.riadok.export_job_id)?.[x.riadok.id]
        : undefined;
      if (!odoslane) {
        bezXml++;
        continue;
      }
      skontrolovanych++;
      const dovod = prekazkaDokladu(x.doklad, company, nast as any);
      const xml = dovod
        ? ""
        : buildPohodaExpensesXml({
            company: bezOdkazov(company),
            doklady: [x.doklad],
            nastavenia: nast,
          });
      const teraz = xml ? (poliaDokladovXml(xml)[x.riadok.id] ?? {}) : {};
      const rozdiely = dovod ? [] : rozdielyPoli(odoslane, teraz);
      if (rozdiely.length || dovod || x.riadok.deleted_at)
        out.push({
          druh: x.druh,
          id: x.riadok.id,
          cislo: x.druh === "prijata" ? x.riadok.invoice_number : x.riadok.document_number || "",
          partner: x.riadok.supplier_name ?? null,
          odoslane: x.riadok.exported_at ?? null,
          zmazany: Boolean(x.riadok.deleted_at),
          dovod: x.riadok.deleted_at ? null : dovod,
          rozdiely,
        });
    }
  }
  return { doklady: out, skontrolovanych, bezXml };
}
