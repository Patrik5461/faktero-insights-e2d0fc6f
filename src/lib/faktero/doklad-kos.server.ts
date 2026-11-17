/*
  Bloček (`expense_documents`) do koša — jedna cesta pre mazanie, presun ako
  prílohu, priradenie k prijatej faktúre aj presun do Iných dokladov.

  Doklad sa pred zmazaním odloží celý aj s párovaním na pohyb v banke, aby sa
  dal obnoviť. Sken v úložisku ostáva, kým sa kôš nevysype. `delete()` bez
  práva (mazať smie len správca firmy) nevráti chybu, len nula riadkov — preto
  `select` a pri nule riadkov sa záznam z koša vráti a funkcia vyhodí.
*/

type Klient = any;

export const CHYBA_NEZMAZANY_BLOCEK = "Doklad sa nezmazal — buď už neexistuje, alebo naň nemáte právo.";

export async function blocekDoKosa(
  supabase: Klient,
  userId: string,
  doklad: Record<string, any>,
  popis?: string,
): Promise<void> {
  const { data: pohyby } = await supabase
    .from("bank_transactions")
    .select("id")
    .eq("matched_expense_id", doklad.id);
  const { data: vKosi, error: chybaKosa } = await supabase
    .from("kos_dokladov")
    .insert({
      company_id: doklad.company_id,
      druh: "doklad",
      zaznam_id: doklad.id,
      zaznam: doklad,
      vazby: { banka: (pohyby ?? []).map((p: any) => p.id) },
      popis: popis || [doklad.supplier_name, doklad.document_number].filter(Boolean).join(" · ") || "Doklad",
      zmazal: userId,
    })
    .select("id")
    .single();
  if (chybaKosa) throw new Error(chybaKosa.message);

  const { data: zmazane, error } = await supabase
    .from("expense_documents")
    .delete()
    .eq("id", doklad.id)
    .select("id");
  if (error || !zmazane?.length) {
    if (vKosi?.id) await supabase.from("kos_dokladov").delete().eq("id", vKosi.id);
    throw new Error(error?.message ?? CHYBA_NEZMAZANY_BLOCEK);
  }
}
