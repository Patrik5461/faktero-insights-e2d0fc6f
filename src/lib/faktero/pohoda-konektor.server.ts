/**
 * Konektor do Pohody — priame prepojenie bez nášho programu na Windows.
 *
 * POHODA vie XML import spustiť z príkazového riadku
 * (`Pohoda.exe /XML "meno" "heslo" "import.ini"`), takže celý most je jedna
 * naplánovaná úloha u účtovníčky a dva endpointy tu:
 *
 *   1. stiahne si dávku (`/api/v1/pohoda/davka`),
 *   2. dá ju Pohode načítať,
 *   3. pošle nám späť `responsePack` (`/api/v1/pohoda/odpoved`), v ktorom je
 *      pri každom doklade stav a číslo, ktoré mu Pohoda pridelila.
 *
 * Von z jej počítača ide len obyčajné HTTPS — nič sa neotvára, nič sa
 * neinštaluje. Alternatíva cez POHODA mServer by znamenala vlastný program pre
 * Windows, druhú spustenú inštanciu Pohody a Stormware ju sám neodporúča
 * vystavovať mimo vnútornej siete.
 */
import type { PohodaNastavenia } from "./export.server";

/** Riadky z databázy sa tu netypujú — modul ich len prekladá do XML. */
type Riadok = any;
type Klient = any;

/**
 * Najviac dokladov v jednej dávke.
 *
 * Konektor beží denne, takže bežná dávka má jednotky dokladov. Strop chráni
 * pred prvým spustením po dlhšej odmlke, keď by inak prišiel súbor, ktorý
 * Pohoda spracúva desiatky minút. Zvyšok príde ďalší deň.
 */
export const STROP_DAVKY = 200;

/**
 * Odkedy sa doklady posielajú, keď konektor nepovie inak.
 *
 * Zámerne **nie od začiatku evidencie**. Konektor je na priebežnú prácu; staršie
 * doklady už účtovníčka spravidla má a hromadné dosypanie histórie patrí do
 * mesačného balíka, kde je nad ním človek.
 */
export function predvolenyZaciatok(dnes: Date): string {
  const r = dnes.getUTCFullYear();
  const m = dnes.getUTCMonth(); // 0–11, čiže už minulý mesiac
  const rok = m === 0 ? r - 1 : r;
  const mesiac = m === 0 ? 12 : m;
  return `${rok}-${String(mesiac).padStart(2, "0")}-01`;
}

export type Davka = {
  /** Prázdny reťazec, keď nie je čo posielať. */
  xml: string;
  prazdna: boolean;
  jobId: string | null;
  faktur: number;
  dokladov: number;
  pokladnicnych: number;
  zakaznikov: number;
  zasob: number;
  preskocene: string[];
};

/**
 * Číselníky sa neposielajú podľa dátumu, ale podľa zmeny.
 *
 * Porovnať dva stĺpce sa cez PostgREST filtrom nedá, preto sa najprv natiahnu
 * len tri malé stĺpce a porovnanie prebehne tu. Na tisíckach riadkov je to
 * stále lacnejšie než sťahovať celé karty.
 */
async function cakajuceIds(
  supabase: Klient,
  tabulka: "customers" | "stock_items",
  companyId: string,
  stlpecZmazania: "deleted_at" | "archived_at",
): Promise<string[]> {
  const { data } = await supabase
    .from(tabulka)
    .select(`id, updated_at, pohoda_odoslane_at`)
    .eq("company_id", companyId)
    .is(stlpecZmazania, null);

  return (data ?? [])
    .filter(
      (r: Riadok) => !r.pohoda_odoslane_at || String(r.updated_at) > String(r.pohoda_odoslane_at),
    )
    .slice(0, STROP_DAVKY)
    .map((r: Riadok) => r.id as string);
}

