/*
  Hromadné mazanie a zapínanie kódov číselníka účtovníctva. Všetko klientom
  prihláseného — RLS rozhodne, či smie čítať doklady a meniť číselník, a každý
  dotaz je navyše obmedzený na `company_id` aktuálnej firmy.

  Zmazanie ide jedným požiadavkom (`delete … in (ids)`) až po zistení, ktoré
  kódy sú použité (opis zdrojov v `ciselnik-mazanie.ts`).
*/
import {
  TABULKY_ROZUCTOVANIA,
  TABULKY_ZAKAZKY,
  ZDROJE,
  kodyVJson,
  rozdelNaMazanie,
  type KdePouzite,
  type PouzityKod,
  type RiadokCiselnika,
} from "./ciselnik-mazanie";
import { vsetkyRiadky } from "./strankovanie";
import type { DruhCiselnika } from "./predkontacie";

type Klient = any;
const STROP = 1000;
/** Najviac id v jednom filtri `in` (≈ 11 kB adresy). */
export const DAVKA_ID = 300;

export type VysledokMazaniaCiselnika = {
  /** Zmazané id. */
  zmazane: string[];
  /** Použité kódy — nezmazané, ponúknuť deaktiváciu. */
  pouzite: PouzityKod[];
  /** Id, ktoré databáza nezmazala (iná firma, chýbajúce právo). */
  nezmazane: string[];
};

/**
 * Ktoré z `kody` sa v stĺpci vyskytujú. Dotaz `in (zvyšné kódy)` sa opakuje,
 * kým prichádzajú nové kódy — jeden často použitý kód by inak prvou stránkou
 * (strop 1 000 riadkov) zakryl ostatné.
 */
async function najdiVStlpci(
  dotaz: (kody: string[]) => PromiseLike<{ data: any[] | null; error?: { message: string } | null }>,
  stlpec: string,
  kody: string[],
): Promise<Set<string>> {
  const najdene = new Set<string>();
  // Kódy po dávkach, aby filter `in.(…)` neprerástol limit dĺžky adresy.
  if (kody.length > DAVKA_ID) {
    for (let i = 0; i < kody.length; i += DAVKA_ID)
      (await najdiVStlpci(dotaz, stlpec, kody.slice(i, i + DAVKA_ID))).forEach((k) => najdene.add(k));
    return najdene;
  }
  let zvysne = [...kody];
  while (zvysne.length) {
    const { data, error } = await dotaz(zvysne);
    if (error) throw new Error(error.message);
    const riadky = data ?? [];
    const nove = new Set(riadky.map((r) => String(r?.[stlpec] ?? "").trim()).filter((k) => zvysne.includes(k)));
    if (!nove.size) break;
    for (const k of nove) najdene.add(k);
    zvysne = zvysne.filter((k) => !nove.has(k));
    if (riadky.length < STROP) break;
  }
  return najdene;
}

/** Kde všade sú `kody` daného druhu použité v rámci firmy. */
export async function pouzitieKodov(
  supabase: Klient,
  companyId: string,
  druh: DruhCiselnika,
  kody: string[],
): Promise<Map<string, Set<KdePouzite>>> {
  const out = new Map<string, Set<KdePouzite>>();
  const pridaj = (kod: string, kde: KdePouzite) => {
    if (!kody.includes(kod)) return;
    if (!out.has(kod)) out.set(kod, new Set());
    out.get(kod)!.add(kde);
  };
  if (!kody.length) return out;

  if (druh === "zakazka") {
    // Zákazka z Pohody je aj zákazkou Faktera (číslo = kód). Použitá je, keď na
    // zákazku s týmto číslom odkazuje doklad.
    const { data: zakazky, error } = await supabase
      .from("jobs")
      .select("id, job_number")
      .eq("company_id", companyId)
      .in("job_number", kody);
    if (error) throw new Error(error.message);
    const podlaId = new Map<string, string>(
      (zakazky ?? []).map((j: any) => [String(j.id), String(j.job_number).trim()]),
    );
    if (!podlaId.size) return out;
    await Promise.all(
      TABULKY_ZAKAZKY.map(async (tabulka) => {
        const ids = await najdiVStlpci(
          (zvysne) =>
            supabase.from(tabulka).select("job_id").eq("company_id", companyId).in("job_id", zvysne).limit(STROP),
          "job_id",
          [...podlaId.keys()],
        );
        for (const id of ids) pridaj(podlaId.get(id)!, "doklady");
      }),
    );
    return out;
  }

  const z = ZDROJE[druh];
  const ulohy: Promise<void>[] = [];

  for (const s of z.stlpce) {
    ulohy.push(
      najdiVStlpci(
        (zvysne) =>
          supabase.from(s.tabulka).select(s.stlpec).eq("company_id", companyId).in(s.stlpec, zvysne).limit(STROP),
        s.stlpec,
        kody,
      ).then((n) => n.forEach((k) => pridaj(k, s.kde))),
    );
  }

  if (z.polozkyFaktur) {
    const stlpec = z.polozkyFaktur;
    ulohy.push(
      najdiVStlpci(
        (zvysne) =>
          supabase
            .from("invoice_items")
            .select(`${stlpec}, invoices!inner(company_id)`)
            .eq("invoices.company_id", companyId)
            .in(stlpec, zvysne)
            .limit(STROP),
        stlpec,
        kody,
      ).then((n) => n.forEach((k) => pridaj(k, "doklady"))),
    );
  }

  if (z.kluceRozuctovania.length) {
    for (const { tabulka, kde } of TABULKY_ROZUCTOVANIA) {
      ulohy.push(
        vsetkyRiadky<{ rozuctovanie: unknown }>((od, po) =>
          supabase
            .from(tabulka)
            .select("id, rozuctovanie")
            .eq("company_id", companyId)
            .not("rozuctovanie", "is", null)
            .order("id")
            .range(od, po),
        ).then((riadky) => {
          for (const r of riadky) kodyVJson(r.rozuctovanie, z.kluceRozuctovania).forEach((k) => pridaj(k, kde));
        }),
      );
    }
  }

  if (z.kluceVPomere) {
    const kluce = z.kluceVPomere;
    ulohy.push(
      (async () => {
        const { data, error } = await supabase
          .from("predkontacie")
          .select("id, pomer")
          .eq("company_id", companyId)
          .not("pomer", "is", null);
        if (error) throw new Error(error.message);
        for (const r of data ?? []) kodyVJson(r.pomer, kluce).forEach((k) => pridaj(k, "ciselnik"));
      })(),
    );
  }

  if (z.firma || z.oznaceniPlatby) {
    ulohy.push(
      (async () => {
        const { data: firma, error } = await supabase.from("companies").select("*").eq("id", companyId).maybeSingle();
        if (error) throw new Error(error.message);
        for (const [stlpec, hodnota] of Object.entries(firma ?? {})) {
          if (z.firma?.test(stlpec) && typeof hodnota === "string") pridaj(hodnota.trim(), "nastavenia");
        }
        if (z.oznaceniPlatby) {
          const o = (firma as any)?.pohoda_predkontacie_oznaceni;
          if (o && typeof o === "object")
            for (const v of Object.values(o)) if (typeof v === "string") pridaj(v.trim(), "nastavenia");
        }
      })(),
    );
  }

  await Promise.all(ulohy);
  return out;
}

