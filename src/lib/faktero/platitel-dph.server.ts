/**
 * Overenie platiteľstva DPH firmy v registri a zápis výsledku.
 *
 * Funkcie dostávajú databázového klienta zvonka (servisný kľúč) — volá ich
 * cron, serverové funkcie po overení prístupu aj skript spätného doplnenia.
 * Zapisuje sa:
 *   - `dph_overenia` — nový riadok, keď sa výsledok zmenil (inak sa len
 *     posunie `naposledy_at`), s riadkami registra ako dôkazom,
 *   - na firmu len prázdne polia (režim DPH, IČ DPH) a čas overenia.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  chybaRegistra,
  dicPreCz,
  identifikatorySk,
  nastavenieFirmy,
  porovnaj,
  rovnakyVysledok,
  vysledokCz,
  vysledokSk,
  zdrojPreFirmu,
  zmenaRegistracie,
  type FirmaNaOverenie,
  type Porovnanie,
  type VysledokRegistra,
} from "./platitel-dph";

type Db = SupabaseClient<any>;

export const STLPCE_FIRMY =
  "id, name, country, ico, dic, ic_dph, vat_payer, vat_scheme, dph_auto_overenie, dph_overit_od, dph_overene_at";

export type SposobOverenia = "cron" | "rucne" | "zmena" | "prevzatie" | "spatne";

/** Opýta sa registra krajiny firmy. Nemecká (a iná) firma → null. */
export async function overVRegistri(f: FirmaNaOverenie): Promise<VysledokRegistra | null> {
  const zdroj = zdrojPreFirmu(f);
  if (!zdroj) return null;
  if (zdroj === "fs_sk") {
    const { ico, icDph } = identifikatorySk(f);
    if (!ico && !icDph) return chybaRegistra(zdroj, "Firma nemá IČO ani IČ DPH.", true);
    try {
      const { hladajVZoznamochFs } = await import("./platitel-dph-fs.server");
      const n = await hladajVZoznamochFs(ico, icDph);
      return vysledokSk(f, n, n.zoznamK);
    } catch (e) {
      return chybaRegistra(
        zdroj,
        `Zoznamy Finančnej správy sú nedostupné: ${String((e as Error)?.message ?? e)}`,
      );
    }
  }
  const dic = dicPreCz(f);
  if (!dic) return chybaRegistra(zdroj, "Firma nemá DIČ ani IČO.", true);
  try {
    const { typSubjektuDph } = await import("./cz-registr-dph.server");
    const { subjekt } = await typSubjektuDph(dic);
    return vysledokCz(dic, subjekt.typ, subjekt.nespolehlivy, subjekt, subjekt.odpovedGenerovana);
  } catch (e) {
    return chybaRegistra(zdroj, String((e as Error)?.message ?? e));
  }
}

export type VysledokOverenia = {
  firma: FirmaNaOverenie & { name?: string | null };
  vysledok: VysledokRegistra | null;
  porovnanie: Porovnanie | null;
  zmena: ReturnType<typeof zmenaRegistracie>;
  zapisane: boolean;
};

