/**
 * Strážca konektora do Pohody.
 *
 * Konektor je tichý zo svojej podstaty: keď funguje, nikto o ňom nevie. Lenže
 * keď účtovníčke vypnú počítač, zlyhá naplánovaná úloha alebo niekto zneplatní
 * kľúč, prestane chodiť **rovnako ticho** — a doklady sa hromadia týždne, kým si
 * to niekto všimne. Toto pošle firme e-mail, keď sa konektor dlhšie neozve.
 *
 * Upozorňuje sa len firma, ktorej konektor **už raz bežal**. Balíček stiahnutý a
 * odložený do zásuvky nie je porucha.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Riadok = any;

/** Po koľkých dňoch ticha sa ozveme. */
export const DNI_TICHA = 7;

/**
 * Ktoré firmy majú mlčiaci konektor.
 *
 * Rozhoduje sa tu, nie vo filtri: porovnáva sa čas posledného ozvania s časom
 * posledného upozornenia a to sú dva stĺpce z dvoch tabuliek.
 */
export function mlciaceFirmy(
  kluce: Riadok[],
  firmy: Riadok[],
  dnes: Date,
  dni: number = DNI_TICHA,
): { companyId: string; naposledy: string }[] {
  const hranica = new Date(dnes.getTime() - dni * 24 * 60 * 60 * 1000);

  // Firma môže mať kľúčov viac (každé stiahnutie balíčka vyrobí nový), takže
  // rozhoduje ten, ktorý sa ozval naposledy.
  const posledne = new Map<string, string>();
  for (const k of kluce) {
    if (k.revoked_at || !k.last_used_at) continue;
    const doteraz = posledne.get(String(k.company_id));
    if (!doteraz || String(k.last_used_at) > doteraz) {
      posledne.set(String(k.company_id), String(k.last_used_at));
    }
  }

  const von: { companyId: string; naposledy: string }[] = [];
  for (const f of firmy) {
    const naposledy = posledne.get(String(f.id));
    if (!naposledy) continue;
    if (new Date(naposledy) >= hranica) continue;
    // Druhýkrát sa ozveme až vtedy, keď konektor medzitým bežal a znovu stíchol.
    if (f.pohoda_konektor_upozorneny_at && String(f.pohoda_konektor_upozorneny_at) > naposledy) {
      continue;
    }
    von.push({ companyId: String(f.id), naposledy });
  }
  return von;
}

function dniOd(naposledy: string, dnes: Date): number {
  return Math.floor((dnes.getTime() - new Date(naposledy).getTime()) / (24 * 60 * 60 * 1000));
}

async function posliMail(opts: { to: string; firma: string; dni: number; naposledy: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Odosielanie e-mailov nie je nastavené");

  const kedy = new Date(opts.naposledy).toLocaleString("sk-SK");
  const text = [
    `Dobrý deň,`,
    ``,
    `prepojenie s programom POHODA sa neozvalo už ${opts.dni} dní — naposledy ${kedy}.`,
    ``,
    `Doklady sa medzitým nikam nestratili, čakajú a odídu hneď, ako sa spojenie obnoví. Kým to trvá, účtovníčka ich v Pohode nemá.`,
    ``,
    `Čo býva príčinou:`,
    `• počítač s Pohodou je vypnutý v čase, keď má prenos bežať,`,
    `• naplánovaná úloha vo Windows sa zrušila alebo neprebehla,`,
    `• zmenilo sa heslo do Pohody alebo názov databázy.`,
    ``,
    `Účtovníčka nájde odpoveď v súbore protokol.txt v priečinku s prepojením. Podrobnosti sú na https://www.faktero.sk/pomoc/pohoda`,
    ``,
    `Faktero`,
  ].join("\n");

  const odpoved = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: `Faktero <${process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk"}>`,
      to: [opts.to],
      subject: `Prepojenie s Pohodou sa neozýva (${opts.firma})`,
      text,
      html: `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;white-space:pre-wrap">${text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")}</div>`,
    }),
  });
  if (!odpoved.ok) throw new Error(`Odoslanie zlyhalo: ${(await odpoved.text()).slice(0, 300)}`);
}

export type VysledokStrazcu = {
  kontrolovanych: number;
  mlciacich: number;
  odoslanych: number;
  chyb: number;
  detaily: { firma: string; stav: string }[];
};

export async function runStrazcaKonektora(vstup?: {
  dni?: number;
  dnes?: Date;
}): Promise<VysledokStrazcu> {
  const dnes = vstup?.dnes ?? new Date();
  const dni = vstup?.dni ?? DNI_TICHA;

  const { data: kluce } = await supabaseAdmin
    .from("api_keys")
    .select("company_id, last_used_at, revoked_at, name")
    .like("name", "Pohoda — konektor%");

  const firmyIds = [...new Set((kluce ?? []).map((k: Riadok) => String(k.company_id)))];
  if (!firmyIds.length) {
    return { kontrolovanych: 0, mlciacich: 0, odoslanych: 0, chyb: 0, detaily: [] };
  }

  const { data: firmy } = await supabaseAdmin
    .from("companies")
    .select("id, name, email, created_by, pohoda_konektor_upozorneny_at, suspended_at")
    .in("id", firmyIds)
    .is("suspended_at", null);

  const mlciace = mlciaceFirmy(kluce ?? [], firmy ?? [], dnes, dni);
  const podlaId = new Map((firmy ?? []).map((f: Riadok) => [String(f.id), f]));

  let odoslanych = 0;
  let chyb = 0;
  const detaily: { firma: string; stav: string }[] = [];

  for (const m of mlciace) {
    const firma: Riadok = podlaId.get(m.companyId);
    const nazov = String(firma?.name ?? "firma");
    try {
      // Adresa firmy, inak e-mail toho, kto ju založil — upozornenie patrí
      // majiteľovi, nie účtovníčke: on rozhodne, či niekomu zavolá.
      let adresa = String(firma?.email ?? "").trim();
      if (!adresa && firma?.created_by) {
        const { data: profil } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .eq("id", firma.created_by)
          .maybeSingle();
        adresa = String(profil?.email ?? "").trim();
      }
      if (!adresa) {
        detaily.push({ firma: nazov, stav: "bez adresy" });
        continue;
      }

      await posliMail({
        to: adresa,
        firma: nazov,
        dni: dniOd(m.naposledy, dnes),
        naposledy: m.naposledy,
      });
      await supabaseAdmin
        .from("companies")
        .update({ pohoda_konektor_upozorneny_at: dnes.toISOString() })
        .eq("id", m.companyId);

      odoslanych++;
      detaily.push({ firma: nazov, stav: "upozornené" });
    } catch (e) {
      chyb++;
      detaily.push({ firma: nazov, stav: e instanceof Error ? e.message : "chyba" });
    }
  }

  return {
    kontrolovanych: firmyIds.length,
    mlciacich: mlciace.length,
    odoslanych,
    chyb,
    detaily,
  };
}
