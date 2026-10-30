/*
  Návrh zaúčtovania od AI — databáza a volanie modelu. Logika je
  v `ai-predkontacia.ts`.

  Všetko ide cez klienta prihláseného (RLS, oblasť „doklady"); pamäť
  návrhov je v `ai_navrhy_zauctovania`. Návrh je doplnok: žiadna chyba
  (výpadok AI, zlá odpoveď, chýbajúca tabuľka) nesmie zhodiť otvorenie
  dokladu — vráti sa len stav bez návrhu.
*/

import {
  bezCiselnika,
  MAX_HROMADNE,
  navykPola,
  odtlacok,
  platnyZPamate,
  pokynAi,
  poliaPreAi,
  potrebujeAi,
  povoleneKody,
  SCHEMA_ODPOVEDE,
  spracujOdpoved,
  vstupZBlocku,
  vstupZPrijatej,
  zlucNavrhy,
  type Krajina,
  type NavrhAi,
  type PoleNavrhu,
  type PovoleneKody,
  type TypDokladuNavrhu,
  type VstupNavrhu,
  type VysledokNavrhu,
  type ZlucenyNavrh,
  type StavNavrhu,
} from "./ai-predkontacia";
export type { VysledokNavrhu, StavNavrhu };
import { klucDodavatela, navrhPola, type DruhUcenia, type PoliaNavyku } from "./ucenie-z-oprav";
import {
  krajinaDokladu,
  prvePravidlo,
  typPrijatej,
  type DokladNaPorovnanie,
  type Pravidlo,
} from "./pravidla-uctovania";

import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
type Klient = any;

const prazdnyVysledok = (stav: StavNavrhu): VysledokNavrhu => ({ stav, polia: {}, dovod: null });

/** Strop jedného volania modelu — nad ním sa návrh vzdá (30 s nginxu). */
const STROP_AI_MS = 12_000;

/** Kontext firmy — načíta sa raz aj pre päťdesiat dokladov. */
export type KontextFirmy = {
  krajina: string;
  ciselnik: any[];
  pravidla: Pravidlo[];
  pouzite: {
    prijata: { pk: string[]; cl: string[] };
    doklad: { pk: string[]; cl: string[] };
    kv: string[];
    kategorie: string[];
  };
};

