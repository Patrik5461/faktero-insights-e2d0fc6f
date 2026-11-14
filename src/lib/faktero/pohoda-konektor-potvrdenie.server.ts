/*
  Konektor do POHODY — zápis dávky a jej potvrdenie odpoveďou POHODY.

  Položky dávky sú v `pohoda_konektor_polozky` (migrácia
  20261114180000_pohoda_konektor_polozky.sql). Doklad je pri stiahnutí dávky
  len `odoslane` — u nás sa neoznačí ani nezamkne. Odovzdaný (exported_at,
  `export_logs.status = 'ok'`, `pohoda_odoslane`) je až po odpovedi POHODY
  s `state="ok"` (alebo `recordDuplicity`). Odmietnutý celý balík, chýbajúca
  odpoveď a dávka bez odpovede dlhšie ako `LIMIT_POTVRDENIA_HODIN` vrátia
  položky do fronty — doklad sa nikdy nestratí (audit 14. 11. 2026, K3).

  Zapisuje sa servisným kľúčom (konektor nemá prihláseného používateľa).
*/
import {
  jeVyprsana,
  LIMIT_POTVRDENIA_HODIN,
  stavZOdpovede,
  type DruhPolozky,
  type PolozkaDavky,
  type RiadokKonektora,
} from "./pohoda-konektor-davka";
import type { OdpovedPohody } from "./pohoda-odpoved";

type Klient = any;
type Riadok = any;

export const TABULKA_KONEKTORA = "pohoda_konektor_polozky";
/** Názov súboru dávky konektora — podľa neho `faktero_cesta_odovzdania` vie, že išlo o konektor. */
export const SUBOR_DAVKY = "pohoda-davka.xml";

/** Migrácia s tabuľkou položiek ešte nie je v databáze — konektor sa nesmie rozbehnúť bez nej. */
export class KonektorBezTabulky extends Error {
  constructor() {
    super(
      "Konektor čaká na aktualizáciu databázy (pohoda_konektor_polozky) — dávka sa nevydala a nič sa neoznačilo.",
    );
    this.name = "KonektorBezTabulky";
  }
}

export function chybaChybajucejTabulky(e: { code?: string; message?: string } | null | undefined): boolean {
  return (
    e?.code === "42P01" ||
    e?.code === "PGRST205" ||
    /could not find the table|relation .* does not exist/i.test(String(e?.message ?? ""))
  );
}

function hod(e: any): never {
  if (chybaChybajucejTabulky(e)) throw new KonektorBezTabulky();
  throw new Error(e?.message ?? String(e));
}

async function poKusoch<T>(zoznam: T[], krok: (kus: T[]) => PromiseLike<{ error?: any }>, velkost = 200) {
  for (let i = 0; i < zoznam.length; i += velkost) {
    const { error } = (await krok(zoznam.slice(i, i + velkost))) ?? {};
    if (error) hod(error);
  }
}

/**
 * Riadky konektora k záznamom (všetky stavy) — na rozhodnutie o oprave (V13)
 * a na prehľad v Kontrole Pohody. Bez migrácie vráti prázdny zoznam, ak
 * `tolerovat` (náhľad, kontrola), inak vyhodí `KonektorBezTabulky`.
 */
export async function riadkyKZaznamom(
  supabase: Klient,
  companyId: string,
  zaznamIds: string[],
  tolerovat = false,
): Promise<RiadokKonektora[]> {
  const ids = [...new Set(zaznamIds.filter(Boolean))];
  const out: RiadokKonektora[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase
      .from(TABULKA_KONEKTORA)
      .select("id, export_job_id, polozka_id, druh, zaznam_id, verzia, stav, pohoda_cislo, chyba, created_at, potvrdene_at")
      .eq("company_id", companyId)
      .in("zaznam_id", ids.slice(i, i + 150))
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      if (tolerovat && chybaChybajucejTabulky(error)) return [];
      hod(error);
    }
    out.push(...((data ?? []) as RiadokKonektora[]));
  }
  return out;
}

