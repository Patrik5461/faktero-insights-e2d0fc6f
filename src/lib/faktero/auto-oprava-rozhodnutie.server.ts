/*
  Rozhodnutie o návrhu automatickej opravy — „Schváliť a nasadiť“ alebo
  „Zamietnuť“. Volá ho Admin → Podpora aj tlačidlo v Telegrame, aby mali obe
  cesty presne ten istý účinok a tie isté kontroly.

  Rola sa vždy číta z `platform_admins` podľa účtu — nikdy z toho, čo poslal
  prehliadač alebo Telegram. Schválenie pošle kód do main (a ten sa sám
  nasadí), preto ho smie len superadmin.
*/
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export class ChybaRozhodnutia extends Error {}

export async function rozhodniOAutoOprave(args: {
  userId: string;
  id: string;
  akcia: "schvalit" | "zamietnut";
  /** Z administrácie: návrh musí patriť k otvorenej požiadavke. */
  poziadavkaId?: string;
}): Promise<{ poziadavkaId: string; stav: "schvalena" | "zamietnuta" }> {
  const { data: rola } = await supabaseAdmin
    .from("platform_admins")
    .select("role")
    .eq("user_id", args.userId)
    .maybeSingle();
  const r = (rola as { role?: string } | null)?.role;
  if (!r) throw new ChybaRozhodnutia("Forbidden: not a platform admin");

  const { data } = await supabaseAdmin
    .from("podpora_auto_opravy")
    .select("id, poziadavka_id, stav, commit_sha")
    .eq("id", args.id)
    .maybeSingle();
  const ciel = data as {
    id: string;
    poziadavka_id: string;
    stav: string;
    commit_sha: string | null;
  } | null;
  if (!ciel || (args.poziadavkaId && ciel.poziadavka_id !== args.poziadavkaId))
    throw new ChybaRozhodnutia("Návrh opravy sa nenašiel.");
  const teraz = new Date().toISOString();

  if (args.akcia === "schvalit") {
    if (r !== "superadmin")
      throw new ChybaRozhodnutia("Opravu na nasadenie smie schváliť len superadmin.");
    if (ciel.stav !== "navrh" || !ciel.commit_sha)
      throw new ChybaRozhodnutia("Schváliť sa dá len hotový návrh opravy.");
    const { data: zmenene, error } = await supabaseAdmin
      .from("podpora_auto_opravy")
      .update({ stav: "schvalena", schvalil: args.userId, schvalene_at: teraz, updated_at: teraz })
      .eq("id", ciel.id)
      .eq("stav", "navrh")
      .select("id");
    if (error) throw new Error(error.message);
    // Medzitým ho schválil alebo zamietol niekto iný (druhé kliknutie).
    if (!zmenene?.length) throw new ChybaRozhodnutia("Schváliť sa dá len hotový návrh opravy.");
    return { poziadavkaId: ciel.poziadavka_id, stav: "schvalena" };
  }

  if (!["navrh", "bez_opravy", "zlyhala", "caka"].includes(ciel.stav))
    throw new ChybaRozhodnutia("Tento návrh sa už nedá zamietnuť.");
  const { error } = await supabaseAdmin
    .from("podpora_auto_opravy")
    .update({ stav: "zamietnuta", updated_at: teraz })
    .eq("id", ciel.id);
  if (error) throw new Error(error.message);
  return { poziadavkaId: ciel.poziadavka_id, stav: "zamietnuta" };
}
