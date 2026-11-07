/*
  „Vrátiť z Pohody (opraviť)“ — jedno miesto pre všetky druhy dokladov, ktoré
  do Pohody chodia: vydané (faktúra, zálohová, daňový doklad k platbe,
  dobropis), prijaté (faktúra aj zálohová), bločky a pokladničné doklady.

  Vrátenie zruší príznak odovzdania (doklad sa odomkne a ďalšia dávka ho
  pošle znova) a zvýši `pohoda_verzia`, aby oprava prešla kontrolou duplicity
  v Pohode. V Pohode doklad ostáva — tam ho treba zmazať ručne.

  Vracať smie len ten, kto doklady smie upravovať (`overPravoVratenia`), nie
  ten, kto ich len číta. Obsluhy server funkcií sú vo `vratenie.functions.ts`
  a `zauctovanie.functions.ts`; logika je tu, aby ju pokryli testy.
*/
import { overPravoVratenia } from "./over-pristup";
import { zvysVerziuPohody } from "./pohoda-odoslane-xml.server";

type Kontext = { supabase: any; userId: string };
export type DruhVratenia = "prijata" | "doklad" | "pokladna";

/** Prijaté faktúry (aj zálohové), bločky a pokladničné doklady späť z Pohody. */
export async function vratDokladyZPohody(
  ctx: Kontext,
  data: { company_id: string; druh: DruhVratenia; ids: string[] },
): Promise<{ vratenych: number }> {
  const supabase = ctx.supabase;
  /*
    RLS by zápis človeku s „Len čítať“ aj tak zahodilo, ale ticho (0 riadkov);
    takto dostane jasnú hlášku a nezapíše sa nič.
  */
  await overPravoVratenia(ctx, data.company_id, data.druh === "pokladna" ? "pokladna" : "doklady");
  if (data.druh === "pokladna") {
    // Pokladničný doklad: odovzdanie sa zruší, ďalšia dávka ho pošle pod novou verziou.
    const { data: r, error } = await supabase
      .from("cash_entries")
      .update({ exported_at: null, export_job_id: null, pohoda_cislo: null })
      .eq("company_id", data.company_id)
      .in("id", data.ids)
      .select("id");
    if (error) throw new Error(error.message);
    await zvysVerziuPohody(supabase, "cash_entries", (r ?? []).map((x: any) => x.id));
    return { vratenych: (r ?? []).length };
  }
  if (data.druh === "prijata") {
    // Späť na „prijatú": zaúčtovanie sa zruší, aby ho človek opravil a
    // zaúčtoval znova — inak by nesprávne kódy odišli rovno ďalšou dávkou.
    // `export_job_id` ako pri bločku — odovzdaný súbor už k dokladu nepatrí.
    const { data: r, error } = await supabase
      .from("purchase_invoices")
      .update({
        exported_at: null,
        export_job_id: null,
        pohoda_cislo: null,
        zauctovane_at: null,
        zauctoval: null,
      })
      .eq("company_id", data.company_id)
      .in("id", data.ids)
      .select("id, status");
    if (error) throw new Error(error.message);
    const zauct = (r ?? []).filter((x: any) => x.status === "booked").map((x: any) => x.id);
    if (zauct.length) {
      const { error: chybaStavu } = await supabase
        .from("purchase_invoices")
        .update({ status: "received" })
        .eq("company_id", data.company_id)
        .in("id", zauct);
      if (chybaStavu) throw new Error(chybaStavu.message);
    }
    await zvysVerziuPohody(supabase, "purchase_invoices", (r ?? []).map((x: any) => x.id));
    return { vratenych: (r ?? []).length };
  }
  // Doklad sa vráti medzi nespracované — po oprave ho človek spracuje znova.
  const { data: r, error } = await supabase
    .from("expense_documents")
    .update({ exported_at: null, export_job_id: null, pohoda_cislo: null, status: "new" })
    .eq("company_id", data.company_id)
    .in("id", data.ids)
    .select("id");
  if (error) throw new Error(error.message);
  await zvysVerziuPohody(supabase, "expense_documents", (r ?? []).map((x: any) => x.id));
  return { vratenych: (r ?? []).length };
}

/**
 * Vystavený doklad (faktúra, zálohová, daňový doklad k platbe, dobropis) späť
 * z Pohody — história odovzdania sa označí ako vrátená (spúšťač potom zruší
 * `invoices.exported_at` aj zámok), takže ho konektor aj balík pošlú znova.
 */
export async function vratVystavenuZPohody(
  ctx: Kontext,
  admin: any,
  data: { company_id: string; id: string },
): Promise<{ ok: true }> {
  const supabase = ctx.supabase;
  // História sa mení servisným kľúčom — preto najprv právo upravovať faktúry.
  await overPravoVratenia(ctx, data.company_id, "faktury");
  // Faktúru musí prihlásený vidieť (RLS) — až potom sa história mení servisným kľúčom.
  const { data: f } = await supabase
    .from("invoices")
    .select("id")
    .eq("company_id", data.company_id)
    .eq("id", data.id)
    .maybeSingle();
  if (!f) throw new Error("Faktúra sa nenašla.");
  const { error } = await admin
    .from("export_logs")
    .update({ status: "returned" })
    .eq("company_id", data.company_id)
    .eq("invoice_id", data.id)
    .eq("status", "ok");
  if (error) throw new Error(error.message);
  await supabase
    .from("invoices")
    .update({ zauctovane_at: null, zauctoval: null })
    .eq("company_id", data.company_id)
    .eq("id", data.id);
  // Oprava pôjde do Pohody pod novým id — inak by ju kontrola duplicity odmietla.
  await zvysVerziuPohody(supabase, "invoices", [data.id]);
  return { ok: true };
}
