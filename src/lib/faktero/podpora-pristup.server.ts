import { opravneniaPodpory, platnostDo, type RozsahPodpory } from "./podpora-pristup";

/*
  Zápis prístupu technickej podpory. Všetko ide servisným klientom — tabuľku
  `podpora_pristupy` ani riadky podpory v `company_users` nesmie nikto z
  firmy meniť priamo (stráži to aj spúšťač v databáze). Volá sa až po
  overení, že volajúci je majiteľ (udelenie) alebo správca (odobratie).
*/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Klient = any;

/** Kto je technická podpora — účty v `platform_admins`. */
async function uctyPodpory(admin: Klient): Promise<string[]> {
  const { data } = await admin.from("platform_admins").select("user_id");
  return [...new Set(((data ?? []) as any[]).map((r) => r.user_id as string))];
}

export async function udelPristup(
  admin: Klient,
  v: {
    companyId: string;
    userId: string;
    rozsah: RozsahPodpory;
    dni: number;
    dovod?: string | null;
  },
): Promise<{ id: string; platneDo: string; pridanych: number }> {
  const teraz = new Date();
  const { data: aktivne } = await admin
    .from("podpora_pristupy")
    .select("id")
    .eq("company_id", v.companyId)
    .eq("stav", "aktivny")
    .gt("platne_do", teraz.toISOString())
    .limit(1);
  if (aktivne?.length)
    throw new Error(
      "Technická podpora už prístup má. Ak chcete iný rozsah alebo dĺžku, najprv ho odoberte.",
    );

  const podpora = await uctyPodpory(admin);
  if (!podpora.length) throw new Error("Technická podpora teraz nie je dostupná.");

  const platneDo = platnostDo(v.dni, teraz).toISOString();
  const { data: pristup, error } = await admin
    .from("podpora_pristupy")
    .insert({
      company_id: v.companyId,
      rozsah: v.rozsah,
      platne_do: platneDo,
      dovod: v.dovod?.trim() || null,
      udelil: v.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Kto z podpory už vo firme je ako bežný člen, toho sa prístup netýka.
  const { data: clenovia } = await admin
    .from("company_users")
    .select("user_id")
    .eq("company_id", v.companyId)
    .in("user_id", podpora);
  const uz = new Set(((clenovia ?? []) as any[]).map((r) => r.user_id as string));
  const nove = podpora
    .filter((id) => !uz.has(id))
    .map((id) => ({
      company_id: v.companyId,
      user_id: id,
      role: "custom",
      permissions: opravneniaPodpory(v.rozsah),
      podpora_pristup_id: pristup.id,
    }));
  if (nove.length) {
    const { error: e2 } = await admin.from("company_users").insert(nove);
    if (e2) {
      await admin
        .from("podpora_pristupy")
        .update({
          stav: "odobraty",
          ukoncene_at: new Date().toISOString(),
          dovod: "Nepodarilo sa udeliť",
        })
        .eq("id", pristup.id);
      throw new Error(e2.message);
    }
  }
  return { id: pristup.id as string, platneDo, pridanych: nove.length };
}

/** Odobratie — okamžite zmizne členstvo podpory vo firme. */
export async function odoberPristup(
  admin: Klient,
  v: { companyId: string; id: string; userId: string },
): Promise<void> {
  const { data: r } = await admin
    .from("podpora_pristupy")
    .select("id, stav")
    .eq("id", v.id)
    .eq("company_id", v.companyId)
    .maybeSingle();
  if (!r) throw new Error("Prístup sa nenašiel.");
  const { error } = await admin
    .from("company_users")
    .delete()
    .eq("company_id", v.companyId)
    .eq("podpora_pristup_id", v.id);
  if (error) throw new Error(error.message);
  if (r.stav === "aktivny")
    await admin
      .from("podpora_pristupy")
      .update({ stav: "odobraty", ukoncil: v.userId, ukoncene_at: new Date().toISOString() })
      .eq("id", v.id);
}

/** Cron: prístupy po čase sa zrušia samy. */
export async function expirujPristupy(admin: Klient): Promise<{ vyprsanych: number }> {
  const teraz = new Date().toISOString();
  const { data: vyprsane } = await admin
    .from("podpora_pristupy")
    .select("id")
    .eq("stav", "aktivny")
    .lte("platne_do", teraz)
    .limit(500);
  const ids = ((vyprsane ?? []) as any[]).map((r) => r.id as string);
  if (!ids.length) return { vyprsanych: 0 };
  const { error } = await admin.from("company_users").delete().in("podpora_pristup_id", ids);
  if (error) throw new Error(error.message);
  await admin
    .from("podpora_pristupy")
    .update({ stav: "vyprsal", ukoncene_at: teraz })
    .in("id", ids)
    .eq("stav", "aktivny");
  return { vyprsanych: ids.length };
}