/** Záznamy, ktoré sú práve na ceste do POHODY (čakajú na odpoveď) — podľa druhu. */
export async function cakajuceZaznamy(
  supabase: Klient,
  companyId: string,
  tolerovat = false,
): Promise<Map<DruhPolozky, Set<string>>> {
  const mapa = new Map<DruhPolozky, Set<string>>();
  const { data, error } = await supabase
    .from(TABULKA_KONEKTORA)
    .select("druh, zaznam_id")
    .eq("company_id", companyId)
    .eq("stav", "odoslane")
    .limit(5000);
  if (error) {
    if (tolerovat && chybaChybajucejTabulky(error)) return mapa;
    hod(error);
  }
  for (const r of (data ?? []) as Riadok[]) {
    const s = mapa.get(r.druh) ?? new Set<string>();
    s.add(String(r.zaznam_id));
    mapa.set(r.druh, s);
  }
  return mapa;
}

/**
 * Vráti do fronty položky dávky, ktorú POHODA nepotvrdila: celý balík
 * odmietnutý, odpoveď neprišla, dávka vypršala. Vydané faktúry dostanú v
 * histórii `error` (spúšťač `faktero_invoice_exported_at` ich nechá
 * neodovzdané), ostatné doklady sa pri stiahnutí neoznačili, takže stačí
 * ukončiť položku.
 */
async function vratDavku(
  supabase: Klient,
  companyId: string,
  jobId: string,
  stav: "chyba" | "vyprsane",
  dovod: string,
): Promise<number> {
  const teraz = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABULKA_KONEKTORA)
    .update({ stav, chyba: dovod, potvrdene_at: teraz })
    .eq("company_id", companyId)
    .eq("export_job_id", jobId)
    .eq("stav", "odoslane")
    .select("id");
  if (error) hod(error);
  await supabase
    .from("export_logs")
    .update({ status: "error", error: dovod, pohoda_stav: "error", potvrdene_at: teraz })
    .eq("company_id", companyId)
    .eq("export_job_id", jobId)
    .eq("status", "cakajuce");
  await supabase
    .from("export_jobs")
    .update({ status: stav === "vyprsane" ? "vyprsane" : "error", error: dovod })
    .eq("id", jobId)
    .eq("status", "cakajuce");
  return (data ?? []).length;
}

/** Dávky bez odpovede dlhšie ako limit — položky sa vrátia do fronty. */
export async function vyprsNepotvrdene(supabase: Klient, companyId: string, teraz = new Date()): Promise<number> {
  const { data: joby, error } = await supabase
    .from("export_jobs")
    .select("id, created_at")
    .eq("company_id", companyId)
    .eq("file_name", SUBOR_DAVKY)
    .eq("status", "cakajuce")
    .order("created_at")
    .limit(100);
  if (error) hod(error);
  let n = 0;
  for (const j of (joby ?? []) as Riadok[]) {
    if (!jeVyprsana(j.created_at, teraz)) continue;
    n += await vratDavku(
      supabase,
      companyId,
      j.id,
      "vyprsane",
      `POHODA dávku do ${LIMIT_POTVRDENIA_HODIN} hodín nepotvrdila (konektor neposlal odpoveď) — doklad pôjde znova v ďalšej dávke. Ak ho POHODA medzitým prijala, druhý import odmietne kontrola duplicity a Faktero si doklad označí ako odovzdaný.`,
    );
  }
  return n;
}

/** Posledná dávka, ktorá čaká na odpoveď — tej patrí odpoveď bez položiek (odmietnutý celý balík). */
async function poslednaCakajuca(supabase: Klient, companyId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("export_jobs")
    .select("id")
    .eq("company_id", companyId)
    .eq("file_name", SUBOR_DAVKY)
    .eq("status", "cakajuce")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) hod(error);
  return (data?.[0]?.id as string | undefined) ?? null;
}

/**
 * Konektor ohlásil, že POHODA nevrátila žiadnu odpoveď (spadla, zlé meno či
 * heslo, neexistujúca databáza, odrezaný súbor). Posledná čakajúca dávka sa
 * vráti do fronty hneď — nemusí sa čakať na vypršanie.
 */
export async function odmietniPoslednuDavku(
  supabase: Klient,
  companyId: string,
  dovod: string,
): Promise<{ vratenych: number; davka: string | null }> {
  const job = await poslednaCakajuca(supabase, companyId);
  if (!job) return { vratenych: 0, davka: null };
  return { vratenych: await vratDavku(supabase, companyId, job, "chyba", dovod), davka: job };
}

