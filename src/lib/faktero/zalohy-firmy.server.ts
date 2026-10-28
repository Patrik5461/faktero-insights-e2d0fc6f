/*
  Zálohy firmy — beh na pozadí.

  Zostavenie balíka so všetkými PDF a skenmi trvá dlhšie, než nginx podrží
  spojenie (30 s, potom 499), preto `vytvorZalohuFn` len založí riadok
  v `zalohy_firmy` a spustí túto funkciu bez čakania. Stránka sa potom na stav
  doptáva. Server beží ako trvalý proces (node-server), takže beh dobehne aj
  po odpovedi.
*/
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { POCET_ZALOH, cestaZalohy, zalohyNaZmazanie } from "./zalohy-firmy";

/** Stropy pre zálohu — vyššie než pri okamžitom stiahnutí, beh nikto nečaká. */
const LIMITY = { maxPdf: 20000, maxSkenov: 20000 };

export async function spustiZalohu(zalohaId: string, companyId: string): Promise<void> {
  try {
    const { zostavBalikFirmy } = await import("./export-firmy.server");
    const balik = await zostavBalikFirmy(
      supabaseAdmin,
      { company_id: companyId, s_pdf: true, s_skenmi: true, podla: "vystavenia" },
      LIMITY,
    );
    const cesta = cestaZalohy(companyId, new Date());
    const { error } = await supabaseAdmin.storage
      .from("export-firmy")
      .upload(cesta, balik.obsah, { contentType: "application/zip", upsert: true });
    if (error) throw new Error(`Zálohu sa nepodarilo uložiť: ${error.message}`);
    await supabaseAdmin
      .from("zalohy_firmy")
      .update({
        stav: "hotovo",
        cesta,
        velkost: balik.obsah.byteLength,
        pocty: { ...balik.pocty, "PDF faktúr": balik.pdfka, skeny: balik.skenov },
        finished_at: new Date().toISOString(),
      })
      .eq("id", zalohaId);
    await uprac(companyId);
  } catch (e: any) {
    console.error("[zalohy-firmy] záloha zlyhala:", String(e?.message ?? e).slice(0, 300));
    await supabaseAdmin
      .from("zalohy_firmy")
      .update({
        stav: "chyba",
        chyba: String(e?.message ?? e).slice(0, 500),
        finished_at: new Date().toISOString(),
      })
      .eq("id", zalohaId);
  }
}

/** Ponechá posledných `POCET_ZALOH` hotových záloh, staršie zmaže aj zo súborov. */
export async function uprac(companyId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("zalohy_firmy")
    .select("id, stav, cesta, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(200);
  const prec = zalohyNaZmazanie((data ?? []) as any[], POCET_ZALOH);
  if (!prec.length) return;
  const cesty = prec
    .map((z) => z.cesta)
    .filter((c): c is string => !!c && c.startsWith(`${companyId}/`));
  if (cesty.length) await supabaseAdmin.storage.from("export-firmy").remove(cesty);
  await supabaseAdmin
    .from("zalohy_firmy")
    .delete()
    .in(
      "id",
      prec.map((z) => z.id),
    );
}
