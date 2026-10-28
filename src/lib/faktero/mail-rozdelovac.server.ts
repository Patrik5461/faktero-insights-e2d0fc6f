/**
 * Rozdeľovač dokladov (ako v Doklado).
 *
 * Používateľ má jednu adresu a jedno miesto na nahratie pre všetky svoje
 * firmy. Každý doklad prečíta AI a podľa odberateľa (IČO, IČ DPH, DIČ,
 * prípadne IBAN platiteľa či názov) ho pošle do Nespracovaných tej firmy,
 * kde smie používateľ zapisovať doklady. Čo nesedí na žiadnu alebo na viac,
 * čaká v zozname nezaradených na ručné priradenie — doklad sa nezaloží
 * naslepo do nesprávnej firmy.
 *
 * Bezpečnosť: všetko tu ide cez `supabaseAdmin` (webhook nemá prihláseného
 * používateľa), preto sa firmy berú výhradne z `firmyPouzivatela` — členstvo
 * v `company_users` s právom zapisovať doklady — a nikdy z údajov dokladu.
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
import {
  dovodNepriradenia,
  poznamkaRozdelovaca,
  smieZapisovatDoklady,
  vyberFirmuPodlaOdberatela,
  type FirmaNaRozdelenie,
} from "./mail-rozdelovac";

const MAX_PRILOH = 15;
const MAX_BAJTOV = 15 * 1024 * 1024;
/** Kôš pre súbory nahraté do rozdeľovača — bez politík, len servisná rola. */
export const KOS_ROZDELOVACA = "rozdelovac";

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

/**
 * Firmy, do ktorých smie rozdeľovač tomuto používateľovi dávať doklady:
 * členstvo s právom zapisovať doklady (rovnaké pravidlo ako
 * `firmy_s_pravom('doklady', true)`), s IBAN-mi firmy aj jej účtov.
 */
export async function firmyPouzivatela(
  supabaseAdmin: any,
  userId: string,
): Promise<FirmaNaRozdelenie[]> {
  const { data: clenstva } = await supabaseAdmin
    .from("company_users")
    .select("company_id, role, permissions")
    .eq("user_id", userId);
  const ids = ((clenstva ?? []) as any[])
    .filter((c) => smieZapisovatDoklady(c.role, c.permissions))
    .map((c) => c.company_id as string);
  if (!ids.length) return [];
  const [{ data: firmy }, { data: ucty }] = await Promise.all([
    supabaseAdmin.from("companies").select("id, name, ico, dic, ic_dph, iban").in("id", ids),
    supabaseAdmin.from("bank_accounts").select("company_id, iban").in("company_id", ids),
  ]);
  return ((firmy ?? []) as any[]).map((f) => ({
    id: f.id,
    name: f.name ?? null,
    ico: f.ico ?? null,
    ic_dph: f.ic_dph ?? null,
    dic: f.dic ?? null,
    ibany: [
      f.iban,
      ...((ucty ?? []) as any[]).filter((u) => u.company_id === f.id).map((u) => u.iban),
    ].filter(Boolean) as string[],
  }));
}

/** Overí, že firma je medzi tými, kam smie používateľ cez rozdeľovač zapisovať. */
export async function overFirmuRozdelovaca(supabaseAdmin: any, userId: string, companyId: string) {
  const firmy = await firmyPouzivatela(supabaseAdmin, userId);
  if (!firmy.some((f) => f.id === companyId))
    throw new Error("Na doklady v tejto firme nemáte oprávnenie.");
}

