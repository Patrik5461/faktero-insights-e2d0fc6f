/**
 * Rozdeľovač dokladov (ako v Doklado).
 *
 * Používateľ má jednu adresu pre všetky svoje firmy. Každú prílohu prečíta AI
 * a podľa IČO (prípadne IČ DPH) odberateľa ju pošle firme, ktorej je členom.
 * Čo na žiadnu jeho firmu nesedí, čaká v zozname nepriradených na ručné
 * priradenie — doklad sa nezaloží naslepo do nesprávnej firmy.
 */
import { jePrilohaDoklad, maPouzitelneUdaje, zostavLocalPart } from "./mail-prijem";
import {
  precitajDoklad,
  prilohyMailu,
  spracujPrijatyMail,
  stiahniPrilohu,
  type PredcitanaPriloha,
  type PrijatyMail,
  type VysledokPrijmu,
} from "./mail-prijem.server";
import { firmaPodlaOdberatela, type FirmaNaRozdelenie } from "./mail-rozdelovac";

const MAX_PRILOH = 15;
const MAX_BAJTOV = 15 * 1024 * 1024;

/** Adresa firmy pre používateľa; keď ju ešte nemá, založí sa (ako pri prvom otvorení). */
export async function adresaFirmyPouzivatela(
  supabaseAdmin: any,
  companyId: string,
  userId: string,
) {
  const { data } = await supabaseAdmin
    .from("inbox_addresses")
    .select("id, company_id, user_id, active")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return data as { id: string; company_id: string; user_id: string; active: boolean };
  const { data: firma } = await supabaseAdmin
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .maybeSingle();
  for (let pokus = 0; pokus < 5; pokus++) {
    const { data: nova, error } = await supabaseAdmin
      .from("inbox_addresses")
      .insert({
        company_id: companyId,
        user_id: userId,
        local_part: zostavLocalPart(firma?.name ?? "firma"),
      })
      .select("id, company_id, user_id, active")
      .single();
    if (!error) return nova as { id: string; company_id: string; user_id: string; active: boolean };
  }
  throw new Error("Adresu firmy sa nepodarilo založiť.");
}

export async function firmyPouzivatela(
  supabaseAdmin: any,
  userId: string,
): Promise<FirmaNaRozdelenie[]> {
  const { data: clenstva } = await supabaseAdmin
    .from("company_users")
    .select("company_id")
    .eq("user_id", userId);
  const ids = (clenstva ?? []).map((c: any) => c.company_id);
  if (!ids.length) return [];
  const { data } = await supabaseAdmin
    .from("companies")
    .select("id, name, ico, ic_dph")
    .in("id", ids);
  return (data ?? []) as FirmaNaRozdelenie[];
}

export async function rozdelMail(mail: PrijatyMail, userId: string): Promise<VysledokPrijmu> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("mail_rozdelovace")
    .update({ last_received_at: new Date().toISOString() })
    .eq("user_id", userId);

  const odosielatel = (mail.from ?? "").trim() || null;
  const predmet = (mail.subject ?? "").trim() || null;
  async function nepriradene(prilohy: unknown[], detail: string | null, status = "caka") {
    await supabaseAdmin.from("mail_nepriradene").insert({
      user_id: userId,
      provider_email_id: mail.email_id,
      from_email: odosielatel,
      subject: predmet,
      prilohy: prilohy as any,
      detail,
      status,
    });
  }

  try {
    const apiKey = (process.env.RESEND_INBOUND_API_KEY || process.env.RESEND_API_KEY)?.trim();
    if (!apiKey) throw new Error("RESEND_INBOUND_API_KEY ani RESEND_API_KEY nie je nastavený");

    const { poskytovatelPotvrdenia } = await import("./mail-potvrdenie");
    if (poskytovatelPotvrdenia(odosielatel)) {
      // Preposielanie sa potvrdzuje pri adrese firmy; na rozdeľovač ho nemá kam dať.
      await nepriradene(
        [],
        "Potvrdenie preposielania prišlo na rozdeľovač — preposielanie nastavte na adresu firmy, alebo kód nájdete v pôvodnom maile.",
        "chyba",
      );
      return { stav: "potvrdenie", vytvorenych: 0 };
    }

    const vsetky = await prilohyMailu(mail.email_id, apiKey);
    const doklady = vsetky
      .filter((p) => jePrilohaDoklad(p.content_type, p.filename, p.size))
      .slice(0, MAX_PRILOH);
    if (!doklady.length) {
      await nepriradene([], "Mail neobsahoval PDF ani fotku dokladu.", "chyba");
      return { stav: "bez_prilohy", vytvorenych: 0 };
    }

    const firmy = await firmyPouzivatela(supabaseAdmin, userId);
    const predcitane = new Map<string, PredcitanaPriloha>();
    const podlaFirmy = new Map<string, string[]>();
    const nesediace: Array<Record<string, unknown>> = [];

    for (const p of doklady) {
      if ((p.size ?? 0) > MAX_BAJTOV) continue;
      const s = await stiahniPrilohu(p);
      if ("chyba" in s || s.bajty.length > MAX_BAJTOV) continue;
      const mime = (p.content_type ?? "application/pdf").split(";")[0]!.trim();
      const ai = await precitajDoklad(s.bajty.toString("base64"), mime);
      predcitane.set(p.id, { bajty: s.bajty, ai });
      // Logo či podpis nikomu nepatrí — nech ho zahodí bežné spracovanie, nie zoznam nepriradených.
      if (!maPouzitelneUdaje(ai)) continue;
      const firma = firmaPodlaOdberatela(ai, firmy);
      if (firma) podlaFirmy.set(firma.id, [...(podlaFirmy.get(firma.id) ?? []), p.id]);
      else
        nesediace.push({
          id: p.id,
          nazov: p.filename ?? null,
          odberatel: ai?.buyer_name ?? null,
          ico: ai?.buyer_ico ?? null,
          ic_dph: ai?.buyer_ic_dph ?? null,
          dodavatel: ai?.supplier_name ?? null,
          suma: ai?.amount_total ?? null,
          mena: ai?.currency ?? null,
        });
    }

    let vytvorenych = 0;
    const detaily: string[] = [];
    for (const [companyId, lenPrilohy] of podlaFirmy) {
      const adresa = await adresaFirmyPouzivatela(supabaseAdmin, companyId, userId);
      const v = await spracujPrijatyMail(mail, {
        adresa: { ...adresa, active: true },
        lenPrilohy,
        predcitane,
      });
      vytvorenych += v.vytvorenych;
      const meno = firmy.find((f) => f.id === companyId)?.name ?? "firma";
      detaily.push(`${meno}: ${v.vytvorenych}`);
    }
    if (nesediace.length) {
      await nepriradene(
        nesediace,
        nesediace.length === 1
          ? "Odberateľ na doklade nesedí na žiadnu z vašich firiem."
          : `${nesediace.length} dokladov — odberateľ nesedí na žiadnu z vašich firiem.`,
      );
      detaily.push(`nepriradené: ${nesediace.length}`);
    }
    return {
      stav: vytvorenych ? "hotovo" : "chyba",
      vytvorenych,
      detail: detaily.join("; ") || undefined,
    };
  } catch (e: any) {
    const detail = String(e?.message ?? e).slice(0, 300);
    console.error("[rozdelovac] zlyhalo:", detail);
    await nepriradene([], detail, "chyba");
    return { stav: "chyba", vytvorenych: 0, detail };
  }
}
