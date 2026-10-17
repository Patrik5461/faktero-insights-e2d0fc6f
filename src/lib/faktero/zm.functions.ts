import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Nemecká Zusammenfassende Meldung (§ 18a UStG) — súčty dodaní do EÚ za mesiac
 * alebo štvrťrok. Načítava sa vždy celý štvrťrok (hranica 50 000 € a služby,
 * ktoré sa hlásia štvrťročne), pod RLS prihláseného používateľa.
 */

const Vstup = z
  .object({
    company_id: z.string().uuid(),
    rok: z.number().int().min(2020).max(2100),
    mesiac: z.number().int().min(1).max(12).nullable().optional(),
    stvrtrok: z.number().int().min(1).max(4).nullable().optional(),
    /** Služby hlásiť mesačne (§ 18a Abs. 3) namiesto štvrťročne. */
    sluzby_mesacne: z.boolean().optional(),
  })
  .refine((d) => Boolean(d.mesiac) !== Boolean(d.stvrtrok), {
    message: "Zadajte mesiac alebo štvrťrok, nie oboje.",
  });

export const zostavZmFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => Vstup.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: firma } = await supabase
      .from("companies")
      .select("name, country, vat_payer, vat_scheme, ic_dph")
      .eq("id", data.company_id)
      .maybeSingle();
    if (!firma) throw new Error("Firma sa nenašla.");
    const obdobie = { rok: data.rok, mesiac: data.mesiac ?? null, stvrtrok: data.stvrtrok ?? null };
    // § 18a Abs. 4 — Kleinunternehmer ZM nepodáva.
    if (firma.vat_scheme === "de_kleinunternehmer" || firma.vat_payer === false)
      return { obdobie, firma, kleinunternehmer: true as const, zm: null, vytky: [] };

    const stvrtrok = data.stvrtrok ?? Math.floor(((data.mesiac ?? 1) - 1) / 3) + 1;
    const { nacitajVstup } = await import("./dph-vykazy.server");
    const { zostavZm } = await import("./zm");
    const { vstup, vytky } = await nacitajVstup(supabase, data.company_id, {
      rok: data.rok,
      mesiac: null,
      stvrtrok,
    });
    const zm = zostavZm(vstup, obdobie, { sluzbyMesacne: Boolean(data.sluzby_mesacne) });
    // Výhrady načítania sa týkajú celého štvrťroka — do ZM patria len tie o dokladoch v nej.
    const cislaEu = new Set(
      vstup.vystavene.filter((f) => f.prenosTyp === "eu_b2b").map((f) => String(f.cislo)),
    );
    return {
      obdobie,
      firma,
      kleinunternehmer: false as const,
      zm,
      vytky: [...vytky.filter((v) => cislaEu.has(String(v.doklad))), ...zm.vytky],
      bezUstIdNr: !String(firma.ic_dph ?? "").trim(),
    };
  });
