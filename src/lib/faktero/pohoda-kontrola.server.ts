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
import { prekazkaDokladu, varovanieDokladu, varovanieDokladuKPlatbe, varovanieKvVydanej } from "./pohoda-kontrola";
import { varovaniaPrijatejPredExportom } from "./export-varovania";
import { poliaDokladovXml, rozdielyPoli, type RozdielPola } from "./pohoda-rozdiely";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import { vsetkoAkoData } from "./strankovanie";
import { chybajuceSkratky, predkontacieVXml, varovanieSkratky } from "./pohoda-predkontacia";
import type { PohodaNastavenia } from "./export.server";
import { TYPY_PRIJATYCH_DO_EXPORTU } from "./prijaty-danovy-doklad";

type Klient = any;
type Riadok = Record<string, any>;
export type DruhDokladu = "faktura" | "prijata" | "doklad";

export type ZastavenyDoklad = {
  druh: DruhDokladu;
  id: string;
  cislo: string;
  dovod: string;
  /** Len upozornenie — doklad odíde, no v Pohode ho treba skontrolovať. */
  varovanie?: boolean;
};

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

/**
 * Predkontácie dokladu, ktoré sú dvojicou účtov bez skratky v Pohode. Zloží
 * XML bez prekladu (tak, ako by išlo predtým) a pozrie, ktoré kódy mapa
 * nepreloží — rovnaké miesta, z ktorých export predkontáciu naozaj berie.
 */
function varovanieChybajucejSkratky(
  cislo: unknown,
  nast: PohodaNastavenia,
  xml: (n: PohodaNastavenia) => string,
): string | null {
  const mapa = nast.mapaPredkontacii;
  if (!mapa) return null;
  const kody = predkontacieVXml(xml({ ...nast, mapaPredkontacii: null }));
  return varovanieSkratky(cislo, chybajuceSkratky(kody, mapa));
}

