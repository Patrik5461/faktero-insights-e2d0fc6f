import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DRUHY_S_PRILOHAMI, type DruhSPrilohou } from "./faktura-prilohy";

/**
 * Resend berie celú správu do 40 MB, a to je spolu s PDF dokladu aj s
 * nárastom pri base64 — preto strop na súčet príloh. Čo sa nezmestí, sa
 * vynechá a povie sa to, než by mail neodišiel vôbec.
 */
export const STROP_PRILOH = 20 * 1024 * 1024;

/** Prílohy dokladu pripravené pre Resend a zoznam tých, čo sa nezmestili. */
export async function prilohyDoMailu(druh: DruhSPrilohou, companyId: string, dokladId: string) {
  const { data } = await (supabaseAdmin as any)
    .from(DRUHY_S_PRILOHAMI[druh].prilohy)
    .select("path, name, size")
    .eq("company_id", companyId)
    .eq(DRUHY_S_PRILOHAMI[druh].stlpec, dokladId)
    .order("created_at");

  const prilohy: { filename: string; content: string }[] = [];
  const vynechane: string[] = [];
  let spolu = 0;
  for (const p of data ?? []) {
    if (spolu + Number(p.size ?? 0) > STROP_PRILOH) {
      vynechane.push(p.name);
      continue;
    }
    const { data: subor } = await supabaseAdmin.storage
      .from("invoice-attachments")
      .download(p.path);
    if (!subor) {
      vynechane.push(p.name);
      continue;
    }
    const bajty = Buffer.from(await subor.arrayBuffer());
    spolu += bajty.length;
    prilohy.push({ filename: p.name, content: bajty.toString("base64") });
  }
  return { prilohy, vynechane };
}
