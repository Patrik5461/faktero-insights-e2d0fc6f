import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Nahratie prijatej faktúry súborom — PDF alebo fotka.
 *
 * Doteraz sa doklad od dodávateľa dal dostať do systému len ručným
 * prepísaním alebo e-mailom na zbernú adresu. Kto ho má v počítači, musel
 * ho buď preposlať sám sebe, alebo prepisovať údaje z papiera. Tu ho stačí
 * vybrať: prečíta ho tá istá AI ako pri pošte, uloží sa aj s prílohou a
 * podľa toho, čo je na papieri, skončí medzi prijatými faktúrami alebo
 * medzi prijatými zálohami.
 *
 * Doklad vzniká v stave „draft" — nikto ho zatiaľ neschválil a údaje z AI
 * treba prejsť očami.
 */

const MAX_BAJTOV = 15 * 1024 * 1024;

const Vstup = z.object({
  company_id: z.string().uuid(),
  /** Obsah súboru v base64 (bez dátovej hlavičky). */
  subor: z.string().min(16),
  nazov: z.string().min(1).max(255),
  mime: z.string().min(3).max(120),
  /**
   * Čo si používateľ vybral. `auto` necháva rozhodnutie na obsahu dokladu —
   * zo zoznamu prijatých záloh sa posiela rovno `proforma`.
   */
  druh: z.enum(["auto", "regular", "proforma"]).default("auto"),
});

export type NahratyDoklad = {
  /** Doklad čaká v Nespracovaných — `id` je id nespracovaného dokladu. */
  nespracovany?: boolean;
  id: string;
  invoice_number: string;
  supplier_name: string;
  amount_total: number;
  currency: string;
  type: "regular" | "proforma";
  /** `true`, keď AI z dokladu nič nevytiahla a údaje treba doplniť ručne. */
  prazdny: boolean;
};

export const nahrajPrijatuFakturuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Vstup.parse(d))
  .handler(async ({ data, context }): Promise<NahratyDoklad> => {
    const { supabase, userId } = context;

    const bajty = Buffer.from(data.subor, "base64");
    if (!bajty.length) throw new Error("Súbor je prázdny.");
    if (bajty.length > MAX_BAJTOV) throw new Error("Súbor je väčší než 15 MB.");

    const { assertCompanyActive } = await import("./active-check.server");
    await assertCompanyActive(data.company_id);

    const { precitajDoklad } = await import("./mail-prijem.server");
    const ai = await precitajDoklad(bajty.toString("base64"), data.mime);

    const { zostavPrijatuFakturu } = await import("./mail-prijem");
    const dnes = new Date().toISOString().slice(0, 10);
    const faktura = zostavPrijatuFakturu({
      ai,
      odosielatel: null,
      predmet: null,
      nazovSuboru: data.nazov,
      dnes,
    });

    /*
      Zo zoznamu prijatých záloh chodí `proforma` napevno — človek už
      povedal, čo nahráva, a prebiť ho odhadom z papiera by bolo drzé.
    */
    const typ = data.druh === "auto" ? faktura.type : data.druh;

    /*
      Ako v Doklado: nahratý doklad nejde rovno medzi prijaté faktúry, ale do
      Nespracovaných. Tam ho človek otvorí, určí druh, skontroluje, zaúčtuje
      a až potom vytvorí. Zo zoznamu prijatých záloh (aj z appky) chodí druh
      napevno — ten sa predvyplní.
    */
    const { zalozNespracovany } = await import("./nespracovane.server");
    const { id } = await zalozNespracovany(supabase as any, {
      companyId: data.company_id,
      userId,
      zdroj: "nahratie",
      bajty,
      nazov: data.nazov,
      mime: data.mime,
      ai,
      druh: typ === "proforma" ? "zalohova" : undefined,
    });
    return {
      id,
      invoice_number: faktura.invoice_number,
      supplier_name: faktura.supplier_name,
      amount_total: Number(faktura.amount_total ?? 0),
      currency: faktura.currency,
      type: typ,
      prazdny: !ai,
      nespracovany: true,
    };
  });