async function poslednyZaznam(db: Db, companyId: string) {
  const { data } = await db
    .from("dph_overenia")
    .select("id, stav, schema, ic_dph, platne_od, zdroj, nesulad, zmena, overene_at")
    .eq("company_id", companyId)
    .neq("stav", "chyba")
    .order("overene_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as any) ?? null;
}

async function poslednyAkykolvek(db: Db, companyId: string) {
  const { data } = await db
    .from("dph_overenia")
    .select("id, stav, schema, ic_dph, platne_od, nesulad")
    .eq("company_id", companyId)
    .order("overene_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as any) ?? null;
}

/**
 * Overí jednu firmu. `nanecisto` nič nezapíše — vráti, čo by sa stalo.
 * Vyplnené nastavenie firmy sa nikdy neprepíše (to robí len `prevezmiZRegistra`).
 */
export async function overFirmu(
  db: Db,
  companyId: string,
  opts: { sposob: SposobOverenia; userId?: string | null; nanecisto?: boolean },
): Promise<VysledokOverenia> {
  const { data: firma, error } = await db
    .from("companies")
    .select(STLPCE_FIRMY)
    .eq("id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!firma) throw new Error("Firma sa nenašla.");
  const f = firma as any;
  const teraz = new Date().toISOString();

  const v = await overVRegistri(f);
  if (!v) {
    if (!opts.nanecisto && f.dph_overit_od)
      await db.from("companies").update({ dph_overit_od: null }).eq("id", companyId);
    return { firma: f, vysledok: null, porovnanie: null, zmena: null, zapisane: false };
  }

  const predosly = await poslednyZaznam(db, companyId);
  const por = porovnaj(f, v);
  const zmena = zmenaRegistracie(predosly, v);
  if (opts.nanecisto) return { firma: f, vysledok: v, porovnanie: por, zmena, zapisane: false };

  if (v.bezUdajov) {
    // Bez IČO a IČ DPH sa nedá overiť nič — firma sa len vyradí z čakania,
    // overí sa znova, až keď ich niekto doplní (spúšťač ju zaradí).
    await db
      .from("companies")
      .update({ dph_overit_od: null, dph_overene_at: teraz })
      .eq("id", companyId);
    return { firma: f, vysledok: v, porovnanie: por, zmena: null, zapisane: false };
  }

  if (v.stav === "chyba") {
    // Výpadok registra nie je zmena registrácie. Firma ostáva čakať na overenie
    // a chyba sa zapíše raz, nie pri každom behu.
    const posledny = await poslednyAkykolvek(db, companyId);
    if (posledny?.stav === "chyba")
      await db.from("dph_overenia").update({ naposledy_at: teraz }).eq("id", posledny.id);
    else
      await db.from("dph_overenia").insert({
        company_id: companyId,
        zdroj: v.zdroj,
        stav: "chyba",
        odpoved: { chyba: v.chyba },
        sposob: opts.sposob,
        created_by: opts.userId ?? null,
      });
    return { firma: f, vysledok: v, porovnanie: por, zmena: null, zapisane: true };
  }

  // Firma: len prázdne polia + čas overenia. `dph_overit_od` sa mení výslovne,
  // aby spúšťač nezaradil firmu na overenie znova kvôli doplnenému IČ DPH.
  const zmenaFirmy: Record<string, unknown> = {
    ...(por.doplnit ?? {}),
    dph_overene_at: teraz,
    dph_overit_od: null,
  };
  const { error: e1 } = await db.from("companies").update(zmenaFirmy).eq("id", companyId);
  if (e1) throw new Error(e1.message);

  const posledny = await poslednyAkykolvek(db, companyId);
  if (!por.doplnit && posledny?.stav !== "chyba" && rovnakyVysledok(posledny, v, por.nesulad)) {
    await db.from("dph_overenia").update({ naposledy_at: teraz }).eq("id", posledny.id);
  } else {
    const { error: e2 } = await db.from("dph_overenia").insert({
      company_id: companyId,
      zdroj: v.zdroj,
      stav: v.stav,
      schema: v.schema,
      ic_dph: v.icDph,
      platne_od: v.platneOd,
      zrusene_od: v.zruseneOd,
      zoznam_k: v.zoznamK,
      zmena,
      predosla_schema: predosly?.schema ?? null,
      doplnene: por.doplnit,
      nesulad: por.nesulad ? nastavenieFirmy(f) : null,
      odpoved: {
        ...(typeof v.odpoved === "object" && v.odpoved ? (v.odpoved as object) : {}),
        dovodyNaZrusenie: v.dovodyNaZrusenie,
        nespolehlivy: v.nespolehlivy,
      },
      sposob: opts.sposob,
      created_by: opts.userId ?? null,
    });
    if (e2) throw new Error(e2.message);
  }
  return { firma: f, vysledok: v, porovnanie: por, zmena, zapisane: true };
}

/**
 * Prevezme režim DPH z registra — na výslovnú žiadosť správcu firmy. IČ DPH
 * sa zapíše len vtedy, keď ho registrácia má; existujúce sa pri zrušení
 * registrácie nemaže (môže byť na starších dokladoch).
 */
export async function prevezmiZRegistra(db: Db, companyId: string, userId: string | null) {
  const { data: firma } = await db
    .from("companies")
    .select(STLPCE_FIRMY)
    .eq("id", companyId)
    .maybeSingle();
  if (!firma) throw new Error("Firma sa nenašla.");
  const v = await overVRegistri(firma as any);
  if (!v || v.stav === "chyba" || !v.schema)
    throw new Error(v?.chyba ?? "Register pre túto firmu nič nevrátil.");
  const predtym = nastavenieFirmy(firma as any);
  const { schema } = await import("./dph-rezim");
  const nove: Record<string, unknown> = {
    vat_scheme: v.schema,
    vat_payer: schema(v.schema).platitel,
    dph_overene_at: new Date().toISOString(),
    dph_overit_od: null,
  };
  if (v.icDph) nove.ic_dph = v.icDph;
  const { error } = await db.from("companies").update(nove).eq("id", companyId);
  if (error) throw new Error(error.message);
  const predosly = await poslednyZaznam(db, companyId);
  await db.from("dph_overenia").insert({
    company_id: companyId,
    zdroj: v.zdroj,
    stav: v.stav,
    schema: v.schema,
    ic_dph: v.icDph,
    platne_od: v.platneOd,
    zrusene_od: v.zruseneOd,
    zoznam_k: v.zoznamK,
    zmena: zmenaRegistracie(predosly, v),
    predosla_schema: predosly?.schema ?? null,
    doplnene: {
      vat_scheme: v.schema,
      vat_payer: nove.vat_payer,
      ...(v.icDph ? { ic_dph: v.icDph } : {}),
      predtym,
    },
    nesulad: null,
    odpoved: v.odpoved as any,
    sposob: "prevzatie",
    created_by: userId,
  });
  return v;
}

/**
 * Beh cronu: firmy so zapnutým automatickým overením, ktoré čakajú (nová
 * firma, zmena IČO / IČ DPH) alebo sa neoverovali 20 hodín. Beží najviac
 * `limitMs` — nginx spojenie po 30 s preruší; čo nestihne, dorobí ďalší beh.
 */
export async function overCakajuceFirmy(db: Db, opts: { limitMs?: number } = {}) {
  const koniec = Date.now() + (opts.limitMs ?? 20_000);
  const hranica = new Date(Date.now() - 20 * 3600_000).toISOString();
  const { data, error } = await db
    .from("companies")
    .select("id, country, dph_overit_od, dph_overene_at")
    .eq("dph_auto_overenie", true)
    .or(`dph_overit_od.not.is.null,dph_overene_at.is.null,dph_overene_at.lt."${hranica}"`)
    .order("dph_overit_od", { ascending: true, nullsFirst: false })
    .order("dph_overene_at", { ascending: true, nullsFirst: true })
    .limit(500);
  if (error) throw new Error(error.message);
  const firmy = (data ?? []) as { id: string }[];
  const vysledok = {
    na_rade: firmy.length,
    overene: 0,
    doplnene: 0,
    zmeny: 0,
    nesulad: 0,
    chyby: 0,
  };
  for (const f of firmy) {
    if (Date.now() > koniec) break;
    try {
      const r = await overFirmu(db, f.id, { sposob: "cron" });
      vysledok.overene++;
      if (r.porovnanie?.doplnit) vysledok.doplnene++;
      if (r.zmena) vysledok.zmeny++;
      if (r.porovnanie?.nesulad) vysledok.nesulad++;
      if (r.vysledok?.stav === "chyba") vysledok.chyby++;
    } catch (e) {
      vysledok.chyby++;
      console.warn("[platitel-dph]", f.id, String((e as Error)?.message ?? e));
    }
  }
  return vysledok;
}

/** Spätné doplnenie nanečisto: čo by sa kde nastavilo a podľa čoho. */
export async function navrhSpatnehoDoplnenia(db: Db) {
  // Len stĺpce, ktoré mala firma už pred migráciou — nanečisto sa dá pustiť aj pred ňou.
  const { data, error } = await db
    .from("companies")
    .select("id, name, country, ico, dic, ic_dph, vat_payer, vat_scheme")
    .order("name");
  if (error) throw new Error(error.message);
  const out = [];
  for (const f of (data ?? []) as any[]) {
    const v = await overVRegistri(f);
    if (!v) continue;
    const por = porovnaj(f, v);
    out.push({
      id: f.id as string,
      firma: f.name as string,
      ico: f.ico as string | null,
      nastavene: nastavenieFirmy(f),
      register: {
        zdroj: v.zdroj,
        stav: v.stav,
        schema: v.schema,
        ic_dph: v.icDph,
        platne_od: v.platneOd,
        zrusene_od: v.zruseneOd,
        zoznam_k: v.zoznamK,
        chyba: v.chyba,
      },
      doplnit: por.doplnit,
      nesulad: por.nesulad,
    });
  }
  return out;
}
