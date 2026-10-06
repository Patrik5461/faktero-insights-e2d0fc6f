import type { DruhCiselnika, ZaznamCiselnika } from "./predkontacie";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Klient = any;

/**
 * Zapíše číselník firmy.
 *
 * Zhoda je na (firma, druh, kód, agenda) — opakovaný import prepíše popis a
 * účty, nič nezdvojí. Pri úplnom zozname z Pohody sa kódy, ktoré tam už nie
 * sú, len vypnú (nemažú sa): doklady, ktoré ich nesú, ostanú čitateľné.
 * Ručne pridané záznamy sa nikdy nevypínajú.
 */
export async function ulozCiselnik(
  supabase: Klient,
  vstup: {
    companyId: string;
    zaznamy: ZaznamCiselnika[];
    zdroj: "pohoda" | "subor" | "rucne";
    /** Druhy, ktorých zoznam je úplný — čo v ňom chýba, sa vypne. */
    uplne?: DruhCiselnika[];
  },
): Promise<{ ulozenych: number; vypnutych: number }> {
  const teraz = new Date().toISOString();
  const riadky = vstup.zaznamy.map((z) => ({
    company_id: vstup.companyId,
    druh: z.druh,
    kod: z.kod,
    popis: z.popis,
    agenda: z.agenda ?? "",
    ucet_md: z.ucet_md,
    ucet_d: z.ucet_d,
    pohoda_id: z.pohoda_id,
    aktivne: z.aktivne,
    zdroj: vstup.zdroj,
    updated_at: teraz,
  }));

  for (let i = 0; i < riadky.length; i += 500) {
    const { error } = await supabase
      .from("predkontacie")
      .upsert(riadky.slice(i, i + 500), { onConflict: "company_id,druh,kod,agenda" });
    if (error) throw new Error(error.message);
  }

  let vypnutych = 0;
  for (const druh of vstup.uplne ?? []) {
    const pritomne = new Set(
      vstup.zaznamy.filter((z) => z.druh === druh).map((z) => `${z.kod}|${z.agenda}`),
    );
    if (!pritomne.size) continue;
    const { data: stare } = await supabase
      .from("predkontacie")
      .select("id, kod, agenda")
      .eq("company_id", vstup.companyId)
      .eq("druh", druh)
      .eq("zdroj", "pohoda")
      .eq("aktivne", true);
    const vypnut = (stare ?? [])
      .filter((r: { kod: string; agenda: string }) => !pritomne.has(`${r.kod}|${r.agenda}`))
      .map((r: { id: string }) => r.id);
    if (vypnut.length) {
      await supabase
        .from("predkontacie")
        .update({ aktivne: false, updated_at: teraz })
        .in("id", vypnut);
      vypnutych += vypnut.length;
    }
  }
  return { ulozenych: riadky.length, vypnutych };
}

/**
 * Odpoveď Pohody na žiadosť o číselníky — z konektora aj z nahratého súboru.
 * Vráti `null`, keď v odpovedi žiadne číselníky nie sú.
 */
export async function ulozCiselnikyZPohody(
  supabase: Klient,
  vstup: { companyId: string; xml: string },
): Promise<{ predkontacii: number; cleneni: number; vypnutych: number } | null> {
  const { rozoberCiselnikyPohody } = await import("./predkontacie");
  const zaznamy = rozoberCiselnikyPohody(vstup.xml);
  const maZoznam = /listAccounting(Double|Single)Entry\b|listClassificationVAT\b/.test(vstup.xml);
  if (!zaznamy.length && !maZoznam) return null;

  const r = await ulozCiselnik(supabase, {
    companyId: vstup.companyId,
    zaznamy,
    zdroj: "pohoda",
    uplne: ["predkontacia", "clenenie_dph"],
  });
  await supabase
    .from("companies")
    .update({ pohoda_nacitat_ciselniky: false, pohoda_ciselniky_nacitane_at: new Date().toISOString() })
    .eq("id", vstup.companyId);
  return {
    predkontacii: zaznamy.filter((z) => z.druh === "predkontacia").length,
    cleneni: zaznamy.filter((z) => z.druh === "clenenie_dph").length,
    vypnutych: r.vypnutych,
  };
}

/**
 * Kódy podľa kategórie nákladu z číselníka (stĺpec `kategoria`) — export ich
 * použije, keď doklad nemá vlastnú predkontáciu ani členenie.
 */
export async function kodyPodlaKategorie(
  supabase: Klient,
  companyId: string,
): Promise<Record<string, { predkontacia?: string | null; clenenie?: string | null }>> {
  const { data } = await supabase
    .from("predkontacie")
    .select("druh, kod, kategoria")
    .eq("company_id", companyId)
    .eq("aktivne", true)
    .not("kategoria", "is", null);
  const out: Record<string, { predkontacia?: string | null; clenenie?: string | null }> = {};
  for (const r of (data ?? []) as { druh: string; kod: string; kategoria: string }[]) {
    const k = String(r.kategoria ?? "").trim();
    if (!k) continue;
    out[k] = out[k] ?? {};
    if (r.druh === "predkontacia") out[k].predkontacia ??= r.kod;
    else out[k].clenenie ??= r.kod;
  }
  return out;
}