function nahodnyToken(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export function zakladnaAdresa(): string {
  return (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
}

/**
 * Zostaví dávku pre konektor: faktúry, prijaté doklady a pokladňu naraz.
 *
 * Pri `oznacit` sa zapíše história odovzdania — bez nej by ďalšie spustenie
 * poslalo to isté znova. Doklad, ktorý Pohoda odmietne, sa v odpovedi vráti
 * medzi neúspešné a do ďalšej dávky sa vráti (`spracujOdpoved`).
 */
export async function zostavDavku(
  supabase: Klient,
  vstup: { companyId: string; od?: string | null; oznacit: boolean; dnes?: Date },
): Promise<Davka> {
  const od = vstup.od || predvolenyZaciatok(vstup.dnes ?? new Date());

  const { data: company, error: cErr } = await supabase
    .from("companies")
    .select("*")
    .eq("id", vstup.companyId)
    .single();
  if (cErr) throw new Error(cErr.message);
  if (!company) throw new Error("Firma nenájdená");

  const [{ data: vsetkyFaktury, error: fErr }, { data: uzOdovzdane }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*")
      .eq("company_id", vstup.companyId)
      .gte("issue_date", od)
      .neq("status", "draft")
      .neq("status", "cancelled")
      .is("deleted_at", null)
      .order("issue_date")
      .limit(STROP_DAVKY),
    supabase
      .from("export_logs")
      .select("invoice_id")
      .eq("company_id", vstup.companyId)
      .eq("status", "ok"),
  ]);
  if (fErr) throw new Error(fErr.message);

  const odovzdane = new Set((uzOdovzdane ?? []).map((r: Riadok) => r.invoice_id));
  const faktury = (vsetkyFaktury ?? []).filter((f: Riadok) => !odovzdane.has(f.id));

  const [{ data: doklady }, { data: pokladnica }] = await Promise.all([
    supabase
      .from("expense_documents")
      .select("*")
      .eq("company_id", vstup.companyId)
      .gte("issue_date", od)
      .is("exported_at", null)
      .order("issue_date")
      .limit(STROP_DAVKY),
    supabase
      .from("cash_entries")
      .select("*")
      .eq("company_id", vstup.companyId)
      .gte("entry_date", od)
      .is("exported_at", null)
      .order("entry_date")
      .limit(STROP_DAVKY),
  ]);

  // Číselníky — len keď si ich firma zapla. Sklad navyše potrebuje členenie,
  // bez neho Pohoda kartu nezaloží, tak sa ani neposiela.
  const zakaznici = company.pohoda_posielat_adresar
    ? await nacitajCakajuce(supabase, "customers", vstup.companyId, "deleted_at")
    : [];
  const zasoby =
    company.pohoda_posielat_sklad && company.pohoda_sklad
      ? await nacitajZasoby(supabase, vstup.companyId)
      : [];

  const prazdna =
    !faktury.length &&
    !doklady?.length &&
    !pokladnica?.length &&
    !zakaznici.length &&
    !zasoby.length;
  if (prazdna) {
    return {
      xml: "",
      prazdna: true,
      jobId: null,
      faktur: 0,
      dokladov: 0,
      pokladnicnych: 0,
      zakaznikov: 0,
      zasob: 0,
      preskocene: [],
    };
  }

  const { data: polozky } = faktury.length
    ? await supabase
        .from("invoice_items")
        .select("*")
        .in(
          "invoice_id",
          faktury.map((f: Riadok) => f.id),
        )
        .order("position")
    : { data: [] };

  const nastavenia: PohodaNastavenia = {
    predkontacia: company.pohoda_predkontacia,
    predkontaciaZaloha: company.pohoda_predkontacia_zaloha,
    predkontaciaDobropis: company.pohoda_predkontacia_dobropis,
    clenenieDph: company.pohoda_clenenie_dph,
    clenenieDphPdp: company.pohoda_clenenie_dph_pdp,
    predkontaciaPrijata: company.pohoda_predkontacia_prijata,
    clenenieDphPrijata: company.pohoda_clenenie_dph_prijata,
    pokladna: company.pohoda_pokladna,
    predkontaciaPokladna: company.pohoda_predkontacia_pokladna,
    sklad: company.pohoda_sklad,
  };

  const odkazy = company.pohoda_odkaz_na_pdf ? await odkazyNaPdf(supabase, faktury) : {};

  const { buildPohodaDavkaXml, pohodaPrekazka } = await import("./export.server");
  const preskocene = faktury
    .map((f: Riadok) => pohodaPrekazka(f, company))
    .filter((d: string | null): d is string => !!d);

  const xml = buildPohodaDavkaXml({
    company,
    invoices: faktury.map((invoice: Riadok) => ({
      invoice,
      items: (polozky ?? []).filter((p: Riadok) => p.invoice_id === invoice.id),
    })),
    doklady: doklady ?? [],
    pohyby: pokladnica ?? [],
    zakaznici,
    zasoby,
    nastavenia,
    odkazy,
  });

  const cislaPreskocenych = new Set<string>(
    preskocene.map((d: string) => String(d).split(" — ")[0]),
  );
  const vyvezene = faktury.filter((f: Riadok) => !cislaPreskocenych.has(f.invoice_number));

  let jobId: string | null = null;
  if (vstup.oznacit) {
    jobId = await zapisOdovzdanie(supabase, {
      companyId: vstup.companyId,
      od,
      xml,
      faktury,
      vyvezenePocet: vyvezene.length,
      cislaPreskocenych,
      preskocene,
      dokladyIds: (doklady ?? []).map((d: Riadok) => d.id),
      pokladnicaIds: (pokladnica ?? []).map((p: Riadok) => p.id),
      zakazniciIds: zakaznici.map((z: Riadok) => z.id),
      zasobyIds: zasoby.map((s: Riadok) => s.id),
    });
  }

  return {
    xml,
    prazdna: false,
    jobId,
    faktur: vyvezene.length,
    dokladov: doklady?.length ?? 0,
    pokladnicnych: pokladnica?.length ?? 0,
    zakaznikov: zakaznici.length,
    zasob: zasoby.length,
    preskocene,
  };
}

/** Kontakty, ktoré ešte neodišli alebo sa od odoslania zmenili. */
async function nacitajCakajuce(
  supabase: Klient,
  tabulka: "customers",
  companyId: string,
  stlpecZmazania: "deleted_at",
): Promise<Riadok[]> {
  const ids = await cakajuceIds(supabase, tabulka, companyId, stlpecZmazania);
  if (!ids.length) return [];
  const { data } = await supabase.from(tabulka).select("*").in("id", ids);
  return data ?? [];
}

/**
 * Skladové karty aj s názvom.
 *
 * Názov, kód a jednotka nie sú na skladovej karte, ale na produkte — bez
 * pripojenia by do Pohody odišla karta bez názvu a tú by odmietla.
 */
async function nacitajZasoby(supabase: Klient, companyId: string): Promise<Riadok[]> {
  const ids = await cakajuceIds(supabase, "stock_items", companyId, "archived_at");
  if (!ids.length) return [];

  const { data } = await supabase
    .from("stock_items")
    .select("*, products(name, code, unit, vat_rate)")
    .in("id", ids);

  return (data ?? []).map((s: Riadok) => ({
    ...s,
    nazov: s.products?.name ?? null,
    sku: s.sku || s.products?.code || null,
    unit: s.unit || s.products?.unit || "ks",
    vat_rate: s.vat_rate ?? s.products?.vat_rate ?? 0,
  }));
}

/**
 * Krátky verejný odkaz na PDF faktúry.
 *
 * Podpísaný odkaz zo Supabase sa do Pohody nezmestí — schéma dáva URL adrese
 * 255 znakov a podpis má aj s tokenom vyše troch stoviek, navyše mu vyprší
 * platnosť. Preto má faktúra vlastný náhodný token a podpis sa vyrába až pri
 * kliknutí.
 */
async function odkazyNaPdf(supabase: Klient, faktury: Riadok[]): Promise<Record<string, string>> {
  const zaklad = zakladnaAdresa();
  const odkazy: Record<string, string> = {};
  for (const f of faktury) {
    let token = f.pdf_token as string | null;
    if (!token) {
      token = nahodnyToken();
      const { error } = await supabase.from("invoices").update({ pdf_token: token }).eq("id", f.id);
      // Bez tokenu ostane doklad bez odkazu — kvôli tomu sa dávka nezhodí.
      if (error) continue;
    }
    odkazy[String(f.id)] = `${zaklad}/api/public/faktura/${token}`;
  }
  return odkazy;
}

async function zapisOdovzdanie(
  supabase: Klient,
  p: {
    companyId: string;
    od: string;
    xml: string;
    faktury: Riadok[];
    vyvezenePocet: number;
    cislaPreskocenych: Set<string>;
    preskocene: string[];
    dokladyIds: string[];
    pokladnicaIds: string[];
    zakazniciIds: string[];
    zasobyIds: string[];
  },
): Promise<string | null> {
  const { data: job, error } = await supabase
    .from("export_jobs")
    .insert({
      company_id: p.companyId,
      created_by: null,
      format: "pohoda_xml",
      target_system: "pohoda",
      status: "completed",
      invoice_count: p.vyvezenePocet,
      date_from: p.od,
      date_to: p.faktury[p.faktury.length - 1]?.issue_date ?? p.od,
      file_name: "pohoda-davka.xml",
      file_content: p.xml,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (!job) return null;

  if (p.faktury.length) {
    await supabase.from("export_logs").insert(
      p.faktury.map((f: Riadok) => ({
        export_job_id: job.id,
        company_id: p.companyId,
        invoice_id: f.id,
        invoice_number: f.invoice_number,
        status: p.cislaPreskocenych.has(f.invoice_number) ? "skipped" : "ok",
        error: p.preskocene.find((d) => d.startsWith(f.invoice_number)) ?? null,
      })),
    );
  }
  const teraz = new Date().toISOString();
  if (p.dokladyIds.length) {
    await supabase
      .from("expense_documents")
      .update({ status: "exported", exported_at: teraz, export_job_id: job.id })
      .in("id", p.dokladyIds);
  }
  if (p.pokladnicaIds.length) {
    await supabase
      .from("cash_entries")
      .update({ exported_at: teraz, export_job_id: job.id })
      .in("id", p.pokladnicaIds);
  }
  if (p.zakazniciIds.length) {
    await supabase.from("customers").update({ pohoda_odoslane_at: teraz }).in("id", p.zakazniciIds);
  }
  if (p.zasobyIds.length) {
    await supabase.from("stock_items").update({ pohoda_odoslane_at: teraz }).in("id", p.zasobyIds);
  }
  return job.id as string;
}

/** Jeden doklad tak, ako o ňom Pohoda referuje v `responsePack`. */
export type VysledokDokladu = {
  id: string;
  stav: "ok" | "warning" | "error";
  cislo: string | null;
  poznamka: string | null;
};

function atribut(znacka: string, nazov: string): string | null {
  const m = znacka.match(new RegExp(`\\b${nazov}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : null;
}

/** Obsah prvého elementu s daným lokálnym názvom (bez ohľadu na predponu). */
function vnutro(xml: string, nazov: string): string | null {
  const m = xml.match(
    new RegExp(
      `<(?:[A-Za-z0-9_.-]+:)?${nazov}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?${nazov}>`,
      "i",
    ),
  );
  return m ? m[1] : null;
}

/** Všetky texty elementu s daným lokálnym názvom. */
function vsetkyTexty(xml: string, nazov: string): string[] {
  const re = new RegExp(
    `<(?:[A-Za-z0-9_.-]+:)?${nazov}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?${nazov}>`,
    "gi",
  );
  const von: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) von.push(m[1]);
  return von;
}

function bezZnaciek(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Rozoberie `responsePack` z Pohody.
 *
 * Parsuje sa reťazcom, nie XML knižnicou: odpoveď má vyše tridsať menných
 * priestorov podľa agendy a jediné, čo z nej potrebujeme, je pri každej položke
 * jej `id`, stav, pridelené číslo a text chyby.
 */
export function rozoberOdpoved(xml: string): VysledokDokladu[] {
  const vysledky: VysledokDokladu[] = [];
  const re =
    /<(?:[A-Za-z0-9_.-]+:)?responsePackItem\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z0-9_.-]+:)?responsePackItem>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const id = atribut(m[1], "id");
    if (!id) continue;
    const telo = m[2];
    const stavAtr = (atribut(m[1], "state") ?? "").toLowerCase();

    const vyrobene = vnutro(telo, "producedDetails");
    const cislo = vyrobene ? bezZnaciek(vnutro(vyrobene, "number") ?? "") || null : null;

    // Chyby a upozornenia sú v `importDetails/detail/note`. Do histórie ide
    // dôvod, prečo doklad neprešiel — bez neho by sa len ticho stratil.
    const detaily = vnutro(telo, "importDetails");
    const poznamka = detaily
      ? vsetkyTexty(detaily, "note").map(bezZnaciek).filter(Boolean).join(" · ").slice(0, 400) ||
        bezZnaciek(detaily).slice(0, 400) ||
        null
      : null;

    const stav: VysledokDokladu["stav"] =
      stavAtr === "error" ? "error" : stavAtr === "warning" ? "warning" : "ok";

    vysledky.push({ id, stav, cislo, poznamka: stav === "ok" ? null : poznamka });
  }
  return vysledky;
}

/**
 * Identifikátor bez verzie.
 *
 * Doklady posielame pod holým `id`, číselníky pod `id-verzia` (aby zmenená
 * karta prešla kontrolou duplicity). Späť sa mapujú obidva rovnako.
 */
export function holeId(id: string): string {
  const m = String(id).match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-\d+)?$/i,
  );
  return m ? m[1] : String(id);
}

export type SpracovanieOdpovede = {
  spracovanych: number;
  zalozenych: number;
  chybnych: number;
  chyby: string[];
};

/**
 * Zapíše výsledok importu.
 *
 * Doklad, ktorý Pohoda odmietla, sa vráti späť do fronty — inak by zmizol:
 * u nás by bol označený za odovzdaný a v Pohode by neexistoval. Toto je hlavný
 * dôvod, prečo sa odpoveď vôbec posiela späť.
 */
export async function spracujOdpoved(
  supabase: Klient,
  vstup: { companyId: string; xml: string },
): Promise<SpracovanieOdpovede> {
  const vysledky = rozoberOdpoved(vstup.xml);
  const teraz = new Date().toISOString();
  const chyby: string[] = [];
  let zalozenych = 0;

  for (const v of vysledky) {
    const chyba = v.stav === "error";
    if (chyba) chyby.push(`${v.cislo ?? v.id}: ${v.poznamka ?? "neznáma chyba"}`);
    else zalozenych++;

    // Číselníky nesú v identifikátore aj verziu záznamu — späť sa mapujú na
    // holé id.
    const id = holeId(v.id);

    const { data: log } = await supabase
      .from("export_logs")
      .select("id")
      .eq("company_id", vstup.companyId)
      .eq("invoice_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (log) {
      await supabase
        .from("export_logs")
        .update({
          pohoda_cislo: v.cislo,
          pohoda_stav: v.stav,
          potvrdene_at: teraz,
          // `ok` je pre nás „odovzdané" — chybný doklad sa musí vrátiť do fronty.
          status: chyba ? "error" : "ok",
          error: chyba ? v.poznamka : null,
        })
        .eq("id", log.id);
      continue;
    }

    // Nie je to faktúra — skús prijatý doklad, pokladňu a nakoniec číselníky.
    const { data: doklad } = await supabase
      .from("expense_documents")
      .select("id")
      .eq("company_id", vstup.companyId)
      .eq("id", id)
      .maybeSingle();
    if (doklad) {
      await supabase
        .from("expense_documents")
        .update({
          pohoda_cislo: v.cislo,
          ...(chyba ? { exported_at: null, status: "new" } : {}),
        })
        .eq("id", id);
      continue;
    }

    const { data: pohyb } = await supabase
      .from("cash_entries")
      .select("id")
      .eq("company_id", vstup.companyId)
      .eq("id", id)
      .maybeSingle();
    if (pohyb) {
      await supabase
        .from("cash_entries")
        .update({ pohoda_cislo: v.cislo, ...(chyba ? { exported_at: null } : {}) })
        .eq("id", id);
      continue;
    }

    // Adresár a sklad: odmietnutá karta sa vráti do fronty tým, že sa zabudne,
    // kedy odišla. Číslo si Pohoda pri číselníkoch neprideľuje.
    if (!chyba) continue;
    for (const tabulka of ["customers", "stock_items"] as const) {
      const { data: r } = await supabase
        .from(tabulka)
        .select("id")
        .eq("company_id", vstup.companyId)
        .eq("id", id)
        .maybeSingle();
      if (r) {
        await supabase.from(tabulka).update({ pohoda_odoslane_at: null }).eq("id", id);
        break;
      }
    }
  }

  return {
    spracovanych: vysledky.length,
    zalozenych,
    chybnych: chyby.length,
    chyby: chyby.slice(0, 20),
  };
}

/**
 * Text odpovede z Pohody.
 *
 * Pohoda zapisuje XML vo Windows-1250 a `Request.text()` by z diakritiky v
 * chybových hláškach urobil nečitateľnú kašu.
 */
export function dekodujOdpoved(bajty: ArrayBuffer): string {
  const zaciatok = new TextDecoder("ascii").decode(new Uint8Array(bajty).slice(0, 200));
  const m = zaciatok.match(/encoding\s*=\s*["']([\w-]+)["']/i);
  const kodovanie = (m?.[1] ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(kodovanie).decode(bajty);
  } catch {
    return new TextDecoder("utf-8").decode(bajty);
  }
}
