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

    // Príloha ide do úložiska prv, než vznikne riadok — bez nej je doklad
    // len prepis a pri kontrole chýba papier.
    const pripona = (data.nazov.split(".").pop() ?? "bin").toLowerCase().slice(0, 8);
    const cesta = `${data.company_id}/${crypto.randomUUID()}.${pripona}`;
    const up = await supabase.storage
      .from("purchase-invoices")
      .upload(cesta, bajty, { contentType: data.mime, upsert: false });
    if (up.error) throw new Error(`Súbor sa nepodarilo uložiť: ${up.error.message}`);

    const { data: vlozena, error } = await supabase
      .from("purchase_invoices")
      .insert({
        ...faktura,
        type: typ,
        company_id: data.company_id,
        created_by: userId,
        // Zdroj odlišuje nahraté doklady od ručne prepísaných aj od pošty.
        source: "nahrate",
        note: ai ? `Nahraté zo súboru ${data.nazov}.` : `Nahraté zo súboru ${data.nazov}. Údaje sa nepodarilo prečítať — doplňte ich ručne.`,
        file_path: cesta,
        file_mime: data.mime,
        file_size: bajty.length,
      })
      .select("id, invoice_number, supplier_name, amount_total, currency, type")
      .single();

    if (error || !vlozena) {
      // Súbor bez dokladu by v úložisku len ležal a nikto by sa k nemu nedostal.
      await supabase.storage.from("purchase-invoices").remove([cesta]);
      const { friendlyError } = await import("./plan-error");
      throw new Error(friendlyError(error, "Doklad sa nepodarilo uložiť."));
    }

    /* Doklad v cudzej mene potrebuje kurz ECB; bez neho by chýbal vo výkaze. */
    if (faktura.currency && faktura.currency !== "EUR") {
      try {
        const { prepocitajDoklad } = await import("./kurzy.server");
        const prepocet = await prepocitajDoklad(faktura.currency, faktura.issue_date, {
          zaklad: faktura.amount_without_vat,
          dan: faktura.vat_amount,
          celkom: faktura.amount_total,
        });
        if (prepocet) {
          await supabase
            .from("purchase_invoices")
            .update({
              exchange_rate: prepocet.kurz,
              amount_without_vat_eur: prepocet.zaklad,
              vat_amount_eur: prepocet.dan,
            })
            .eq("id", vlozena.id);
        }
      } catch {
        /* Kurz je doplnok — doklad je uložený a to je podstatné. */
      }
    }

    return {
      id: vlozena.id,
      invoice_number: vlozena.invoice_number,
      supplier_name: vlozena.supplier_name,
      amount_total: Number(vlozena.amount_total ?? 0),
      currency: vlozena.currency ?? "EUR",
      type: (vlozena as any).type === "proforma" ? "proforma" : "regular",
      prazdny: !ai,
    };
  });
