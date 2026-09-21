import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Stiahne obrázok firmy (logo, pečiatku) z kbelíka company-logos pre PDF.
 * Obrázok je na doklade voliteľný, takže chyba vráti `null` namiesto výnimky.
 */
export async function stiahniObrazokFirmy(
  path: string | null | undefined,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!path) return null;
  try {
    const { data: blob } = await supabaseAdmin.storage.from("company-logos").download(path);
    if (!blob) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type };
  } catch {
    return null;
  }
}