/**
 * Zapíše vydanú dávku: `export_jobs` (čaká na potvrdenie), históriu vydaných
 * faktúr (`cakajuce` / `skipped`) a položky konektora. Nič sa neoznačí za
 * odovzdané — to urobí až {@link spracujPolozkyOdpovede}.
 */
export async function zapisDavku(
  supabase: Klient,
  p: {
    companyId: string;
    od: string;
    xml: string;
    polozky: PolozkaDavky[];
    /** Vydané faktúry dávky vrátane vynechaných (história). */
    faktury: Riadok[];
    cislaPreskocenych: Set<string>;
    preskocene: string[];
    pocetFaktur: number;
    /** Čo POHODA nepotvrdzuje (ručné storná, pohyby s nulovým množstvom) — rovno do `pohoda_odoslane`. */
    bezPotvrdenia: { agenda: string; id: string; verzia: string }[];
  },
): Promise<string> {
  const { data: job, error } = await supabase
    .from("export_jobs")
    .insert({
      company_id: p.companyId,
      created_by: null,
      format: "pohoda_xml",
      target_system: "pohoda",
      status: "cakajuce",
      invoice_count: p.pocetFaktur,
      date_from: p.od,
      date_to: p.faktury[p.faktury.length - 1]?.issue_date ?? p.od,
      file_name: SUBOR_DAVKY,
      file_content: p.xml,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const jobId = String(job.id);

  try {
    await poKusoch(p.polozky, (kus) =>
      supabase.from(TABULKA_KONEKTORA).insert(
        kus.map((x) => ({
          company_id: p.companyId,
          export_job_id: jobId,
          polozka_id: x.polozka_id,
          druh: x.druh,
          zaznam_id: x.zaznam_id,
          verzia: x.verzia,
          stav: "odoslane",
        })),
      ),
    );
    const vDavke = new Set(p.polozky.filter((x) => x.druh === "faktura").map((x) => x.zaznam_id));
    const logy = p.faktury
      .map((f: Riadok) => {
        const preskocena = p.cislaPreskocenych.has(f.invoice_number);
        if (!preskocena && !vDavke.has(String(f.id))) return null;
        return {
          export_job_id: jobId,
          company_id: p.companyId,
          invoice_id: f.id,
          invoice_number: f.invoice_number,
          // `cakajuce` nie je „odovzdané“ — faktúra ostane odomknutá, kým POHODA nepotvrdí.
          status: preskocena ? "skipped" : "cakajuce",
          error: preskocena ? (p.preskocene.find((d) => d.startsWith(f.invoice_number)) ?? null) : null,
        };
      })
      .filter(Boolean);
    await poKusoch(logy, (kus) => supabase.from("export_logs").insert(kus));
  } catch (e) {
    // Bez položiek by dávka visela bez možnosti potvrdenia — radšej ju celú zahodiť.
    await supabase.from("export_jobs").delete().eq("id", jobId);
    throw e;
  }

  if (p.bezPotvrdenia.length) {
    const teraz = new Date().toISOString();
    await supabase.from("pohoda_odoslane").upsert(
      p.bezPotvrdenia.map((c) => ({
        company_id: p.companyId,
        agenda: c.agenda,
        zaznam_id: c.id,
        verzia: c.verzia,
        odoslane_at: teraz,
      })),
      { onConflict: "company_id,agenda,zaznam_id" },
    );
  }
  return jobId;
}

/** Filter na verziu dokladu (0 = stĺpec prázdny alebo 0). */
function naVerziu(q: any, verzia: string | null) {
  const v = Math.trunc(Number(verzia) || 0);
  return v > 0 ? q.eq("pohoda_verzia", v) : q.or("pohoda_verzia.is.null,pohoda_verzia.eq.0");
}

/** Doklad potvrdený POHODOU — až teraz je u nás odovzdaný (a zamknutý). */
async function oznacPotvrdene(supabase: Klient, companyId: string, r: RiadokKonektora, v: { cislo: string | null; poznamka: string | null; stav: string }, teraz: string) {
  const job = r.export_job_id;
  switch (r.druh) {
    case "faktura":
      await supabase
        .from("export_logs")
        .update({ status: "ok", pohoda_cislo: v.cislo, pohoda_stav: v.stav, potvrdene_at: teraz, error: v.poznamka })
        .eq("company_id", companyId)
        .eq("export_job_id", job)
        .eq("invoice_id", r.zaznam_id);
      return;
    case "prijata":
      await naVerziu(
        supabase
          .from("purchase_invoices")
          .update({ exported_at: teraz, export_job_id: job, pohoda_cislo: v.cislo })
          .eq("company_id", companyId)
          .eq("id", r.zaznam_id)
          .is("exported_at", null),
        r.verzia,
      );
      return;
    case "doklad":
      await naVerziu(
        supabase
          .from("expense_documents")
          .update({ status: "exported", exported_at: teraz, export_job_id: job, pohoda_cislo: v.cislo })
          .eq("company_id", companyId)
          .eq("id", r.zaznam_id)
          .is("exported_at", null),
        r.verzia,
      );
      return;
    case "pokladna":
      await naVerziu(
        supabase
          .from("cash_entries")
          .update({ exported_at: teraz, export_job_id: job, pohoda_cislo: v.cislo })
          .eq("company_id", companyId)
          .eq("id", r.zaznam_id)
          .is("exported_at", null),
        r.verzia,
      );
      return;
    case "adresar":
    case "sklad":
    case "zakazka":
    case "pohyb":
    case "storno":
      await supabase.from("pohoda_odoslane").upsert(
        {
          company_id: companyId,
          agenda: r.druh,
          zaznam_id: r.zaznam_id,
          verzia: r.verzia ?? teraz,
          odoslane_at: teraz,
        },
        { onConflict: "company_id,agenda,zaznam_id" },
      );
      return;
    default:
      return;
  }
}

export type VysledokPotvrdenia = {
  spracovanych: number;
  zalozenych: number;
  chyby: string[];
  upozornenia: string[];
  chybaBaliku: string | null;
  /** Položky odpovede, ktoré nepatria žiadnej dávke konektora (mesačný balík, ručný súbor). */
  nezname: number;
  nesparovane: import("./pohoda-odpoved").VysledokDokladu[];
};

/**
 * Zapíše odpoveď POHODY k položkám dávky.
 *
 * Položka sa páruje podľa presného `dataPackItem id` (aj storno `<id>-storno`,
 * V12); z viacerých dávok s tým istým id má prednosť čakajúca, potom
 * najnovšia (aj vypršaná — neskorá odpoveď sa započíta). Položky dávky, o
 * ktorých odpoveď mlčí, sa vrátia do fronty.
 */
export async function spracujPolozkyOdpovede(
  supabase: Klient,
  vstup: { companyId: string; balik: OdpovedPohody; jeCiselnik?: (id: string) => boolean },
): Promise<VysledokPotvrdenia> {
  const teraz = new Date().toISOString();
  const chyby: string[] = [];
  const upozornenia: string[] = [];
  let zalozenych = 0;
  const nesparovane: import("./pohoda-odpoved").VysledokDokladu[] = [];
  const polozky = vstup.balik.polozky.filter((v) => !vstup.jeCiselnik?.(v.id));

  if (vstup.balik.stav === "error" && !vstup.balik.polozky.length) {
    const dovod = `POHODA odmietla celý balík: ${vstup.balik.poznamka ?? "bez popisu"} — doklady sa vrátili do fronty a pôjdu znova v ďalšej dávke.`;
    chyby.push(dovod);
    await odmietniPoslednuDavku(supabase, vstup.companyId, dovod);
    return { spracovanych: 0, zalozenych: 0, chyby, upozornenia, chybaBaliku: dovod, nezname: 0, nesparovane };
  }

  // Riadky dávok k id z odpovede.
  const ids = [...new Set(polozky.map((v) => v.id))];
  const riadky: RiadokKonektora[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase
      .from(TABULKA_KONEKTORA)
      .select("id, export_job_id, polozka_id, druh, zaznam_id, verzia, stav, pohoda_cislo, created_at")
      .eq("company_id", vstup.companyId)
      .in("polozka_id", ids.slice(i, i + 150))
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) hod(error);
    riadky.push(...((data ?? []) as RiadokKonektora[]));
  }
  const dotknuteJoby = new Set<string>();

  for (const v of polozky) {
    const kandidati = riadky.filter((r) => r.polozka_id === v.id);
    const cakajuci = kandidati.find((r) => r.stav === "odoslane");
    const job = (cakajuci ?? kandidati[0])?.export_job_id;
    const ciel = kandidati.filter((r) => r.export_job_id === job);
    if (!ciel.length) {
      nesparovane.push(v);
      continue;
    }
    if (job) dotknuteJoby.add(job);
    const s = stavZOdpovede(v);
    const nazov = v.cislo ?? v.id;
    if (s.stav === "chyba") chyby.push(`${nazov}: ${s.poznamka ?? "neznáma chyba"}`);
    else {
      zalozenych++;
      if (s.poznamka) upozornenia.push(`${nazov}: ${s.poznamka}`);
    }
    for (const r of ciel) {
      await supabase
        .from(TABULKA_KONEKTORA)
        .update({ stav: s.stav, pohoda_cislo: s.cislo, chyba: s.poznamka, potvrdene_at: teraz })
        .eq("id", r.id);
      if (s.stav === "ok") await oznacPotvrdene(supabase, vstup.companyId, r, { ...s, stav: v.stav }, teraz);
      else if (r.druh === "faktura")
        await supabase
          .from("export_logs")
          .update({ status: "error", error: s.poznamka, pohoda_stav: "error", pohoda_cislo: s.cislo, potvrdene_at: teraz })
          .eq("company_id", vstup.companyId)
          .eq("export_job_id", r.export_job_id)
          .eq("invoice_id", r.zaznam_id);
    }
  }

  // Položky dotknutých dávok, o ktorých odpoveď mlčí — POHODA ich nespracovala.
  for (const job of dotknuteJoby) {
    const dovod =
      "POHODA o tejto položke dávky nevrátila nič (súbor mohol byť odrezaný) — pôjde znova v ďalšej dávke.";
    const { data: zvysne } = await supabase
      .from(TABULKA_KONEKTORA)
      .update({ stav: "chyba", chyba: dovod, potvrdene_at: teraz })
      .eq("company_id", vstup.companyId)
      .eq("export_job_id", job)
      .eq("stav", "odoslane")
      .select("polozka_id");
    if ((zvysne ?? []).length) chyby.push(`${(zvysne ?? []).length}× ${dovod}`);
    await supabase
      .from("export_logs")
      .update({ status: "error", error: dovod, pohoda_stav: "error", potvrdene_at: teraz })
      .eq("company_id", vstup.companyId)
      .eq("export_job_id", job)
      .eq("status", "cakajuce");
    await supabase.from("export_jobs").update({ status: "completed", error: null }).eq("id", job);
  }

  return {
    spracovanych: polozky.length,
    zalozenych,
    chyby,
    upozornenia,
    chybaBaliku: null,
    nezname: nesparovane.length,
    nesparovane,
  };
}

/**
 * Človek v Kontrole Pohody potvrdil, že pôvodnú verziu opraveného dokladu v
 * POHODE zmazal — konektor potom opravu pošle (V13). Viaže sa na verziu:
 * ďalšie vrátenie chce nové potvrdenie.
 */
export async function potvrdZmazanieVPohode(
  admin: Klient,
  p: { companyId: string; druh: "faktura" | "prijata" | "doklad" | "pokladna"; id: string; verzia: number; userId: string },
): Promise<void> {
  const { error } = await admin.from(TABULKA_KONEKTORA).insert({
    company_id: p.companyId,
    export_job_id: null,
    polozka_id: `zmazane-${p.druh}-${p.id}-${p.verzia}`,
    druh: "zmazane_v_pohode",
    zaznam_id: p.id,
    verzia: String(p.verzia),
    stav: "ok",
    potvrdene_at: new Date().toISOString(),
    created_by: p.userId,
  });
  if (error) hod(error);
}

export type DrzanaOprava = {
  druh: "faktura" | "prijata" | "doklad" | "pokladna";
  id: string;
  cislo: string;
  verzia: number;
  dovod: string;
  povodneCislo: string | null;
  /** Dá sa uvoľniť potvrdením „pôvodný je v POHODE zmazaný“. */
  potvrditZmazanie: boolean;
};

/**
 * Opravy odovzdaných dokladov v dávke (V13). Doklad s `pohoda_verzia` > 0 sa
 * vrátil z POHODY — jeho predošlá verzia tam ostala. Vráti, ktoré doklady
 * z dávky vyradiť (čakajú na storno či na potvrdenie zmazania), položky
 * storna pôvodných verzií a hlášky.
 */
export async function opravyVDavke(
  supabase: Klient,
  companyId: string,
  doklady: { druh: DrzanaOprava["druh"]; riadok: Riadok; cislo: string }[],
  cislaVPohode: Map<string, string>,
  tolerovat = false,
): Promise<{
  vyradit: Set<string>;
  stornaXml: string;
  stornaOprav: { id: string; predoslaVerzia: string }[];
  drzane: DrzanaOprava[];
  cakaju: string[];
}> {
  const { rozhodnutieOpravy, stornoOpravyXml, idStornaOpravy, blokPolozky } = await import(
    "./pohoda-konektor-davka"
  );
  const opravy = doklady.filter((d) => Math.trunc(Number(d.riadok?.pohoda_verzia) || 0) > 0);
  const out = {
    vyradit: new Set<string>(),
    stornaXml: "",
    stornaOprav: [] as { id: string; predoslaVerzia: string }[],
    drzane: [] as DrzanaOprava[],
    cakaju: [] as string[],
  };
  if (!opravy.length) return out;
  const riadky = await riadkyKZaznamom(
    supabase,
    companyId,
    opravy.map((d) => String(d.riadok.id)),
    tolerovat,
  );
  const subory = new Map<string, string>();
  for (const d of opravy) {
    const id = String(d.riadok.id);
    const verzia = Math.trunc(Number(d.riadok.pohoda_verzia) || 0);
    const r = rozhodnutieOpravy({
      druh: d.druh,
      verzia,
      riadky: riadky.filter((x) => String(x.zaznam_id) === id),
      cislo: d.cislo,
      cisloVPohode: d.druh === "faktura" ? (cislaVPohode.get(id) ?? null) : null,
    });
    if (r.akcia === "poslat") continue;
    out.vyradit.add(id);
    if (r.akcia === "cakat") {
      out.cakaju.push(r.dovod);
      continue;
    }
    if (r.akcia === "drzat") {
      out.drzane.push({ druh: d.druh, id, cislo: d.cislo, verzia, dovod: r.dovod, povodneCislo: r.povodneCislo, potvrditZmazanie: r.potvrditZmazanie });
      continue;
    }
    // Storno pôvodnej verzie v tej istej agende — vyčíta sa z dávky, v ktorej odišla.
    const job = r.povodna.export_job_id;
    if (job && !subory.has(job)) {
      const { data } = await supabase.from("export_jobs").select("file_content").eq("id", job).maybeSingle();
      subory.set(job, String(data?.file_content ?? ""));
    }
    const blok = job ? blokPolozky(subory.get(job) ?? "", r.povodna.polozka_id) : null;
    const xml = blok
      ? stornoOpravyXml({ id: idStornaOpravy(id, r.predoslaVerzia), cislo: r.cislo, povodnyBlok: blok })
      : null;
    if (!xml) {
      out.drzane.push({
        druh: d.druh,
        id,
        cislo: d.cislo,
        verzia,
        dovod: `${d.cislo} — oprava dokladu č. ${r.cislo} v POHODE, ktorý sa cez XML stornovať nedá (interný doklad). Zmažte ho v POHODE a potvrďte to v Kontrole Pohody`,
        povodneCislo: r.cislo,
        potvrditZmazanie: true,
      });
      continue;
    }
    out.stornaXml += xml;
    out.stornaOprav.push({ id, predoslaVerzia: r.predoslaVerzia });
    out.cakaju.push(`${d.cislo} — najprv ide storno pôvodného dokladu č. ${r.cislo} v POHODE, oprava po jeho potvrdení`);
  }
  return out;
}
