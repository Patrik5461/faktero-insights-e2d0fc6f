import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DRUHY_S_PRILOHAMI, MAX_PRILOH, cestaPrilohy, typSuboru } from "./faktura-prilohy";

/*
  Presun nahratého dokladu medzi prílohy iného dokladu (ako v Doklado).
  Druhá strana faktúry, dodací list či výkaz sa často nahrá ako samostatný
  doklad; namiesto mazania a nového nahrávania sa jeho súbor pripojí ako
  príloha k správnemu dokladu a pôvodný záznam ide do koša.

  Všetko ide cez klienta prihláseného — cudziu firmu odfiltruje RLS a do
  firmy, kde nesmie zapisovať, sa nič nezapíše.
*/

const KOS_PRILOH = "invoice-attachments";

export const presunAkoPrilohuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        zdroj: z.object({ agenda: z.enum(["doklad", "prijata"]), id: z.string().uuid() }),
        ciel: z.object({
          druh: z.enum(["purchase_invoice", "expense", "invoice"]),
          id: z.string().uuid(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const zdrojTab = data.zdroj.agenda === "doklad" ? "expense_documents" : "purchase_invoices";
    const zdrojKos = data.zdroj.agenda === "doklad" ? "expense-receipts" : "purchase-invoices";
    const { data: zdroj } = await supabase
      .from(zdrojTab)
      .select("*")
      .eq("id", data.zdroj.id)
      .maybeSingle();
    if (!zdroj) throw new Error("Doklad sa nenašiel.");
    if (!zdroj.file_path) throw new Error("Doklad nemá súbor, ktorý by sa dal priložiť.");
    if (zdroj.exported_at)
      throw new Error("Doklad je odovzdaný do účtovníctva — najprv ho vráťte z Pohody.");
    if (
      (data.ciel.druh === "expense" &&
        data.zdroj.agenda === "doklad" &&
        data.ciel.id === data.zdroj.id) ||
      (data.ciel.druh === "purchase_invoice" &&
        data.zdroj.agenda === "prijata" &&
        data.ciel.id === data.zdroj.id)
    )
      throw new Error("Doklad sa nedá priložiť sám k sebe.");

    const druh = DRUHY_S_PRILOHAMI[data.ciel.druh];
    const { data: ciel } = await supabase
      .from(druh.tabulka)
      .select("id, company_id")
      .eq("id", data.ciel.id)
      .maybeSingle();
    if (!ciel) throw new Error(`${druh.nazov} sa nenašla.`);
    if (ciel.company_id !== zdroj.company_id) throw new Error("Doklady sú v rôznych firmách.");

    const { count } = await supabase
      .from(druh.prilohy)
      .select("id", { count: "exact", head: true })
      .eq(druh.stlpec, ciel.id);
    if ((count ?? 0) >= MAX_PRILOH)
      throw new Error(`K dokladu sa dá priložiť najviac ${MAX_PRILOH} súborov.`);

    const { data: subor, error: chybaStiahnutia } = await supabase.storage
      .from(zdrojKos)
      .download(zdroj.file_path);
    if (chybaStiahnutia || !subor) throw new Error("Súbor dokladu sa nepodarilo načítať.");
    const meno =
      String(zdroj.file_path).split("/").pop() ||
      `${zdroj.document_number || zdroj.invoice_number || "doklad"}.pdf`;
    const typ = typSuboru(zdroj.file_mime ?? subor.type ?? "", meno) ?? "application/pdf";
    const cesta = cestaPrilohy(ciel.company_id, ciel.id, typ);
    const bajty = new Uint8Array(await subor.arrayBuffer());
    const { error: chybaNahratia } = await supabase.storage
      .from(KOS_PRILOH)
      .upload(cesta, bajty, { contentType: typ, upsert: false });
    if (chybaNahratia) throw new Error(`Súbor sa nepodarilo uložiť: ${chybaNahratia.message}`);

    const nazov =
      [zdroj.supplier_name, zdroj.document_number || zdroj.invoice_number]
        .filter(Boolean)
        .join(" ") || meno;
    const { error } = await supabase.from(druh.prilohy).insert({
      company_id: ciel.company_id,
      [druh.stlpec]: ciel.id,
      path: cesta,
      name: `${nazov}.${cesta.split(".").pop()}`.slice(0, 200),
      mime: typ,
      size: bajty.length,
      created_by: context.userId,
    });
    if (error) {
      await supabase.storage.from(KOS_PRILOH).remove([cesta]);
      throw new Error(error.message);
    }

    // Pôvodný záznam do koša — dá sa obnoviť, kým sa kôš nevysype.
    if (data.zdroj.agenda === "doklad") {
      const { data: pohyby } = await supabase
        .from("bank_transactions")
        .select("id")
        .eq("matched_expense_id", zdroj.id);
      const { error: e1 } = await supabase.from("kos_dokladov").insert({
        company_id: zdroj.company_id,
        druh: "doklad",
        zaznam_id: zdroj.id,
        zaznam: zdroj,
        vazby: { banka: (pohyby ?? []).map((p: any) => p.id) },
        popis: `${nazov} (presunutý ako príloha)`,
        zmazal: context.userId,
      });
      if (e1) throw new Error(e1.message);
      await supabase.from("expense_documents").delete().eq("id", zdroj.id);
    } else {
      await supabase
        .from("purchase_invoices")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", zdroj.id);
    }
    return { ok: true as const };
  });

/** Doklady, ku ktorým sa dá priložiť — na výber v okne presunu. */
export const kandidatiPrilohyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        druh: z.enum(["purchase_invoice", "expense", "invoice"]),
        hladaj: z.string().max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const h = (data.hladaj ?? "").trim().replace(/[%,()]/g, " ");
    if (data.druh === "purchase_invoice") {
      let q = supabase
        .from("purchase_invoices")
        .select("id, invoice_number, supplier_name, issue_date, amount_total, currency")
        .eq("company_id", data.company_id)
        .is("deleted_at", null)
        .order("issue_date", { ascending: false })
        .limit(30);
      if (h) q = q.or(`invoice_number.ilike.%${h}%,supplier_name.ilike.%${h}%`);
      const { data: r } = await q;
      return (r ?? []).map((x: any) => ({
        id: x.id,
        popis: `${x.invoice_number ?? ""} · ${x.supplier_name ?? ""}`,
        datum: x.issue_date,
        suma: x.amount_total,
        mena: x.currency,
      }));
    }
    if (data.druh === "expense") {
      let q = supabase
        .from("expense_documents")
        .select("id, document_number, supplier_name, issue_date, total_amount, currency")
        .eq("company_id", data.company_id)
        .order("issue_date", { ascending: false })
        .limit(30);
      if (h) q = q.or(`document_number.ilike.%${h}%,supplier_name.ilike.%${h}%`);
      const { data: r } = await q;
      return (r ?? []).map((x: any) => ({
        id: x.id,
        popis: `${x.document_number ?? "bloček"} · ${x.supplier_name ?? ""}`,
        datum: x.issue_date,
        suma: x.total_amount,
        mena: x.currency,
      }));
    }
    let q = supabase
      .from("invoices")
      .select("id, invoice_number, customer_name, issue_date, total, currency")
      .eq("company_id", data.company_id)
      .is("deleted_at", null)
      .order("issue_date", { ascending: false })
      .limit(30);
    if (h) q = q.or(`invoice_number.ilike.%${h}%,customer_name.ilike.%${h}%`);
    const { data: r } = await q;
    return (r ?? []).map((x: any) => ({
      id: x.id,
      popis: `${x.invoice_number ?? ""} · ${x.customer_name ?? ""}`,
      datum: x.issue_date,
      suma: x.total,
      mena: x.currency,
    }));
  });
