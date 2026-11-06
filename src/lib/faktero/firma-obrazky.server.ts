import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cestaPatriFirme } from "./cesta-firmy";

/**
 * Stiahne obrázok firmy (logo, pečiatku) z kbelíka company-logos pre PDF.
 * Obrázok je na doklade voliteľný, takže chyba vráti `null` namiesto výnimky.
 *
 * Cestu vie člen firmy prepísať a sťahuje sa servisným kľúčom — preto musí
 * ležať v priečinku firmy, inak sa obrázok ignoruje.
 */
export async function stiahniObrazokFirmy(
  path: string | null | undefined,
  companyId: string | null | undefined,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!path) return null;
  if (!cestaPatriFirme(path, companyId)) {
    console.warn("[firma-obrazky] cesta mimo priečinka firmy, ignorujem", { companyId });
    return null;
  }
  try {
    const { data: blob } = await supabaseAdmin.storage.from("company-logos").download(path);
    if (!blob) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type };
  } catch {
    return null;
  }
}