const podlaPoctu = (hodnoty: unknown[], max = 40): string[] => {
  const m = new Map<string, number>();
  for (const h of hodnoty) {
    const t = String(h ?? "").trim();
    if (t) m.set(t, (m.get(t) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .slice(0, max);
};

export async function nacitajKontext(supabase: Klient, companyId: string): Promise<KontextFirmy> {
  const [
    { data: firma },
    { data: ciselnik },
    { data: pravidla },
    { data: faktury },
    { data: doklady },
  ] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "country, pohoda_predkontacia_prijata, pohoda_clenenie_dph_prijata, pohoda_predkontacia_doklady, pohoda_clenenie_dph_doklady",
      )
      .eq("id", companyId)
      .maybeSingle(),
    supabase
      .from("predkontacie")
      .select("druh, kod, popis, agenda, ucet_md, ucet_d, aktivne, druhy_dokladov")
      .eq("company_id", companyId)
      .in("druh", ["predkontacia", "clenenie_dph"])
      .limit(1000),
    supabase.from("pravidla_uctovania").select("*").eq("company_id", companyId).eq("aktivne", true),
    supabase
      .from("purchase_invoices")
      .select("pohoda_predkontacia, pohoda_clenenie_dph, kv_clenenie, category")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("expense_documents")
      .select("pohoda_predkontacia, pohoda_clenenie_dph, kv_clenenie, category")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  const f = (faktury ?? []) as any[];
  const d = (doklady ?? []) as any[];
  const p = (pravidla ?? []) as any[];
  return {
    krajina: String(firma?.country ?? "SK").toUpperCase(),
    ciselnik: (ciselnik ?? []) as any[],
    pravidla: p as Pravidlo[],
    pouzite: {
      prijata: {
        pk: podlaPoctu([
          firma?.pohoda_predkontacia_prijata,
          ...f.map((r) => r.pohoda_predkontacia),
          ...p.map((r) => r.predkontacia),
        ]),
        cl: podlaPoctu([
          firma?.pohoda_clenenie_dph_prijata,
          ...f.map((r) => r.pohoda_clenenie_dph),
          ...p.map((r) => r.clenenie_dph),
        ]),
      },
      doklad: {
        pk: podlaPoctu([
          firma?.pohoda_predkontacia_doklady,
          ...d.map((r) => r.pohoda_predkontacia),
          ...p.map((r) => r.predkontacia),
        ]),
        cl: podlaPoctu([
          firma?.pohoda_clenenie_dph_doklady,
          ...d.map((r) => r.pohoda_clenenie_dph),
          ...p.map((r) => r.clenenie_dph),
        ]),
      },
      kv: podlaPoctu([...f, ...d].map((r) => r.kv_clenenie)),
      kategorie: podlaPoctu([...f, ...d].map((r) => r.category)),
    },
  };
}

/** Povolené kódy pre druh dokladu podľa kontextu firmy. */
export async function povolenePre(k: KontextFirmy, druh: DruhUcenia): Promise<PovoleneKody> {
  const { KV_PRIJATE } = await import("./kv-clenenie");
  const { KATEGORIE_VYDAVKOV } = await import("@/lib/mobile/kategorie-vydavkov");
  const blocek = druh === "blocek";
  const pouzite = blocek ? k.pouzite.doklad : k.pouzite.prijata;
  return povoleneKody({
    ciselnik: k.ciselnik,
    agendy: blocek
      ? ["receivedInvoice", "cashPaid", "internalDocument"]
      : druh === "zalohova"
        ? ["receivedAdvanceInvoice", "receivedInvoice"]
        : ["receivedInvoice"],
    kluc: blocek ? "doklady" : "prijata",
    pouzitePredkontacie: pouzite.pk,
    pouziteClenenia: pouzite.cl,
    // Kontrolný výkaz je slovenský — česká firma má kontrolní hlášení inde.
    pouziteKv: k.krajina === "SK" ? k.pouzite.kv : [],
    pouziteKategorie: k.pouzite.kategorie,
    kvMoznosti: KV_PRIJATE,
    kategorieMoznosti: KATEGORIE_VYDAVKOV.map((x) => ({ kod: x.kod, nazov: x.nazov })),
  });
}

/** Naučený návyk dodávateľa pre polia návrhu. */
async function navykDodavatela(
  supabase: Klient,
  companyId: string,
  dodavatel: { ico?: string | null; icDph?: string | null; nazov?: string | null },
  druh: DruhUcenia,
): Promise<Partial<Record<PoleNavrhu, string>>> {
  const kluc = klucDodavatela(dodavatel);
  if (!kluc) return {};
  const { data } = await supabase
    .from("doklad_navyky")
    .select("polia")
    .eq("company_id", companyId)
    .eq("kluc_dodavatela", kluc)
    .eq("druh", druh)
    .maybeSingle();
  const polia = (data?.polia ?? null) as PoliaNavyku | null;
  if (!polia) return {};
  const out: Partial<Record<PoleNavrhu, string>> = {};
  for (const pole of ["predkontacia", "clenenie", "kv", "kategoria"] as PoleNavrhu[]) {
    const h = navykPola(polia[pole], navrhPola(polia[pole]));
    if (h) out[pole] = h;
  }
  return out;
}

function zPravidla(p: Pravidlo | null): Partial<Record<PoleNavrhu, string>> {
  if (!p) return {};
  return {
    predkontacia: p.predkontacia ?? "",
    clenenie: p.clenenie_dph ?? "",
    kv: p.kv_clenenie ?? "",
    kategoria: p.kategoria ?? "",
  };
}

/** Volanie modelu so stropom času. Pri výpadku vráti `undefined`. */
async function zavolajAi(
  v: VstupNavrhu,
  povolene: PovoleneKody,
  polia: PoleNavrhu[],
  companyId: string,
): Promise<NavrhAi | null | undefined> {
  try {
    const { aiText } = await import("./ai.server");
    const odpoved = await Promise.race([
      aiText(pokynAi(v, povolene, polia), {
        ucel: "ai_predkontacia",
        firma: companyId,
        json: true,
        schema: SCHEMA_ODPOVEDE as unknown as Record<string, unknown>,
        bezUvazovania: true,
        maxOutputTokens: 300,
      }),
      new Promise<never>((_, nie) =>
        setTimeout(() => nie(new Error("AI neodpovedala včas")), STROP_AI_MS),
      ),
    ]);
    return spracujOdpoved(odpoved, povolene, polia);
  } catch (e) {
    console.warn(
      "[ai-predkontacia] návrh sa nepodaril:",
      String((e as Error)?.message ?? e).slice(0, 200),
    );
    return undefined;
  }
}

/** Jadro: zdroje → pamäť → model → pamäť. */
async function navrhni(
  supabase: Klient,
  args: {
    companyId: string;
    typ: TypDokladuNavrhu;
    id: string;
    userId: string | null;
    vstup: VstupNavrhu;
    doklad: Partial<Record<PoleNavrhu, string | null>>;
    pravidlo: Partial<Record<PoleNavrhu, string>>;
    kontext: KontextFirmy;
    vynutit?: boolean;
  },
): Promise<VysledokNavrhu> {
  const { companyId, typ, id, vstup } = args;
  const navyk = await navykDodavatela(
    supabase,
    companyId,
    { ico: vstup.dodavatel.ico, icDph: vstup.dodavatel.icDph, nazov: vstup.dodavatel.nazov },
    vstup.druh,
  ).catch(() => ({}));
  const povolene = await povolenePre(args.kontext, vstup.druh);
  const bezAi = zlucNavrhy({ doklad: args.doklad, pravidlo: args.pravidlo, navyk });
  const lenNavrhy = (z: ZlucenyNavrh): ZlucenyNavrh =>
    Object.fromEntries(
      Object.entries(z).filter(([, h]) => h && h.zdroj !== "doklad"),
    ) as ZlucenyNavrh;

  if (!potrebujeAi(bezAi, povolene)) {
    const polia = lenNavrhy(bezAi);
    if (Object.keys(polia).length) return { stav: "navrh", polia, dovod: null };
    // Nič netreba — alebo firma nemá žiadne kódy, z ktorých by sa dalo vyberať.
    const chyba = !bezAi.predkontacia || !bezAi.clenenie;
    return prazdnyVysledok(chyba && bezCiselnika(povolene) ? "bez_ciselnika" : "netreba");
  }

  const odtl = odtlacok(vstup);
  let ai: NavrhAi | null | undefined;
  let zPamate = false;
  if (!args.vynutit) {
    const { data: ulozeny } = await supabase
      .from("ai_navrhy_zauctovania")
      .select("odtlacok, stav, navrh")
      .eq("company_id", companyId)
      .eq("doklad_typ", typ)
      .eq("doklad_id", id)
      .maybeSingle();
    ai = platnyZPamate(ulozeny, odtl, povolene);
    zPamate = ai !== undefined;
  }
  if (ai === undefined) {
    ai = await zavolajAi(vstup, povolene, poliaPreAi(bezAi, povolene), companyId);
    if (ai === undefined) {
      const polia = lenNavrhy(bezAi);
      return { stav: Object.keys(polia).length ? "navrh" : "nedostupny", polia, dovod: null };
    }
    const { error } = await supabase.from("ai_navrhy_zauctovania").upsert(
      {
        company_id: companyId,
        doklad_typ: typ,
        doklad_id: id,
        odtlacok: odtl,
        stav: ai ? "navrh" : "prazdny",
        navrh: (ai ?? {}) as any,
        created_by: args.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,doklad_typ,doklad_id" },
    );
    if (error) console.warn("[ai-predkontacia] návrh sa nezapamätal:", error.message);
  }
  const zlucene = zlucNavrhy({
    doklad: args.doklad,
    pravidlo: args.pravidlo,
    navyk,
    ai: ai ?? null,
  });
  const polia = lenNavrhy(zlucene);
  const maAi = Object.values(polia).some((h) => h?.zdroj === "ai");
  return {
    stav: Object.keys(polia).length ? "navrh" : "prazdny",
    polia,
    dovod: maAi ? (ai?.dovod ?? null) : null,
    zPamate,
    istota: maAi ? (ai?.istota ?? null) : null,
  };
}

function krajinaNavrhu(k: KontextFirmy): Krajina | null {
  return k.krajina === "SK" || k.krajina === "CZ" ? k.krajina : null;
}

/** Pravidlo účtovania, ktoré na prijatú faktúru sedí ako prvé. */
function pravidloPrijatej(row: Record<string, any>, kontext: KontextFirmy) {
  return prvePravidlo(kontext.pravidla, {
    supplier_ico: row.supplier_ico ?? null,
    supplier_name: row.supplier_name ?? null,
    payment_method: row.payment_method ?? null,
    created_by: row.created_by ?? null,
    predmet_mailu: row.predmet_mailu ?? null,
    odosielatel_mailu: row.odosielatel_mailu ?? null,
    krajina: krajinaDokladu(row.supplier_country, row.supplier_ic_dph),
    krajina_firmy: kontext.krajina,
    variabilny_symbol: row.variable_symbol ?? null,
    druh: "prijata",
    typ: typPrijatej(row.type, row.amount_total, row.opravuje_cislo),
  });
}

const kodyPrijatej = (row: Record<string, any>) => ({
  predkontacia: row.pohoda_predkontacia,
  clenenie: row.pohoda_clenenie_dph,
  kv: row.kv_clenenie,
  kategoria: row.category,
});

/** Návrh pre prijatú faktúru (riadok `purchase_invoices`). */
export async function navrhPrijatej(
  supabase: Klient,
  row: Record<string, any>,
  kontext: KontextFirmy,
  userId: string | null,
  vynutit = false,
): Promise<VysledokNavrhu> {
  const krajina = krajinaNavrhu(kontext);
  if (!krajina) return prazdnyVysledok("nepodporovane");
  if (row.deleted_at || row.exported_at || row.zauctovane_at) return prazdnyVysledok("netreba");
  const { rozpisPrijatej } = await import("./prijate-do-pohody");
  const vstup = vstupZPrijatej(row, krajina, rozpisPrijatej(row));
  return navrhni(supabase, {
    companyId: row.company_id,
    typ: "prijata",
    id: row.id,
    userId,
    vstup,
    doklad: kodyPrijatej(row),
    pravidlo: zPravidla(pravidloPrijatej(row, kontext)),
    kontext,
    vynutit,
  });
}

/**
 * Návrh pre prijatú faktúru bez AI — to isté poradie ako na detaile (faktúra >
 * pravidlo > návyk dodávateľa), len bez volania modelu. Hromadné zaúčtovanie
 * ním dopĺňa členenie DPH, keď ho v okne nik nevybral.
 */
export async function navrhBezAiPrijatej(
  supabase: Klient,
  row: Record<string, any>,
  kontext: KontextFirmy,
): Promise<ZlucenyNavrh> {
  const krajina = krajinaNavrhu(kontext);
  if (!krajina) return {};
  const { rozpisPrijatej } = await import("./prijate-do-pohody");
  const vstup = vstupZPrijatej(row, krajina, rozpisPrijatej(row));
  const navyk = await navykDodavatela(
    supabase,
    row.company_id,
    { ico: vstup.dodavatel.ico, icDph: vstup.dodavatel.icDph, nazov: vstup.dodavatel.nazov },
    vstup.druh,
  ).catch(() => ({}));
  return zlucNavrhy({
    doklad: kodyPrijatej(row),
    pravidlo: zPravidla(pravidloPrijatej(row, kontext)),
    navyk,
  });
}

/** Návrh pre bloček či výdavkový doklad (riadok `expense_documents`). */
export async function navrhBlocku(
  supabase: Klient,
  row: Record<string, any>,
  kontext: KontextFirmy,
  userId: string | null,
  vynutit = false,
): Promise<VysledokNavrhu> {
  const krajina = krajinaNavrhu(kontext);
  if (!krajina) return prazdnyVysledok("nepodporovane");
  if (row.exported_at || row.zauctovane_at) return prazdnyVysledok("netreba");
  const pravidlo = prvePravidlo(kontext.pravidla, {
    supplier_ico: row.supplier_ico ?? null,
    supplier_name: row.supplier_name ?? null,
    payment_method: row.payment_method ?? null,
    created_by: row.created_by ?? null,
    predmet_mailu: row.predmet_mailu ?? null,
    odosielatel_mailu: row.odosielatel_mailu ?? null,
    krajina: krajinaDokladu(null, row.supplier_ic_dph),
    krajina_firmy: kontext.krajina,
    druh: "blocek",
    typ: null,
  });
  return navrhni(supabase, {
    companyId: row.company_id,
    typ: "doklad",
    id: row.id,
    userId,
    vstup: vstupZBlocku(row, krajina),
    doklad: {
      predkontacia: row.pohoda_predkontacia,
      clenenie: row.pohoda_clenenie_dph,
      kv: row.kv_clenenie,
      kategoria: row.category,
    },
    pravidlo: zPravidla(pravidlo),
    kontext,
    vynutit,
  });
}

/** Návrh pre nespracovaný doklad — z uložených údajov formulára. */
export async function navrhNespracovaneho(
  supabase: Klient,
  r: Record<string, any>,
  kontext: KontextFirmy,
  userId: string | null,
  vynutit = false,
): Promise<VysledokNavrhu> {
  const krajina = krajinaNavrhu(kontext);
  if (!krajina) return prazdnyVysledok("nepodporovane");
  const druh = r.druh as string | null;
  if (druh !== "faktura" && druh !== "zalohova" && druh !== "dobropis" && druh !== "blocek")
    return prazdnyVysledok("netreba");
  const { nacitajUdaje, prijataZUdajov, blocekZUdajov } = await import("./nespracovane");
  const u = nacitajUdaje(r.udaje);
  const dnes = dnesBratislava();
  let vstup: VstupNavrhu;
  if (druh === "blocek") vstup = vstupZBlocku(blocekZUdajov(u), krajina);
  else {
    const { rozpisPrijatej } = await import("./prijate-do-pohody");
    const riadok = prijataZUdajov(druh, u, dnes);
    vstup = vstupZPrijatej(riadok, krajina, rozpisPrijatej(riadok));
  }
  let predmetMailu: string | null = null;
  let odosielatelMailu: string | null = null;
  if (r.inbox_message_id) {
    const { data: m } = await supabase
      .from("inbox_messages")
      .select("subject, from_email")
      .eq("id", r.inbox_message_id)
      .maybeSingle();
    predmetMailu = m?.subject ?? null;
    odosielatelMailu = m?.from_email ? String(m.from_email).trim().toLowerCase() : null;
  }
  const blocek = druh === "blocek";
  const porovnanie: DokladNaPorovnanie = {
    supplier_ico: u.dodavatel.ico || null,
    supplier_name: u.dodavatel.nazov || (blocek ? null : "Neurčený dodávateľ"),
    payment_method: u.platba || (blocek ? "karta" : "prevod"),
    created_by: r.created_by ?? null,
    predmet_mailu: predmetMailu,
    odosielatel_mailu: odosielatelMailu,
    krajina: krajinaDokladu(null, u.dodavatel.icDph),
    krajina_firmy: kontext.krajina,
    variabilny_symbol: blocek ? null : u.vs || null,
    druh: blocek ? "blocek" : "prijata",
    typ: blocek
      ? null
      : typPrijatej(
          druh === "zalohova" ? "proforma" : "regular",
          druh === "dobropis" ? -1 : 1,
          u.opravuje,
        ),
  };
  return navrhni(supabase, {
    companyId: r.company_id,
    typ: "nespracovany",
    id: r.id,
    userId,
    vstup,
    doklad: {
      predkontacia: u.kody.predkontacia,
      clenenie: u.kody.clenenie,
      kv: u.kody.kv,
      kategoria: u.kategoria,
    },
    pravidlo: zPravidla(prvePravidlo(kontext.pravidla, porovnanie)),
    kontext,
    vynutit,
  });
}

/**
 * Po vytvorení dokladu z nespracovaného: nepotvrdený návrh AI sa prenesie
 * k novému dokladu (človek ho potvrdí v zaúčtovaní), inak sa pamäť zmaže.
 */
export async function prenesNavrh(
  supabase: Klient,
  args: {
    companyId: string;
    nespracovanyId: string;
    typ: "prijata" | "doklad";
    id: string;
    preniest: boolean;
  },
): Promise<void> {
  try {
    const kde = (q: any) =>
      q
        .eq("company_id", args.companyId)
        .eq("doklad_typ", "nespracovany")
        .eq("doklad_id", args.nespracovanyId);
    if (args.preniest)
      await kde(
        supabase.from("ai_navrhy_zauctovania").update({
          doklad_typ: args.typ,
          doklad_id: args.id,
          updated_at: new Date().toISOString(),
        }),
      );
    else await kde(supabase.from("ai_navrhy_zauctovania").delete());
  } catch {
    /* Pamäť návrhu je doplnok — doklad je vytvorený. */
  }
}

/**
 * Návrhy pre viac prijatých faktúr naraz. Beží súbežne, kým nevyprší
 * rozpočet času; čo sa nestihlo, vráti v `zostava` — prehliadač sa
 * dopýta ďalším volaním.
 */
export async function navrhyHromadne(
  supabase: Klient,
  args: {
    companyId: string;
    ids: string[];
    userId: string | null;
    rozpocetMs?: number;
    naraz?: number;
  },
): Promise<{
  vysledky: ({
    id: string;
    cislo: string | null;
    dodavatel: string | null;
    suma: number | null;
    mena: string | null;
  } & VysledokNavrhu)[];
  zostava: string[];
}> {
  const ids = [...new Set(args.ids)].slice(0, MAX_HROMADNE);
  const zaciatok = Date.now();
  const rozpocet = args.rozpocetMs ?? 10_000;
  const { data: riadky, error } = await supabase
    .from("purchase_invoices")
    .select("*")
    .eq("company_id", args.companyId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  const kontext = await nacitajKontext(supabase, args.companyId);
  const fronta = [...((riadky ?? []) as any[])];
  const vysledky: Awaited<ReturnType<typeof navrhyHromadne>>["vysledky"] = [];
  const hotove = new Set<string>();
  const pracuj = async () => {
    while (fronta.length && Date.now() - zaciatok < rozpocet) {
      const row = fronta.shift()!;
      let v: VysledokNavrhu;
      try {
        v = await navrhPrijatej(supabase, row, kontext, args.userId);
      } catch {
        v = prazdnyVysledok("nedostupny");
      }
      hotove.add(row.id);
      vysledky.push({
        id: row.id,
        cislo: row.invoice_number ?? null,
        dodavatel: row.supplier_name ?? null,
        suma:
          row.amount_total === null || row.amount_total === undefined
            ? null
            : Number(row.amount_total),
        mena: row.currency ?? null,
        ...v,
      });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(args.naraz ?? 4, 6)) }, pracuj));
  const najdene = new Set(((riadky ?? []) as any[]).map((r) => r.id));
  return {
    vysledky,
    zostava: ids.filter((id) => najdene.has(id) && !hotove.has(id)),
  };
}
