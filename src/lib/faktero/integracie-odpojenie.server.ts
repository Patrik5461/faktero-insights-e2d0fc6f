/**
 * Upratanie po odpojení GPS integrácie.
 *
 * Integrácia si pri pripojení sama založí vozidlá, ktoré našla u poskytovateľa.
 * Odpojenie dovtedy zmazalo len prihlasovacie údaje — naimportované autá aj
 * väzby na ne ostali vo firme navždy. Keď sa integrácia omylom pripojila pod
 * nesprávnu firmu (čo je pri viacerých firmách na jeden účet otázka jedného
 * kliknutia), ostali jej tam cudzie autá a ukazovali sa v knihe jázd aj
 * v mobilnej aplikácii.
 *
 * Maže sa opatrne: len vozidlo, ktoré založila integrácia a **nemá ani jednu
 * jazdu ani tankovanie**. Čokoľvek, čo už niekto použil, ostáva — vtedy sa
 * autu len zruší väzba na integráciu.
 */

type Vysledok = { zmazaneVozidla: number; ponechaneVozidla: number };

export async function odpojIntegraciu(
  companyId: string,
  tabulkaVazieb: "commander_vehicle_links" | "tesla_vehicle_links",
): Promise<Vysledok> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: vazby } = await supabaseAdmin
    .from(tabulkaVazieb)
    .select("faktero_vehicle_id")
    .eq("company_id", companyId);

  const idVozidiel = [
    ...new Set(
      (vazby ?? [])
        .map((v: { faktero_vehicle_id: string | null }) => v.faktero_vehicle_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  let zmazaneVozidla = 0;
  let ponechaneVozidla = 0;

  for (const id of idVozidiel) {
    const [{ count: jazdy }, { count: tankovania }] = await Promise.all([
      supabaseAdmin.from("trips").select("id", { count: "exact", head: true }).eq("vehicle_id", id),
      supabaseAdmin
        .from("fuel_records")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", id),
    ]);
    if ((jazdy ?? 0) > 0 || (tankovania ?? 0) > 0) {
      ponechaneVozidla++;
      continue;
    }
    const { error } = await supabaseAdmin
      .from("vehicles")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);
    if (error) ponechaneVozidla++;
    else zmazaneVozidla++;
  }

  await supabaseAdmin.from(tabulkaVazieb).delete().eq("company_id", companyId);

  return { zmazaneVozidla, ponechaneVozidla };
}