/** Ešte neodovzdané doklady so závažnou chybou — konektor ich zastaví, ručný export ich pustí až po potvrdení. */
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
        .in("type", [...TYPY_PRIJATYCH_DO_EXPORTU])
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
    // Kódy tak, ako ich doplní export (bez zápisu — kontrola len číta).
    const doplnene = await (
      await import("./clenenie-vystavenej.server")
    ).zauctovanieNaExport(supabase, companyId, faktury.data, { ulozit: false });
    const { bundle } = await pripravFaktury(supabase, companyId, doplnene);
    const nast: PohodaNastavenia = {
      ...nastaveniaFaktur(company),
      // Skratky predkontácií (mapa z číselníka a nastavení exportu).
      ...(await (await import("./export-nastavenia.server")).doplnkyExportu(supabase, company)),
    };
    for (const { invoice, items } of bundle) {
      const dovod = pohodaPrekazka(invoice as any, company as any, {
        items: items as any,
        nastavenia: nast,
      });
      if (dovod)
        out.push({ druh: "faktura", id: invoice.id, cislo: invoice.invoice_number, dovod });
      else {
        const varovanie =
          varovanieDokladuKPlatbe(invoice, nast as any) ??
          varovanieKvVydanej(invoice, items as any, company as any) ??
          varovanieChybajucejSkratky(invoice.invoice_number, nast, (n) =>
            buildPohodaInvoiceXml({ company: bezOdkazov(company), invoices: [{ invoice, items }] as any, nastavenia: n }),
          );
        if (varovanie)
          out.push({
            druh: "faktura",
            id: invoice.id,
            cislo: invoice.invoice_number,
            dovod: varovanie,
            varovanie: true,
          });
      }
    }
  }
  // Duplicity (ten istý doklad dvakrát) kontrola zastaví ako ostatné prekážky.
  {
    const { oznacDuplicity } = await import("./duplicita-zauctovania.server");
    await oznacDuplicity(supabase, companyId, "prijata", prijate.data ?? []);
    await oznacDuplicity(supabase, companyId, "blocek", doklady.data ?? []);
  }
  const vsetkyDoklady = [...(doklady.data ?? []), ...(prijate.data ?? []).map(prijataAkoDoklad)];
  if (vsetkyDoklady.length) {
    const nast = await nastaveniaDokladovPohody(supabase, bezOdkazov(company), vsetkyDoklady);
    for (const p of prijate.data ?? []) {
      const doklad = prijataAkoDoklad(p);
      /*
        Sadzba DPH, prenesenie bez príznaku, chýbajúca predkontácia
        (export-varovania.ts): ručný export a balík ich ukážu na potvrdenie,
        konektor nemá kto potvrdiť — zaúčtovaný doklad (ten jediný konektor
        posiela) zadrží, preto je medzi závažnými. Pri nezaúčtovanom ostáva
        upozornením.
      */
      const varovaniaPrijatej = varovaniaPrijatejPredExportom(p, company, nast as any);
      const dovod =
        prekazkaDokladu(doklad, company, nast as any) ??
        (p.zauctovane_at ? (varovaniaPrijatej[0] ?? null) : null);
      if (dovod) out.push({ druh: "prijata", id: p.id, cislo: p.invoice_number, dovod });
      else {
        const varovanie =
          varovanieDokladu(doklad, nast as any, company as any) ??
          (varovaniaPrijatej[0] ?? null) ??
          varovanieChybajucejSkratky(p.invoice_number, nast, (n) =>
            buildPohodaExpensesXml({ company: bezOdkazov(company), doklady: [doklad], nastavenia: n }),
          );
        if (varovanie)
          out.push({
            druh: "prijata",
            id: p.id,
            cislo: p.invoice_number,
            dovod: varovanie,
            varovanie: true,
          });
      }
    }
    for (const d of doklady.data ?? []) {
      const dovod = prekazkaDokladu(d, company, nast as any);
      if (dovod) out.push({ druh: "doklad", id: d.id, cislo: d.document_number || "", dovod });
      else {
        const varovanie = varovanieChybajucejSkratky(d.document_number, nast, (n) =>
          buildPohodaExpensesXml({ company: bezOdkazov(company), doklady: [d], nastavenia: n }),
        );
        if (varovanie)
          out.push({ druh: "doklad", id: d.id, cislo: d.document_number || "", dovod: varovanie, varovanie: true });
      }
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
    const nast = {
      ...nastaveniaFaktur(company),
      // Skratky účtov a partneri — inak by sa XML líšilo od odoslaného len preto.
      ...(await (await import("./export-nastavenia.server")).doplnkyExportu(supabase, company)),
    };
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

/* ------------------------------------------------ konektor do POHODY */

export type OdmietnutaPolozka = {
  druh: string;
  id: string;
  cislo: string;
  chyba: string;
  kedy: string | null;
  /** Nepotvrdené do limitu (nie odmietnuté POHODOU). */
  vyprsane: boolean;
};

export type StavKonektora = {
  /** Firma konektor aspoň raz spustila. */
  pouziva: boolean;
  /** Dávky, ktoré čakajú na odpoveď POHODY. */
  cakajuce: { id: string; kedy: string; poloziek: number; vyprsana: boolean }[];
  /** Posledný výsledok je odmietnutie alebo vypršanie — doklad pôjde znova. */
  odmietnute: OdmietnutaPolozka[];
  /** Opravy odovzdaných dokladov, ktoré konektor drží (V13). */
  opravy: import("./pohoda-konektor-potvrdenie.server").DrzanaOprava[];
  /** Opravy, pri ktorých ide najprv storno pôvodného (alebo naň čakajú). */
  opravyCakaju: string[];
  /** V11: neodovzdané doklady staršie ako spodná hranica konektora. */
  starsie: { od: string; faktur: number; prijatych: number; dokladov: number; pokladnicnych: number };
  /**
   * Bankové pohyby (`pohoda_posielat_banku`): koľko čaká vo fronte, koľko je
   * na ceste a koľko POHODA odmietla; účty bez skratky v POHODE. `null` = vypnuté.
   */
  banka?: { cakaju: number; naCeste: number; chyba: number; bezSkratky: string[] } | null;
};

const DRUH_POLOZKY: Record<string, string> = {
  faktura: "Vydaná faktúra",
  prijata: "Prijatá faktúra",
  doklad: "Bloček",
  pokladna: "Pokladničný doklad",
  adresar: "Adresár",
  sklad: "Skladová karta",
  zakazka: "Zákazka",
  pohyb: "Skladový pohyb",
  banka: "Bankový pohyb",
  storno: "Storno faktúry",
  storno_opravy: "Storno pôvodného dokladu",
};

/**
 * Stav konektora pre Kontrolu Pohody: čo čaká na odpoveď, čo POHODA odmietla,
 * ktoré opravy drží a koľko starších dokladov konektor neposiela. Číta
 * prihláseným klientom; bez migrácie `pohoda_konektor_polozky` vráti len to,
 * čo vie bez nej.
 */
export async function stavKonektora(supabase: Klient, companyId: string): Promise<StavKonektora> {
  const { jeVyprsana } = await import("./pohoda-konektor-davka");
  const potvrdenie = await import("./pohoda-konektor-potvrdenie.server");
  const { zaciatokKonektora, cislaVPohode } = await import("./pohoda-konektor.server");
  const teraz = new Date();
  const prazdny: StavKonektora = {
    pouziva: false,
    cakajuce: [],
    odmietnute: [],
    opravy: [],
    opravyCakaju: [],
    starsie: { od: "", faktur: 0, prijatych: 0, dokladov: 0, pokladnicnych: 0 },
  };

  const { data: joby } = await supabase
    .from("export_jobs")
    .select("id, created_at, status")
    .eq("company_id", companyId)
    .eq("file_name", potvrdenie.SUBOR_DAVKY)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!joby?.length) return prazdny;
  const out: StavKonektora = { ...prazdny, pouziva: true };

  // Čakajúce dávky.
  const cakajuceJoby = (joby as Riadok[]).filter((j) => j.status === "cakajuce");
  for (const j of cakajuceJoby) {
    const { count } = await supabase
      .from(potvrdenie.TABULKA_KONEKTORA)
      .select("id", { count: "exact", head: true })
      .eq("export_job_id", j.id)
      .eq("stav", "odoslane");
    out.cakajuce.push({ id: j.id, kedy: j.created_at, poloziek: count ?? 0, vyprsana: jeVyprsana(j.created_at, teraz) });
  }

  // Odmietnuté a vypršané — posledný výsledok záznamu, kým ho nepotvrdí ďalšia dávka.
  const odDna = new Date(teraz.getTime() - 60 * 86400000).toISOString();
  const { data: riadky, error } = await supabase
    .from(potvrdenie.TABULKA_KONEKTORA)
    .select("druh, zaznam_id, stav, chyba, created_at, potvrdene_at, polozka_id")
    .eq("company_id", companyId)
    .neq("druh", "zmazane_v_pohode")
    .gte("created_at", odDna)
    .order("created_at", { ascending: false })
    .limit(3000);
  if (!error) {
    const posledny = new Map<string, Riadok>();
    for (const r of (riadky ?? []) as Riadok[]) {
      const k = `${r.druh}|${r.zaznam_id}`;
      if (!posledny.has(k)) posledny.set(k, r);
    }
    const zle = [...posledny.values()].filter((r) => r.stav === "chyba" || r.stav === "vyprsane");
    const cisla = new Map<string, string>();
    const doTabulky: [string, string, string][] = [
      ["faktura", "invoices", "invoice_number"],
      ["prijata", "purchase_invoices", "invoice_number"],
      ["doklad", "expense_documents", "document_number"],
      ["pokladna", "cash_entries", "entry_number"],
    ];
    const odovzdane = new Set<string>();
    for (const [druh, tab, stlpec] of doTabulky) {
      const ids = zle.filter((r) => r.druh === druh).map((r) => String(r.zaznam_id));
      if (!ids.length) continue;
      const { data } = await supabase.from(tab).select(`id, ${stlpec}, exported_at`).in("id", ids.slice(0, 300));
      for (const d of (data ?? []) as Riadok[]) {
        cisla.set(String(d.id), String(d[stlpec] ?? ""));
        if (d.exported_at) odovzdane.add(String(d.id));
      }
    }
    // Bankový pohyb nemá číslo — ukáže sa deň, suma a protistrana.
    const bankove = zle.filter((r) => r.druh === "banka").map((r) => String(r.zaznam_id));
    if (bankove.length) {
      const { data } = await supabase
        .from("bank_transactions")
        .select("id, booking_date, amount, currency, counterparty, exported_at")
        .in("id", bankove.slice(0, 300));
      for (const d of (data ?? []) as Riadok[]) {
        const suma = Number(d.amount ?? 0).toFixed(2).replace(".", ",");
        cisla.set(
          String(d.id),
          [String(d.booking_date ?? ""), `${suma} ${d.currency ?? ""}`.trim(), d.counterparty].filter(Boolean).join(" · "),
        );
        if (d.exported_at) odovzdane.add(String(d.id));
      }
    }
    out.odmietnute = zle
      .filter((r) => !odovzdane.has(String(r.zaznam_id)))
      .slice(0, 100)
      .map((r) => ({
        druh: r.druh,
        id: String(r.zaznam_id),
        cislo: cisla.get(String(r.zaznam_id)) || DRUH_POLOZKY[r.druh] || r.druh,
        chyba: String(r.chyba ?? ""),
        kedy: r.potvrdene_at ?? r.created_at ?? null,
        vyprsane: r.stav === "vyprsane",
      }));
  }

  // Opravy, ktoré konektor drží (V13) — tie isté pravidlá ako pri skladaní dávky.
  const [fakt, prij, dokl, pokl] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, pohoda_verzia")
      .eq("company_id", companyId)
      .is("exported_at", null)
      .is("deleted_at", null)
      .gt("pohoda_verzia", 0)
      .not("status", "in", "(draft,cancelled)")
      .limit(200),
    supabase
      .from("purchase_invoices")
      .select("id, invoice_number, pohoda_verzia")
      .eq("company_id", companyId)
      .is("exported_at", null)
      .is("deleted_at", null)
      .gt("pohoda_verzia", 0)
      .limit(200),
    supabase
      .from("expense_documents")
      .select("id, document_number, supplier_name, pohoda_verzia")
      .eq("company_id", companyId)
      .is("exported_at", null)
      .gt("pohoda_verzia", 0)
      .limit(200),
    supabase
      .from("cash_entries")
      .select("id, entry_number, pohoda_verzia")
      .eq("company_id", companyId)
      .is("exported_at", null)
      .gt("pohoda_verzia", 0)
      .limit(200),
  ]);
  const vsetkyOpravy = [
    ...((fakt.data ?? []) as Riadok[]).map((r) => ({ druh: "faktura" as const, riadok: r, cislo: String(r.invoice_number ?? "") })),
    ...((prij.data ?? []) as Riadok[]).map((r) => ({ druh: "prijata" as const, riadok: r, cislo: String(r.invoice_number ?? "") })),
    ...((dokl.data ?? []) as Riadok[]).map((r) => ({
      druh: "doklad" as const,
      riadok: r,
      cislo: String(r.document_number || r.supplier_name || ""),
    })),
    ...((pokl.data ?? []) as Riadok[]).map((r) => ({ druh: "pokladna" as const, riadok: r, cislo: String(r.entry_number ?? "") })),
  ];
  if (vsetkyOpravy.length) {
    const o = await potvrdenie.opravyVDavke(
      supabase,
      companyId,
      vsetkyOpravy,
      await cislaVPohode(supabase, companyId),
      true,
    );
    out.opravy = o.drzane;
    out.opravyCakaju = o.cakaju;
  }

  // V11: neodovzdané staršie ako hranica konektora (rok pred ňou).
  const od = await zaciatokKonektora(supabase, companyId, teraz);
  const rokPred = `${Number(od.slice(0, 4)) - 1}${od.slice(4)}`;
  const pocet = async (tab: string, datum: string, doplnok: (q: any) => any) => {
    const { count } = await doplnok(
      supabase
        .from(tab)
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("exported_at", null)
        .lt(datum, od)
        .gte(datum, rokPred),
    );
    return count ?? 0;
  };
  out.starsie = {
    od,
    faktur: await pocet("invoices", "issue_date", (q) => q.is("deleted_at", null).not("status", "in", "(draft,cancelled)")),
    prijatych: await pocet("purchase_invoices", "issue_date", (q) =>
      q.is("deleted_at", null).not("zauctovane_at", "is", null).in("type", [...TYPY_PRIJATYCH_DO_EXPORTU]),
    ),
    dokladov: await pocet("expense_documents", "issue_date", (q) => q.eq("status", "processed")),
    pokladnicnych: await pocet("cash_entries", "entry_date", (q) => q),
  };

  // Bankové pohyby — len keď ich firma do POHODY posiela.
  const { data: firma } = await supabase
    .from("companies")
    .select("id, pohoda_posielat_banku, pohoda_banka")
    .eq("id", companyId)
    .maybeSingle();
  if ((firma as Riadok)?.pohoda_posielat_banku) {
    const { stavBankyPreKontrolu } = await import("./banka-pohoda.server");
    const b = await stavBankyPreKontrolu(supabase, firma, od);
    const naCeste = (await potvrdenie.cakajuceZaznamy(supabase, companyId, true)).get("banka")?.size ?? 0;
    out.banka = {
      // Pohyb na ceste ešte nie je odovzdaný (`exported_at`), počíta sa zvlášť.
      cakaju: Math.max(0, b.cakaju - naCeste),
      naCeste,
      chyba: out.odmietnute.filter((o) => o.druh === "banka").length,
      bezSkratky: b.bezSkratky,
    };
  }
  return out;
}
