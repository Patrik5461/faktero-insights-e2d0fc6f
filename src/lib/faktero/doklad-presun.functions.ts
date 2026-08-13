import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Presun dokladu medzi prijaté faktúry.
 *
 * Do Dokladov sa hádže všetko, čo príde — bloček z benzínky aj faktúra od
 * dodávateľa v PDF. Faktúra však patrí do evidencie prijatých faktúr, kde má
 * splatnosť, úhradu a vstupuje do DPH. Doklad sa preto **presunie**, nie
 * skopíruje: keby ostal na oboch miestach, ten istý náklad by sa počítal
 * dvakrát.
 *
 * Súbor sa prenáša medzi úložiskami stiahnutím a nahratím — kopírovanie medzi
 * dvoma bucketmi Storage API neponúka.
 */

const Vstup = z.object({
  company_id: z.string().uuid(),
  id: z.string().uuid(),
});

function oDni(iso: string, dni: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + dni);
  return d.toISOString().slice(0, 10);
}

export const presunDokladDoPrijatychFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Vstup.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: doklad, error: chybaCitania } = await supabase
      .from("expense_documents")
      .select("*")
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (chybaCitania) throw new Error(chybaCitania.message);
    if (!doklad) throw new Error("Doklad sa nenašiel.");

    /* --- príloha --- */
    let file_path: string | null = null;
    const file_mime: string | null = doklad.file_mime ?? null;
    let file_size: number | null = doklad.file_size ?? null;
    if (doklad.file_path) {
      const { data: subor, error: chybaStiahnutia } = await supabase.storage
        .from("expense-receipts")
        .download(doklad.file_path);
      if (chybaStiahnutia || !subor)
        throw new Error(`Prílohu sa nepodarilo prečítať: ${chybaStiahnutia?.message ?? "?"}`);
      const koncovka = doklad.file_path.split(".").pop() ?? "pdf";
      const cielova = `${data.company_id}/${crypto.randomUUID()}.${koncovka}`;
      const { error: chybaNahratia } = await supabase.storage
        .from("purchase-invoices")
        .upload(cielova, subor, {
          contentType: doklad.file_mime ?? "application/pdf",
          upsert: false,
        });
      if (chybaNahratia)
        throw new Error(`Prílohu sa nepodarilo presunúť: ${chybaNahratia.message}`);
      file_path = cielova;
      file_size = subor.size ?? file_size;
    }

    const dnes = new Date().toISOString().slice(0, 10);
    const vystavenie = (doklad.issue_date as string | null) ?? dnes;
    const zaklad = Number(doklad.net_amount ?? 0) || 0;
    const dph = Number(doklad.vat_amount ?? 0) || 0;
    const celkom = Number(doklad.total_amount ?? 0) || zaklad + dph;
    const poznamka = [doklad.note, doklad.category ? `Kategória: ${doklad.category}` : null]
      .filter(Boolean)
      .join(" · ");

    const { data: faktura, error: chybaZapisu } = await supabase
      .from("purchase_invoices")
      .insert({
        company_id: data.company_id,
        created_by: userId,
        supplier_name: doklad.supplier_name ?? "Neuvedený dodávateľ",
        supplier_ico: doklad.supplier_ico ?? null,
        supplier_ic_dph: doklad.supplier_ic_dph ?? null,
        // Číslo dokladu je na prijatej faktúre povinné; keď ho bloček nemá,
        // radšej zrozumiteľná náhrada než prázdno.
        invoice_number: doklad.document_number ?? `DOKLAD-${String(doklad.id).slice(0, 8)}`,
        issue_date: vystavenie,
        received_date: dnes,
        due_date: oDni(vystavenie, 14),
        amount_without_vat: zaklad,
        vat_amount: dph,
        amount_total: celkom,
        currency: doklad.currency ?? "EUR",
        payment_method: doklad.payment_method ?? "prevod",
        note: poznamka || null,
        status: "received",
        file_path,
        file_mime,
        file_size,
      })
      .select("id")
      .single();
    if (chybaZapisu || !faktura) {
      // Prílohu, ktorá už je v druhom úložisku, po neúspechu upraceme.
      if (file_path) await supabase.storage.from("purchase-invoices").remove([file_path]);
      throw new Error(chybaZapisu?.message ?? "Prijatú faktúru sa nepodarilo vytvoriť.");
    }

    /* --- pôvodný doklad aj s prílohou preč --- */
    if (doklad.file_path) {
      await supabase.storage.from("expense-receipts").remove([doklad.file_path]);
    }
    const { error: chybaMazania } = await supabase
      .from("expense_documents")
      .delete()
      .eq("id", data.id);
    if (chybaMazania) throw new Error(chybaMazania.message);

    return { id: faktura.id as string };
  });
