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
 *
 * Atomicky v databáze (`zvys_pohoda_verziu`: `pohoda_verzia + 1` jedným
 * UPDATE) — čítanie a zápis z aplikácie by pri dvoch súbežných vráteniach
 * zvýšili verziu len raz. Kým migrácia 20261107092942 nie je v databáze,
 * ostáva doterajší postup po riadkoch.
 */
export async function zvysVerziuPohody(
  supabase: any,
  tabulka: "invoices" | "purchase_invoices" | "expense_documents" | "cash_entries",
  ids: string[],
): Promise<void> {
  if (!ids.length) return;
  const { error: chybaRpc } = await supabase.rpc("zvys_pohoda_verziu", {
    _tabulka: tabulka,
    _ids: ids,
  });
  if (!chybaRpc) return;
  if (!chybaChybajucejFunkcie(chybaRpc))
    throw new Error(`Verzia dokladu pre Pohodu sa nezvýšila: ${chybaRpc.message ?? String(chybaRpc)}`);
  const { data, error } = await supabase.from(tabulka).select("id, pohoda_verzia").in("id", ids);
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    const { error: e } = await supabase
      .from(tabulka)
      .update({ pohoda_verzia: (Number(r.pohoda_verzia) || 0) + 1 })
      .eq("id", r.id);
    if (e) throw new Error(e.message);
  }
}

/** Funkcia v databáze ešte nie je (PostgREST PGRST202 / Postgres 42883). */
function chybaChybajucejFunkcie(e: { code?: string; message?: string }): boolean {
  return (
    e?.code === "PGRST202" ||
    e?.code === "42883" ||
    /could not find the function/i.test(String(e?.message ?? ""))
  );
}
