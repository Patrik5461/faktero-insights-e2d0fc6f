import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Vykonanie zrušenia účtu.
 *
 * Beží až po uplynutí odkladu, z plánovanej úlohy — nie z kliknutia. Robí tri
 * veci v tomto poradí:
 *
 * 1. **Firmy, kde bol človek jediným členom**, sa mažú celé. Nikto iný sa k nim
 *    už nedostane a nechať ich ležať v databáze by nebolo zmazanie, len skrytie.
 *    Prílohy idú preč cez Storage API — `storage.protect_delete()` bráni tomu,
 *    aby súbory zmizli obyčajným SQL, takže kaskáda na ne nesiaha.
 * 2. **Členstvá v zdieľaných firmách** sa rušia. Dáta firmy ostávajú kolegom.
 * 3. **Prihlásenie a profil** sa mažú.
 *
 * Server-only — pracuje so servisným kľúčom, ktorý obchádza RLS.
 */

/** Všetky súkromné úložiská. Cesta v každom začína identifikátorom firmy. */
const BUCKETY = [
  "bank-statements",
  "company-logos",
  "efaktura-xml",
  "expense-receipts",
  "imports",
  "invoice-pdfs",
  "product-photos",
  "purchase-invoices",
];

export type FirmaNaZmazanie = { id: string; name: string };

/**
 * Firmy, ktoré zrušením účtu zaniknú — teda tie, kde je človek jediným členom.
 * Používa sa dvakrát: pred žiadosťou (aby vedel, čo stratí) a pri vykonaní.
 */
export async function firmyNaZmazanie(userId: string): Promise<FirmaNaZmazanie[]> {
  const { data: moje } = await supabaseAdmin
    .from("company_users")
    .select("company_id")
    .eq("user_id", userId);

  const idcka = [...new Set((moje ?? []).map((r) => r.company_id as string))];
  if (!idcka.length) return [];

  // Jeden dotaz na všetkých členov dotknutých firiem — po firme by to bolo
  // toľko dotazov, koľko má človek firiem.
  const { data: clenovia } = await supabaseAdmin
    .from("company_users")
    .select("company_id, user_id")
    .in("company_id", idcka);

  const pocty = new Map<string, Set<string>>();
  for (const c of clenovia ?? []) {
    const s = pocty.get(c.company_id as string) ?? new Set<string>();
    s.add(c.user_id as string);
    pocty.set(c.company_id as string, s);
  }

  const same = idcka.filter((id) => (pocty.get(id)?.size ?? 0) <= 1);
  if (!same.length) return [];

  const { data: firmy } = await supabaseAdmin.from("companies").select("id, name").in("id", same);
  return (firmy ?? []).map((f) => ({ id: f.id as string, name: (f.name as string) ?? "Firma" }));
}

/** Cesty všetkých súborov firmy v jednom úložisku, aj vo vnorených priečinkoch. */
async function cestyVUlozisku(bucket: string, prefix: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return [];

  const cesty: string[] = [];
  for (const polozka of data) {
    const cesta = `${prefix}/${polozka.name}`;
    // Priečinok sa od súboru pozná podľa chýbajúceho `id`.
    if (polozka.id) cesty.push(cesta);
    else cesty.push(...(await cestyVUlozisku(bucket, cesta)));
  }
  return cesty;
}

/** Zmaže prílohy firmy zo všetkých úložísk. Vracia počet zmazaných súborov. */
export async function zmazSuboryFirmy(companyId: string): Promise<number> {
  let spolu = 0;
  for (const bucket of BUCKETY) {
    const cesty = await cestyVUlozisku(bucket, companyId);
    // `remove` má strop na počet ciest, preto po dávkach.
    for (let i = 0; i < cesty.length; i += 100) {
      const davka = cesty.slice(i, i + 100);
      const { error } = await supabaseAdmin.storage.from(bucket).remove(davka);
      if (!error) spolu += davka.length;
    }
  }
  return spolu;
}

export type VysledokZrusenia = {
  userId: string;
  zmazaneFirmy: string[];
  zmazaneSubory: number;
  opusteneFirmy: number;
};

/** Zruší jeden účet. Volá sa až po uplynutí odkladu. */
export async function zrusUcet(userId: string): Promise<VysledokZrusenia> {
  const same = await firmyNaZmazanie(userId);

  let subory = 0;
  for (const f of same) {
    subory += await zmazSuboryFirmy(f.id);
    // Ostatné tabuľky visia na `companies` cez ON DELETE CASCADE.
    await supabaseAdmin.from("companies").delete().eq("id", f.id);
  }

  const { count } = await supabaseAdmin
    .from("company_users")
    .delete({ count: "exact" })
    .eq("user_id", userId);

  await supabaseAdmin.from("profiles").delete().eq("id", userId);
  // Profil nevisí na `auth.users`, takže sa maže zvlášť — a až potom prihlásenie.
  await supabaseAdmin.auth.admin.deleteUser(userId);

  return {
    userId,
    zmazaneFirmy: same.map((f) => f.name),
    zmazaneSubory: subory,
    opusteneFirmy: count ?? 0,
  };
}

/** Účty, ktorým uplynul odklad. */
export async function ucetyNaZrusenie(teraz: Date = new Date()): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .not("deletion_scheduled_for", "is", null)
    .lte("deletion_scheduled_for", teraz.toISOString())
    .limit(200);
  return (data ?? []).map((r) => r.id as string);
}
