/*
  Odoslané XML prijatých dokladov a prijatých faktúr do histórie exportov.

  Pri vydaných faktúrach sa súbor ukladal vždy (`export_jobs.file_content`),
  pri prijatých nie — audit 22. 10. 2026 preto nevedel povedať, čo Pohoda
  pri prijatých naozaj dostala. Doklad nesie `export_job_id` na tento záznam,
  takže prehľad „Rozdiely oproti Pohode“ vie porovnať odoslané s aktuálnym.
*/

type Klient = { from: (t: string) => any };

/** Zapíše súbor do `export_jobs`; vráti id (alebo `null`, keď nie je čo uložiť). */
export async function ulozOdoslaneXml(
  supabase: Klient,
  p: {
    companyId: string;
    userId?: string | null;
    fileName: string;
    xml: string;
    pocet: number;
    od?: string | null;
    do?: string | null;
  },
): Promise<string | null> {
  if (!p.xml) return null;
  const { data: job, error } = await supabase
    .from("export_jobs")
    .insert({
      company_id: p.companyId,
      created_by: p.userId ?? null,
      format: "pohoda_xml",
      target_system: "pohoda",
      status: "completed",
      invoice_count: p.pocet,
      date_from: p.od ?? null,
      date_to: p.do ?? null,
      file_name: p.fileName,
      file_content: p.xml,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (job?.id as string) ?? null;
}

/**
 * Po vrátení z Pohody pôjde doklad pod novým `id` (`id-verzia`) — Pohoda
 * kontroluje duplicitu podľa id položky dávky a opravu by inak odmietla.
 * Bez stĺpca `pohoda_verzia` (migrácia ešte nie je) sa nič nestane.
 */
export async function zvysVerziuPohody(
  supabase: any,
  tabulka: string,
  ids: string[],
): Promise<void> {
  if (!ids.length) return;
  const { data, error } = await supabase.from(tabulka).select("id, pohoda_verzia").in("id", ids);
  if (error || !data) return;
  for (const r of data) {
    await supabase
      .from(tabulka)
      .update({ pohoda_verzia: (Number(r.pohoda_verzia) || 0) + 1 })
      .eq("id", r.id);
  }
}
