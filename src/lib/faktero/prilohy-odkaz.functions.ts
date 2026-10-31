import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Verejná stránka /prilohy/<token> — prílohy dokladu, ktoré sa nezmestili do
 * e-mailu. Bez prihlásenia: ochranou je podpísaný token s exspiráciou. Von
 * ide len číslo dokladu, názov firmy a tie prílohy, ktoré token menuje —
 * a len keď k tomu dokladu stále patria.
 */
const Vstup = z.object({ token: z.string().min(40).max(600) });

const DOKLADY = {
  invoice: { tabulka: "invoices", cislo: "invoice_number", stlpec: "invoice_id" },
  quote: { tabulka: "quotes", cislo: "quote_number", stlpec: "quote_id" },
  sales_order: { tabulka: "sales_orders", cislo: "order_number", stlpec: "sales_order_id" },
} as const;

export const prilohyPodlaOdkazuFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => Vstup.parse(d))
  .handler(async ({ data }) => {
    const { overOdkazPriloh } = await import("./prilohy-odkaz.server");
    const o = overOdkazPriloh(data.token);
    if (!o) throw new Error("Odkaz nie je platný alebo už vypršal.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const d = DOKLADY[o.druh];
    const { data: doklad } = await db
      .from(d.tabulka)
      .select(`id, company_id, ${d.cislo}, deleted_at`)
      .eq("id", o.dokladId)
      .maybeSingle();
    if (!doklad || doklad.deleted_at) throw new Error("Odkaz nie je platný alebo už vypršal.");

    const [{ data: prilohy }, { data: firma }] = await Promise.all([
      db
        .from("invoice_attachments")
        .select("id, path, name, size")
        .eq("company_id", doklad.company_id)
        .eq(d.stlpec, doklad.id)
        .in("id", o.prilohy),
      db.from("companies").select("name").eq("id", doklad.company_id).maybeSingle(),
    ]);

    // Odkaz na súbor platí hodinu — stránka sa dá otvoriť znova, kým platí token.
    const zoznam = await Promise.all(
      ((prilohy ?? []) as any[])
        // Cestu by bez kontroly mohol niekto podstrčiť z inej firmy.
        .filter((p) => String(p.path).startsWith(`${doklad.company_id}/`))
        .map(async (p) => {
          const { data: s } = await supabaseAdmin.storage
            .from("invoice-attachments")
            .createSignedUrl(p.path, 3600, { download: p.name });
          return {
            nazov: p.name as string,
            velkost: Number(p.size ?? 0),
            url: s?.signedUrl ?? null,
          };
        }),
    );
    return {
      druh: o.druh,
      cislo: (doklad[d.cislo] as string | null) ?? null,
      firma: (firma?.name as string | null) ?? null,
      platiDo: new Date(o.exp * 1000).toISOString(),
      prilohy: zoznam.filter((p) => p.url),
    };
  });
