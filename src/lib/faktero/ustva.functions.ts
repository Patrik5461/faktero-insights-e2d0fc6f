import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Nemecká UStVA — prehľad Kennzahlen za mesiac alebo štvrťrok z toho istého
 * načítania dokladov ako slovenské a české výkazy. Číta sa pod RLS
 * prihláseného používateľa. Bez podania cez ELSTER.
 */

const Vstup = z
  .object({
    company_id: z.string().uuid(),
    rok: z.number().int().min(2020).max(2100),
    mesiac: z.number().int().min(1).max(12).nullable().optional(),
    stvrtrok: z.number().int().min(1).max(4).nullable().optional(),
    /** Ručné riadky (KZ 39, 48, 64, 69). */
    rucne: z.record(z.string(), z.number()).optional(),
  })
  .refine((d) => Boolean(d.mesiac) !== Boolean(d.stvrtrok), {
    message: "Zadajte mesiac alebo štvrťrok, nie oboje.",
  });

type VstupUstva = z.infer<typeof Vstup>;

async function zostav(supabase: any, data: VstupUstva) {
  const { data: firma } = await supabase
    .from("companies")
    .select(
      "name, country, vat_payer, vat_scheme, ic_dph, dic, de_versteuerung, de_ustva_obdobie, de_dauerfrist",
    )
    .eq("id", data.company_id)
    .maybeSingle();
  if (!firma) throw new Error("Firma sa nenašla.");
  const obdobie = { rok: data.rok, mesiac: data.mesiac ?? null, stvrtrok: data.stvrtrok ?? null };
  const { nastaveniaUstva, terminUstva } = await import("./ustva-terminy");
  const nastavenia = {
    ...nastaveniaUstva(firma),
    versteuerung: (firma.de_versteuerung === "ist" ? "ist" : "soll") as "soll" | "ist",
  };
  const termin = terminUstva(obdobie, nastavenia.dauerfrist);
  // Kleinunternehmer (§ 19 UStG) UStVA nepodáva — nie je čo počítať.
  if (firma.vat_scheme === "de_kleinunternehmer" || firma.vat_payer === false)
    return {
      obdobie,
      firma,
      nastavenia,
      termin,
      kleinunternehmer: true as const,
      ustva: null,
      vytky: [],
      pocty: null,
    };
  const { nacitajVstup } = await import("./dph-vykazy.server");
  const { ustva } = await import("./ustva");
  /*
    Ist-Versteuerung (§ 20 UStG): výstupná daň podľa prijatých platieb.
    Kontrola záloh (Mindest-Ist) platí pri Soll aj Ist.
  */
  const { vstup, vytky } = await nacitajVstup(supabase, data.company_id, obdobie, {
    ist: nastavenia.versteuerung === "ist",
    kontrolaZaloh: true,
  });
  const u = ustva(vstup, (data.rucne ?? {}) as any);
  return {
    obdobie,
    firma,
    nastavenia,
    termin,
    kleinunternehmer: false as const,
    ustva: u,
    vytky: [...vytky, ...u.vytky],
    pocty: {
      vystavene: vstup.vystavene.length,
      prijate: vstup.prijate.length,
      doklady: vstup.doklady.length,
    },
  };
}

export const zostavUstvaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => Vstup.parse(input))
  .handler(async ({ data, context }) => zostav(context.supabase as any, data));

/** PDF prehľadu — v jazyku webu (popisy cez slovník). */
export const ustvaPdfFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ vstup: z.unknown(), jazyk: z.enum(["sk", "cs", "de"]).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const v = Vstup.parse(data.vstup);
    const r = await zostav(context.supabase as any, v);
    if (!r.ustva) throw new Error("Kleinunternehmer UStVA nepodáva.");
    const { pdfUstva } = await import("./ustva-pdf.server");
    const { preloz } = await import("@/lib/i18n/jazyk");
    const jazyk = data.jazyk ?? "de";
    const obdobie = v.mesiac
      ? `${String(v.mesiac).padStart(2, "0")}/${v.rok}`
      : `${v.stvrtrok}. ${preloz(jazyk, "štvrťrok")} ${v.rok}`;
    const obsah = await pdfUstva({
      ustva: r.ustva,
      firma: String(r.firma.name ?? ""),
      obdobie,
      preloz: (s) => preloz(jazyk, s),
    });
    const kod = v.mesiac
      ? `${v.rok}-${String(v.mesiac).padStart(2, "0")}`
      : `${v.rok}-Q${v.stvrtrok}`;
    return { nazov: `UStVA-${kod}.pdf`, base64: Buffer.from(obsah).toString("base64") };
  });
