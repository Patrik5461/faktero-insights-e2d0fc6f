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
): Promise<{ predkontacii: number; cleneni: number; ostatnych: number; vypnutych: number } | null> {
  const { rozoberCiselnikyPohody } = await import("./predkontacie");
  const zaznamy = rozoberCiselnikyPohody(vstup.xml);
  const maZoznam =
    /listAccounting(Double|Single)Entry\b|listClassificationVAT\b|listCentre\b|listActivity\b|listNumericalSeries\b/.test(
      vstup.xml,
    );
  if (!zaznamy.length && !maZoznam) return null;

  const r = await ulozCiselnik(supabase, {
    companyId: vstup.companyId,
    zaznamy,
    zdroj: "pohoda",
    uplne: ["predkontacia", "clenenie_dph", "stredisko", "cinnost", "ciselny_rad"],
  });
  await supabase
    .from("companies")
    .update({ pohoda_nacitat_ciselniky: false, pohoda_ciselniky_nacitane_at: new Date().toISOString() })
    .eq("id", vstup.companyId);
  return {
    predkontacii: zaznamy.filter((z) => z.druh === "predkontacia").length,
    cleneni: zaznamy.filter((z) => z.druh === "clenenie_dph").length,
    // Strediská, činnosti a číselné rady.
    ostatnych: zaznamy.filter((z) => !["predkontacia", "clenenie_dph"].includes(z.druh)).length,
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

/**
 * Nastavenia exportu prijatých dokladov, ktoré sa skladajú z firmy aj z
 * databázy: číselné rady, stredisko, kódy podľa kategórie, zákazky a odkazy
 * na sken. Jedno miesto pre konektor, balík aj ručný export.
 */
export async function nastaveniaDokladov(
  supabase: Klient,
  company: Record<string, any>,
  doklady: Record<string, any>[],
): Promise<Record<string, unknown>> {
  const { zakladnaAdresa } = await import("./pohoda-konektor.server");
  const out: Record<string, unknown> = {
    stredisko: company.pohoda_stredisko,
    radPrijate: company.pohoda_rad_prijate,
    radDoklady: company.pohoda_rad_doklady,
    radPokladna: company.pohoda_rad_pokladna,
    radInterne: company.pohoda_rad_interne,
    podlaKategorie: await kodyPodlaKategorie(supabase, company.id),
    zamknuteDo: company.locked_until ?? null,
    polozkyBlockov: Boolean(company.pohoda_polozky_blockov),
  };
  // Predkontácie s agendou Ostatné záväzky — faktúra s nimi ide ako záväzok.
  const { data: zavazky } = await supabase
    .from("predkontacie")
    .select("kod")
    .eq("company_id", company.id)
    .eq("druh", "predkontacia")
    .eq("agenda", "commitment")
    .eq("aktivne", true);
  out.zavazkovePredkontacie = (zavazky ?? []).map((r: any) => String(r.kod));
  out.pomeryPredkontacii = await pomeryPredkontacii(supabase, company.id);

  // Zákazka ide len vtedy, keď ich firma do Pohody posiela — inak by doklad
  // ukázal na zákazku, ktorú Pohoda nepozná, a import by ho odmietol.
  const jobIds = [...new Set(doklady.map((d) => d.job_id).filter(Boolean))];
  if (company.pohoda_posielat_zakazky && jobIds.length) {
    const { data } = await supabase.from("jobs").select("id, job_number").in("id", jobIds);
    out.zakazkyDokladov = Object.fromEntries(
      (data ?? [])
        .filter((j: any) => j.job_number)
        .map((j: any) => [String(j.id), String(j.job_number).slice(0, 12)]),
    );
  }

  // Odkaz na sken do záložky Dokumenty — krátky, s náhodným tokenom.
  if (company.pohoda_odkaz_na_doklady !== false) {
    const zaklad = zakladnaAdresa();
    const odkazy: Record<string, string> = {};
    for (const d of doklady) {
      if (!d.file_path || !d.id) continue;
      const tabulka = d._typPohody ? "purchase_invoices" : "expense_documents";
      let token = d.pdf_token as string | null;
      if (!token) {
        token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
        const { error } = await supabase.from(tabulka).update({ pdf_token: token }).eq("id", d.id);
        if (error) continue;
      }
      odkazy[String(d.id)] = `${zaklad}/api/public/doklad/${token}`;
    }
    out.odkazyDokladov = odkazy;
  }
  return out;
}


/** Predkontácie s účtovaním pomerom: kód → pomer (pre export aj výkazy DPH). */
export async function pomeryPredkontacii(
  supabase: Klient,
  companyId: string,
): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from("predkontacie")
    .select("kod, pomer")
    .eq("company_id", companyId)
    .eq("druh", "predkontacia")
    .eq("aktivne", true)
    .not("pomer", "is", null);
  return Object.fromEntries((data ?? []).map((r: any) => [String(r.kod), r.pomer]));
}
