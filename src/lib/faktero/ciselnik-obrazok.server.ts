/*
  Import číselníka zo screenshotu — volanie AI a zápis do `predkontacie`.

  Všetko ide klientom prihláseného (RLS a role rozhodnú, kto smie meniť).
  Pravidlá zápisu sú v `ciselnik-obrazok.ts` (`planUlozenia`); kód
  existujúcich importov (konektor, súbor, ručne) sa tu nepoužíva ani nemení.
*/

import {
  pokynPreAi,
  rozoberOdpovedAi,
  planUlozenia,
  SCHEMA_ODPOVEDE,
  type DruhZObrazka,
  type ExistujuciZaznam,
  type RiadokZObrazka,
} from "./ciselnik-obrazok";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Klient = any;

/** Účel volania v meraní AI (`ai_pouzitie`, `NAZOV_UCELU`). */
export const UCEL_AI = "ciselnik-obrazok";

/**
 * Prečíta jeden obrázok. `vision` sa dá podstrčiť (testy, preview) — inak
 * ide cez spoločnú cestu `aiVision` (Gemini, náhradne OpenAI) s meraním.
 */
export async function rozpoznajObrazokCiselnika(vstup: {
  base64: string;
  mime: string;
  druh: DruhZObrazka | "auto";
  firma?: string | null;
  vision?: (base64: string, mime: string, pokyn: string) => Promise<string>;
}): Promise<{ druh: DruhZObrazka; riadky: RiadokZObrazka[]; vynechanych: number }> {
  const pokyn = pokynPreAi(vstup.druh);
  const vision =
    vstup.vision ??
    (async (b: string, m: string, p: string) => {
      const { aiVision } = await import("./ai.server");
      return aiVision(b, m, p, {
        json: true,
        schema: SCHEMA_ODPOVEDE,
        ucel: UCEL_AI,
        firma: vstup.firma ?? null,
        maxOutputTokens: 8000,
      });
    });
  const text = await vision(vstup.base64, vstup.mime, pokyn);
  return rozoberOdpovedAi(text, vstup.druh);
}

const STLPCE = "id, druh, kod, agenda, popis, kategoria, ucet_md, ucet_d, typ_dokladu, zdroj";

/** Záznamy firmy daného druhu (všetky agendy) — na párovanie podľa kódu. */
export async function existujuceZaznamy(
  sb: Klient,
  companyId: string,
  druh: DruhZObrazka,
): Promise<ExistujuciZaznam[]> {
  const { vsetkyRiadky } = await import("./strankovanie");
  const riadky = await vsetkyRiadky<ExistujuciZaznam>((od, po) =>
    sb
      .from("predkontacie")
      .select(STLPCE)
      .eq("company_id", companyId)
      .eq("druh", druh)
      .order("id")
      .range(od, po),
  );
  return riadky.map((r) => ({ ...r, agenda: r.agenda ?? "", kod: String(r.kod) }));
}

/**
 * Uloží vybrané riadky: nové založí (zdroj 'obrazok'), existujúce doplní.
 * Vloženie ide s `ignoreDuplicates` — keby kód medzitým pribudol (napr.
 * konektorom z Pohody), neprepíše sa.
 */
export async function ulozCiselnikZObrazka(
  sb: Klient,
  vstup: { companyId: string; druh: DruhZObrazka; riadky: (RiadokZObrazka & { prepisat?: boolean })[] },
): Promise<{ novych: number; zmenenych: number; preskocenych: number; chranenych: number; neplatnych: number }> {
  const existujuce = await existujuceZaznamy(sb, vstup.companyId, vstup.druh);
  const plan = planUlozenia(vstup.companyId, vstup.druh, vstup.riadky, existujuce);
  const teraz = new Date().toISOString();

  let novych = 0;
  for (let i = 0; i < plan.vlozit.length; i += 500) {
    const davka = plan.vlozit.slice(i, i + 500).map((r) => ({ ...r, updated_at: teraz }));
    const { data, error } = await sb
      .from("predkontacie")
      .upsert(davka, { onConflict: "company_id,druh,kod,agenda", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);
    novych += (data ?? []).length;
  }

  let zmenenych = 0;
  for (const u of plan.upravit) {
    // Zdroj, aktívnosť ani agenda sa nemenia — len polia prečítané z obrázka.
    const { error } = await sb
      .from("predkontacie")
      .update({ ...u.zmeny, updated_at: teraz })
      .eq("id", u.id)
      .eq("company_id", vstup.companyId);
    if (error) throw new Error(error.message);
    zmenenych++;
  }

  return {
    novych,
    zmenenych,
    preskocenych: plan.preskocene.length + (plan.vlozit.length - novych),
    chranenych: plan.preskocene.filter((p) => p.dovod === "chraneny").length,
    neplatnych: plan.preskocene.filter((p) => p.dovod === "neplatny").length,
  };
}