/**
 * Zmaže vybrané kódy číselníka, ktoré nikde nie sú použité, jedným
 * požiadavkom; použité vráti s miestom použitia.
 */
export async function zmazKodyCiselnika(
  supabase: Klient,
  vstup: { companyId: string; druh: DruhCiselnika; ids: string[] },
): Promise<VysledokMazaniaCiselnika> {
  const vsetky = await vsetkyRiadky<RiadokCiselnika>((od, po) =>
    supabase
      .from("predkontacie")
      .select("id, kod, druh")
      .eq("company_id", vstup.companyId)
      .eq("druh", vstup.druh)
      .order("id")
      .range(od, po),
  );
  const chcene = new Set(vstup.ids);
  const vybrane = vsetky.filter((r) => chcene.has(r.id));
  // Id, ktoré vo firme (alebo v tomto druhu) nie sú, sa nemažú.
  const cudzie = vstup.ids.filter((id) => !vybrane.some((r) => r.id === id));

  const kody = [...new Set(vybrane.map((r) => r.kod.trim()))];
  const pouzitie = await pouzitieKodov(supabase, vstup.companyId, vstup.druh, kody);
  const { zmazat, pouzite } = rozdelNaMazanie(vybrane, vsetky, pouzitie);

  const zmazane: string[] = [];
  // Jeden požiadavok; dávky len pri stovkách kódov, aby adresa s filtrom
  // `id=in.(…)` nenarazila na limit dĺžky (bežný číselník je jedna dávka).
  for (let i = 0; i < zmazat.length; i += DAVKA_ID) {
    const { data, error: e } = await supabase
      .from("predkontacie")
      .delete()
      .eq("company_id", vstup.companyId)
      .eq("druh", vstup.druh)
      .in("id", zmazat.slice(i, i + DAVKA_ID))
      .select("id");
    if (e) throw new Error(e.message);
    zmazane.push(...(data ?? []).map((r: any) => String(r.id)));
  }
  const zmazaneSet = new Set(zmazane);
  return {
    zmazane,
    pouzite,
    nezmazane: [...cudzie, ...zmazat.filter((id) => !zmazaneSet.has(id))],
  };
}

/** Zapne alebo vypne vybrané kódy jedným požiadavkom; vráti id, ktoré sa naozaj zmenili. */
export async function nastavAktivneKodov(
  supabase: Klient,
  vstup: { companyId: string; ids: string[]; aktivne: boolean },
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < vstup.ids.length; i += DAVKA_ID) {
    const { data, error } = await supabase
      .from("predkontacie")
      .update({ aktivne: vstup.aktivne, updated_at: new Date().toISOString() })
      .eq("company_id", vstup.companyId)
      .in("id", vstup.ids.slice(i, i + DAVKA_ID))
      .select("id");
    if (error) throw new Error(error.message);
    out.push(...(data ?? []).map((r: any) => String(r.id)));
  }
  return out;
}
