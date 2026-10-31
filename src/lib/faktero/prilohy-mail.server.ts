import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DRUHY_S_PRILOHAMI, type DruhSPrilohou } from "./faktura-prilohy";

/**
 * Resend berie celú správu do 40 MB, a to je spolu s PDF dokladu aj s
 * nárastom pri base64 — preto strop na súčet príloh. Čo sa nezmestí, sa
 * vynechá a povie sa to, než by mail neodišiel vôbec.
 */
export const STROP_PRILOH = 20 * 1024 * 1024;

/**
 * Prílohy dokladu pripravené pre Resend a zoznam tých, čo sa nezmestili.
 * Na tie nezmestené vráti aj podpísaný odkaz (platí 30 dní), ktorý ide do
 * textu mailu — príjemca si ich stiahne bez prihlásenia.
 */
export async function prilohyDoMailu(druh: DruhSPrilohou, companyId: string, dokladId: string) {
  const { data } = await (supabaseAdmin as any)
    .from(DRUHY_S_PRILOHAMI[druh].prilohy)
    .select("id, path, name, size")
    .eq("company_id", companyId)
    .eq(DRUHY_S_PRILOHAMI[druh].stlpec, dokladId)
    .order("created_at");

  const prilohy: { filename: string; content: string }[] = [];
  const vynechane: string[] = [];
  const vynechaneId: string[] = [];
  let spolu = 0;
  for (const p of data ?? []) {
    if (spolu + Number(p.size ?? 0) > STROP_PRILOH) {
      vynechane.push(p.name);
      vynechaneId.push(p.id);
      continue;
    }
    const { data: subor } = await supabaseAdmin.storage
      .from("invoice-attachments")
      .download(p.path);
    if (!subor) {
      vynechane.push(p.name);
      vynechaneId.push(p.id);
      continue;
    }
    const bajty = Buffer.from(await subor.arrayBuffer());
    spolu += bajty.length;
    prilohy.push({ filename: p.name, content: bajty.toString("base64") });
  }
  let odkaz: { url: string; platiDo: Date } | null = null;
  if (vynechaneId.length && (druh === "invoice" || druh === "quote" || druh === "sales_order")) {
    const { odkazNaPrilohy } = await import("./prilohy-odkaz.server");
    odkaz = odkazNaPrilohy(druh, dokladId, vynechaneId);
  }
  return { prilohy, vynechane, odkaz };
}

const TEXTY_ODKAZU = {
  sk: {
    uvod: "Niektoré prílohy sú na e-mail príliš veľké. Stiahnete si ich tu (odkaz platí do {datum}):",
    tlacidlo: "Stiahnuť prílohy",
  },
  cs: {
    uvod: "Některé přílohy jsou pro e-mail příliš velké. Stáhnete si je zde (odkaz platí do {datum}):",
    tlacidlo: "Stáhnout přílohy",
  },
  de: {
    uvod: "Einige Anhänge sind für die E-Mail zu groß. Sie können sie hier herunterladen (Link gültig bis {datum}):",
    tlacidlo: "Anhänge herunterladen",
  },
  en: {
    uvod: "Some attachments are too large for e-mail. You can download them here (link valid until {datum}):",
    tlacidlo: "Download attachments",
  },
} as const;

function escHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Odstavec s odkazom na veľké prílohy — text aj HTML, v jazyku dokladu. */
export function odkazNaPrilohyDoMailu(
  odkaz: { url: string; platiDo: Date } | null,
  jazyk: string | null | undefined,
): { text: string; html: string } {
  if (!odkaz) return { text: "", html: "" };
  const tx = TEXTY_ODKAZU[(jazyk ?? "sk") as keyof typeof TEXTY_ODKAZU] ?? TEXTY_ODKAZU.sk;
  const datum = odkaz.platiDo.toLocaleDateString(jazyk === "en" ? "en-GB" : "sk-SK", {
    timeZone: "Europe/Bratislava",
  });
  const uvod = tx.uvod.replace("{datum}", datum);
  return {
    text: `\n\n${uvod}\n${odkaz.url}`,
    html: `<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:Inter,Arial,sans-serif;font-size:14px;color:#111">
      <p style="margin:0 0 10px">${escHtml(uvod)}</p>
      <a href="${escHtml(odkaz.url)}" style="display:inline-block;background:#12734f;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">${escHtml(tx.tlacidlo)}</a>
      <p style="margin:8px 0 0;font-size:12px;color:#6b7280;word-break:break-all"><a href="${escHtml(odkaz.url)}" style="color:#12734f">${escHtml(odkaz.url)}</a></p>
    </div>`,
  };
}