/** Čo o doklade ukázať v zozname nezaradených. */
function opisPrilohy(
  id: string,
  nazov: string | null,
  ai: Record<string, unknown> | null,
  firmy: FirmaNaRozdelenie[],
) {
  const v = vyberFirmuPodlaOdberatela(ai, firmy);
  return {
    id,
    nazov,
    odberatel: (ai?.buyer_name as string) ?? null,
    ico: (ai?.buyer_ico as string) ?? null,
    ic_dph: (ai?.buyer_ic_dph as string) ?? null,
    dodavatel: (ai?.supplier_name as string) ?? null,
    suma: (ai?.amount_total as number) ?? null,
    mena: (ai?.currency as string) ?? null,
    dovod: dovodNepriradenia(v),
    kandidati: v.kandidati,
  };
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
      zdroj: "mail",
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

    const firmy = await firmyPouzivatela(supabaseAdmin, userId);
    if (!firmy.length) {
      await nepriradene([], "Nemáte žiadnu firmu, v ktorej smiete zapisovať doklady.", "chyba");
      return { stav: "odmietnute", vytvorenych: 0 };
    }

    const vsetky = await prilohyMailu(mail.email_id, apiKey);
    const doklady = vsetky
      .filter((p) => jePrilohaDoklad(p.content_type, p.filename, p.size))
      .slice(0, MAX_PRILOH);
    if (!doklady.length) {
      await nepriradene([], "Mail neobsahoval PDF ani fotku dokladu.", "chyba");
      return { stav: "bez_prilohy", vytvorenych: 0 };
    }

    const predcitane = new Map<string, PredcitanaPriloha>();
    const podlaFirmy = new Map<string, { prilohy: string[]; poznamka: string }>();
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
      const v = vyberFirmuPodlaOdberatela(ai, firmy);
      if (v.firma) {
        // Jedna firma môže dostať doklady zaradené podľa rôznych údajov — v poznámke stačí prvý.
        const uz = podlaFirmy.get(v.firma.id);
        if (uz) uz.prilohy.push(p.id);
        else
          podlaFirmy.set(v.firma.id, { prilohy: [p.id], poznamka: poznamkaRozdelovaca(v.podla) });
      } else nesediace.push(opisPrilohy(p.id, p.filename ?? null, ai, firmy));
    }

    let vytvorenych = 0;
    const detaily: string[] = [];
    for (const [companyId, { prilohy: lenPrilohy, poznamka }] of podlaFirmy) {
      const adresa = await adresaFirmyPouzivatela(supabaseAdmin, companyId, userId);
      // Rovnaké pravidlá ako pri adrese firmy (povolení odosielatelia, typy, veľkosť).
      const v = await spracujPrijatyMail(mail, {
        adresa: { ...adresa, active: true },
        lenPrilohy,
        predcitane,
        rozdelovac: { poznamka },
      });
      vytvorenych += v.vytvorenych;
      const meno = firmy.find((f) => f.id === companyId)?.name ?? "firma";
      detaily.push(`${meno}: ${v.vytvorenych}`);
    }
    if (nesediace.length) {
      await nepriradene(
        nesediace,
        nesediace.length === 1
          ? String(nesediace[0]!.dovod)
          : `${nesediace.length} dokladov čaká na výber firmy.`,
      );
      detaily.push(`nepriradené: ${nesediace.length}`);
    }
    return {
      stav: vytvorenych || nesediace.length ? "hotovo" : "chyba",
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

/**
 * Založí z nahratého súboru nespracovaný doklad vo firme a súbor z koša
 * rozdeľovača zmaže. Firmu musí volajúci overiť (`firmyPouzivatela`).
 */
async function doFirmy(
  supabaseAdmin: any,
  r: {
    id: string;
    user_id: string;
    file_path: string;
    file_name: string | null;
    file_mime: string | null;
    ai: any;
  },
  companyId: string,
  poznamka: string,
): Promise<string> {
  const { isCompanyActive } = await import("./active-check.server");
  if (!(await isCompanyActive(companyId)))
    throw new Error("Predplatné vybranej firmy nie je aktívne.");
  const { data: subor, error } = await supabaseAdmin.storage
    .from(KOS_ROZDELOVACA)
    .download(r.file_path);
  if (error || !subor) throw new Error("Súbor sa nepodarilo načítať.");
  const bajty = Buffer.from(await subor.arrayBuffer());
  const { zalozNespracovany, vytazNespracovany } = await import("./nespracovane.server");
  const n = await zalozNespracovany(supabaseAdmin, {
    companyId,
    userId: r.user_id,
    zdroj: "nahratie",
    bajty,
    nazov: r.file_name,
    mime: r.file_mime ?? "application/pdf",
    // Bez prečítaných údajov ho vyťaží bežné čítanie v Nespracovaných.
    ...(r.ai ? { ai: r.ai } : {}),
    poznamka: r.ai ? poznamka : null,
    cezRozdelovac: true,
  });
  if (!r.ai) void vytazNespracovany(n.id);
  await supabaseAdmin.storage.from(KOS_ROZDELOVACA).remove([r.file_path]);
  await supabaseAdmin
    .from("mail_nepriradene")
    .update({ status: "priradene", company_id: companyId, file_path: null, detail: null })
    .eq("id", r.id);
  return n.id;
}

/**
 * Nahratý súbor (beží na pozadí, AI číta aj desiatky sekúnd): prečíta ho,
 * a keď odberateľ sedí na práve jednu firmu, pošle ho do jej Nespracovaných.
 */
export async function rozdelNahraty(id: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: r } = await supabaseAdmin
    .from("mail_nepriradene")
    .select("id, user_id, file_path, file_name, file_mime, ai")
    .eq("id", id)
    .eq("zdroj", "nahratie")
    .maybeSingle();
  if (!r?.file_path) return;
  try {
    const { data: subor, error } = await supabaseAdmin.storage
      .from(KOS_ROZDELOVACA)
      .download(r.file_path);
    if (error || !subor) throw new Error("Súbor sa nepodarilo načítať.");
    const bajty = Buffer.from(await subor.arrayBuffer());
    const ai = await precitajDoklad(bajty.toString("base64"), r.file_mime ?? "application/pdf");
    const firmy = await firmyPouzivatela(supabaseAdmin, r.user_id);
    const v = vyberFirmuPodlaOdberatela(ai, firmy);
    const opis = opisPrilohy("subor", r.file_name, ai, firmy);
    if (v.firma && maPouzitelneUdaje(ai)) {
      try {
        await doFirmy(
          supabaseAdmin,
          { ...r, file_path: r.file_path, ai },
          v.firma.id,
          poznamkaRozdelovaca(v.podla),
        );
        await supabaseAdmin
          .from("mail_nepriradene")
          .update({ prilohy: [opis] as any, ai: ai as any })
          .eq("id", r.id);
        return;
      } catch (e: any) {
        await supabaseAdmin
          .from("mail_nepriradene")
          .update({
            status: "caka",
            ai: ai as any,
            prilohy: [opis] as any,
            detail: String(e?.message ?? e).slice(0, 300),
          })
          .eq("id", r.id);
        return;
      }
    }
    await supabaseAdmin
      .from("mail_nepriradene")
      .update({
        status: "caka",
        ai: ai as any,
        prilohy: [opis] as any,
        detail: maPouzitelneUdaje(ai)
          ? opis.dovod
          : "Z dokladu sa nedalo prečítať, komu patrí — vyberte firmu.",
      })
      .eq("id", r.id);
  } catch (e: any) {
    await supabaseAdmin
      .from("mail_nepriradene")
      .update({
        status: "caka",
        prilohy: [{ id: "subor", nazov: r.file_name }] as any,
        detail: String(e?.message ?? e).slice(0, 300),
      })
      .eq("id", r.id);
  }
}

/** Ručné priradenie nahratého súboru. Prístup k firme overil volajúci aj tu. */
export async function priradNahraty(
  id: string,
  userId: string,
  companyId: string,
): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await overFirmuRozdelovaca(supabaseAdmin, userId, companyId);
  const { data: r } = await supabaseAdmin
    .from("mail_nepriradene")
    .select("id, user_id, file_path, file_name, file_mime, ai")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("zdroj", "nahratie")
    .maybeSingle();
  if (!r?.file_path) throw new Error("Súbor sa nenašiel.");
  return doFirmy(
    supabaseAdmin,
    { ...r, file_path: r.file_path },
    companyId,
    poznamkaRozdelovaca(null),
  );
}

/** Zahodenie nahratého súboru — zmaže ho aj z koša. */
export async function zahodNahraty(supabaseAdmin: any, r: { file_path: string | null }) {
  if (r.file_path) await supabaseAdmin.storage.from(KOS_ROZDELOVACA).remove([r.file_path]);
}
