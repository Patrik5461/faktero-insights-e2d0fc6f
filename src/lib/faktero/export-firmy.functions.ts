import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Kompletný export dát firmy do jedného balíka.
 *
 * Číta sa cez prihláseného používateľa, takže si nikto nestiahne firmu, do
 * ktorej nepatrí. Balík sa ukladá do úložiska a vracia sa naň podpísaný odkaz —
 * pri stovkách faktúr by odpoveď servera na base64 nestačila.
 */
const Vstup = z.object({
  company_id: z.string().uuid(),
  /** PDF faktúr balík nafúknu, preto sú voliteľné. */
  s_pdf: z.boolean().default(false),
});

/** Strop pre PDF v balíku — nad ním by generovanie trvalo dlhšie než beh servera. */
const MAX_PDF = 300;

export const exportFirmyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => Vstup.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { naCsv, nazovSuboru, sprievodnyText } = await import("./export-firmy");
    const JSZip = (await import("jszip")).default;

    const { data: firma } = await supabase
      .from("companies")
      .select("*")
      .eq("id", data.company_id)
      .maybeSingle();
    if (!firma) throw new Error("Firma sa nenašla.");

    const zip = new JSZip();
    const pridaj = (nazov: string, riadky: unknown[]) => {
      const zoznam = (riadky ?? []) as Record<string, unknown>[];
      if (!zoznam.length) return 0;
      zip.file(nazov, naCsv(zoznam));
      return zoznam.length;
    };

    const zTabulky = async (tabulka: string, stlpce = "*") => {
      const { data: rows } = await (supabase as any)
        .from(tabulka)
        .select(stlpce)
        .eq("company_id", data.company_id)
        .limit(50_000);
      return (rows ?? []) as Record<string, unknown>[];
    };

    const [
      faktury,
      prijate,
      doklady,
      ostatne,
      odberatelia,
      produkty,
      pokladna,
      banka,
      jazdy,
      zakazky,
    ] = await Promise.all([
      zTabulky("invoices"),
      zTabulky("purchase_invoices"),
      zTabulky("expense_documents"),
      zTabulky("other_documents"),
      zTabulky("customers"),
      zTabulky("products"),
      zTabulky("cash_entries"),
      zTabulky("bank_transactions"),
      zTabulky("trips"),
      zTabulky("jobs"),
    ]);

    // Položky faktúr sa viažu na faktúru, nie na firmu — berú sa po dávkach.
    const polozky: Record<string, unknown>[] = [];
    const idFaktur = faktury.map((f) => String(f.id));
    for (let i = 0; i < idFaktur.length; i += 500) {
      const { data: kus } = await supabase
        .from("invoice_items")
        .select("*")
        .in("invoice_id", idFaktur.slice(i, i + 500));
      polozky.push(...((kus ?? []) as Record<string, unknown>[]));
    }

    const pocty: Record<string, number> = {};
    pocty["firma"] = pridaj("firma.csv", [firma as Record<string, unknown>]);
    pocty["faktúry"] = pridaj("faktury.csv", faktury);
    pocty["položky faktúr"] = pridaj("faktury-polozky.csv", polozky);
    pocty["prijaté faktúry"] = pridaj("prijate-faktury.csv", prijate);
    pocty["doklady"] = pridaj("doklady.csv", doklady);
    pocty["ostatné doklady"] = pridaj("ostatne-doklady.csv", ostatne);
    pocty["odberatelia"] = pridaj("odberatelia.csv", odberatelia);
    pocty["produkty"] = pridaj("produkty.csv", produkty);
    pocty["pokladňa"] = pridaj("pokladna.csv", pokladna);
    pocty["banka"] = pridaj("banka.csv", banka);
    pocty["jazdy"] = pridaj("jazdy.csv", jazdy);
    pocty["zákazky"] = pridaj("zakazky.csv", zakazky);

    let pdfka = 0;
    if (data.s_pdf) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const priecinok = zip.folder("faktury-pdf");
      const sPdf = faktury.filter((f) => f.pdf_url).slice(0, MAX_PDF);
      for (const f of sPdf) {
        try {
          const { data: blob } = await supabaseAdmin.storage
            .from("invoice-pdfs")
            .download(String(f.pdf_url));
          if (!blob) continue;
          priecinok?.file(
            nazovSuboru(String(f.invoice_number ?? f.id), "pdf"),
            new Uint8Array(await blob.arrayBuffer()),
          );
          pdfka++;
        } catch {
          /* jedno chýbajúce PDF nesmie zhodiť celý balík */
        }
      }
    }

    zip.file(
      "OBSAH.txt",
      sprievodnyText(String(firma.name ?? ""), new Date().toLocaleString("sk-SK")),
    );

    const obsah = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const cesta = `${data.company_id}/export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.zip`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage
      .from("export-firmy")
      .upload(cesta, obsah, { contentType: "application/zip", upsert: true });
    if (error) throw new Error(`Balík sa nepodarilo uložiť: ${error.message}`);

    // Odkaz platí týždeň — dosť na stiahnutie, málo na to, aby sa niekde povaľoval.
    const { data: odkaz } = await supabaseAdmin.storage
      .from("export-firmy")
      .createSignedUrl(cesta, 7 * 24 * 3600);

    return {
      url: odkaz?.signedUrl ?? null,
      velkost: obsah.byteLength,
      pocty,
      pdfka,
      orezanePdf: data.s_pdf && faktury.filter((f) => f.pdf_url).length > MAX_PDF,
    };
  });
