import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Podklady pre priznanie k jednému kontaktnému miestu (OSS).
 *
 * Do prehľadu idú len faktúry označené ako predaj spotrebiteľovi v EÚ. Popri
 * štvrťroku sa počíta aj ročný objem — hranica 10 000 eur rozhoduje o tom, či
 * sa vôbec má zdaňovať v štáte zákazníka.
 */
export const ossPrehladFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        rok: z.number().int().min(2020).max(2100),
        stvrtrok: z.number().int().min(1).max(4),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { ossPrehlad, stavPrahu } = await import("./oss");

    const prvyMesiac = (data.stvrtrok - 1) * 3 + 1;
    const od = `${data.rok}-${String(prvyMesiac).padStart(2, "0")}-01`;
    const doDna = new Date(Date.UTC(data.rok, prvyMesiac + 2, 0)).toISOString().slice(0, 10);

    const { data: rows } = await context.supabase
      .from("invoices")
      .select(
        "id, invoice_number, type, status, issue_date, delivery_date, oss_country, subtotal, invoice_items(vat_rate, subtotal, quantity, unit_price)",
      )
      .eq("company_id", data.company_id)
      .eq("oss", true)
      .is("deleted_at", null)
      .limit(5000);

    const vsetky = (rows ?? []).filter(
      (f: any) => !["draft", "cancelled"].includes(String(f.status)),
    );
    const vObdobi = vsetky.filter((f: any) => {
      const d = String(f.delivery_date || f.issue_date);
      return d >= od && d <= doDna;
    });

    const naDoklad = (f: any) => {
      const mapa = new Map<number, { sadzba: number; zaklad: number; dan: number }>();
      for (const p of f.invoice_items ?? []) {
        const sadzba = Number(p.vat_rate ?? 0);
        const zaklad =
          p.subtotal != null
            ? Number(p.subtotal)
            : Number(p.quantity ?? 0) * Number(p.unit_price ?? 0);
        const s = mapa.get(sadzba) ?? { sadzba, zaklad: 0, dan: 0 };
        s.zaklad += zaklad;
        s.dan += (zaklad * sadzba) / 100;
        mapa.set(sadzba, s);
      }
      return {
        cislo: String(f.invoice_number),
        datum: String(f.delivery_date || f.issue_date),
        stat: String(f.oss_country ?? ""),
        opravny: f.type === "credit_note",
        riadky: [...mapa.values()].map((r) => ({
          sadzba: r.sadzba,
          zaklad: Math.round(r.zaklad * 100) / 100,
          dan: Math.round(r.dan * 100) / 100,
        })),
      };
    };

    const prehlad = ossPrehlad(vObdobi.map(naDoklad));

    // Ročný objem kvôli hranici 10 000 € — počíta sa za všetky štáty spolu.
    const zaRok = vsetky
      .filter((f: any) => String(f.delivery_date || f.issue_date).startsWith(String(data.rok)))
      .reduce((a: number, f: any) => a + Number(f.subtotal ?? 0), 0);

    return {
      obdobie: { rok: data.rok, stvrtrok: data.stvrtrok, od, do: doDna },
      prehlad,
      pocet: vObdobi.length,
      prah: stavPrahu(zaRok),
      zaRok: Math.round(zaRok * 100) / 100,
    };
  });
