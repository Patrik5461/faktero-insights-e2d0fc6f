import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
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
  /**
   * Rovnaký súbor už vo firme je — nič sa nezaložilo, `id` je prázdne
   * a odkaz na existujúci doklad je tu.
   */
  duplicita?: import("./duplicita-suboru").DuplicitaSuboru | null;
  /** Rovnaký súbor bol len v koši — doklad sa založil. */
  vKosi?: boolean;
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

    // Ten istý súbor už vo firme je — skôr než ho začne čítať AI.
    const { odtlacokSuboru, najdiRovnakySubor } = await import("./duplicita-suboru.server");
    const hash = odtlacokSuboru(bajty);
    {
      const { duplicita } = await najdiRovnakySubor(supabase as any, data.company_id, hash);
      if (duplicita)
        return {
          id: "",
          invoice_number: duplicita.cislo ?? "",
          supplier_name: duplicita.partner ?? "",
          amount_total: 0,
          currency: "EUR",
          type: data.druh === "proforma" ? "proforma" : "regular",
          prazdny: false,
          duplicita,
        };
    }

    // Zaheslované PDF sa nečíta (AI by nič nevidela) — odomkne ho uložené heslo
    // firmy alebo človek v Nespracovaných (zalozNespracovany sa o to postará).
    const { jePdf, stavPdf } = await import("./pdf-heslo.server");
    const zaheslovane = jePdf(data.mime, data.nazov, bajty) && (await stavPdf(bajty).catch(() => "nezname")) === "heslo";
    const { precitajDoklad } = await import("./mail-prijem.server");
    const ai = zaheslovane
      ? null
      : await precitajDoklad(bajty.toString("base64"), data.mime, null, {
          ucel: "nespracovane",
          firma: data.company_id,
          // Prehliadač čaká na odpoveď — vyšší model by nestihol 30 s nginx.
          synchronne: true,
        });

    const { zostavPrijatuFakturu } = await import("./mail-prijem");
    const dnes = dnesBratislava();
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
    const { id, vKosi } = await zalozNespracovany(supabase as any, {
      companyId: data.company_id,
      userId,
      zdroj: "nahratie",
      bajty,
      nazov: data.nazov,
      mime: data.mime,
      ai,
      druh: typ === "proforma" ? "zalohova" : undefined,
      hash,
    });
    return {
      id,
      ...(vKosi ? { vKosi: true } : {}),
      invoice_number: faktura.invoice_number,
      supplier_name: faktura.supplier_name,
      amount_total: Number(faktura.amount_total ?? 0),
      currency: faktura.currency,
      type: typ,
      prazdny: !ai,
      nespracovany: true,
    };
  });

