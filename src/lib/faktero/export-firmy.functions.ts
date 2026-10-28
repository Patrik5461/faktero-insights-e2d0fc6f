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
  /** Skeny prijatých faktúr a bločkov (digitálny archív). */
  s_skenmi: z.boolean().default(false),
  /** Obdobie dokladov — bez neho všetko. */
  od: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  do: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  podla: z.enum(["vystavenia", "dodania", "vytvorenia"]).default("vystavenia"),
});

/** Strop pre skeny — sťahovanie po jednom je pomalé. */
const MAX_SKENOV = 200;

/** Strop pre PDF v balíku — nad ním by generovanie trvalo dlhšie než beh servera. */
const MAX_PDF = 300;

export const exportFirmyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => Vstup.parse(input))
  .handler(async ({ data, context }) => {
    const { zostavBalikFirmy } = await import("./export-firmy.server");
    const { obsah, pocty, pdfka, skenov, orezaneSkeny, orezanePdf } = await zostavBalikFirmy(
      context.supabase,
      data,
      { maxPdf: MAX_PDF, maxSkenov: MAX_SKENOV },
    );
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
      skenov,
      orezaneSkeny,
      orezanePdf,
    };
  });
