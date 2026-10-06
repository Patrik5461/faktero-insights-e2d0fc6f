import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STLPCE_PREDVOLENYCH } from "./predkontacie";

/*
  Číselník predkontácií a členení DPH a predvolené kódy podľa druhu dokladu.
  Všetko cez klienta prihláseného — RLS a role rozhodnú, kto smie meniť.
*/

const STLPCE_FIRMY = [
  "ico",
  ...STLPCE_PREDVOLENYCH,
  "pohoda_predkontacie_oznaceni",
  "pohoda_nacitat_ciselniky",
  "pohoda_ciselniky_nacitane_at",
  "pohoda_blocky_agenda",
  "pohoda_pokladna",
].join(", ");

export const predkontacieFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const [{ data: zaznamy, error }, { data: firma }] = await Promise.all([
      supabase
        .from("predkontacie")
        .select("id, druh, kod, popis, agenda, ucet_md, ucet_d, zdroj, aktivne, druhy_dokladov, kategoria, updated_at")
        .eq("company_id", data.company_id)
        .order("kod"),
      supabase.from("companies").select(STLPCE_FIRMY).eq("id", data.company_id).maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    return { zaznamy: (zaznamy ?? []) as any[], firma: (firma ?? {}) as Record<string, any> };
  });

const kod = z.string().trim().min(1).max(30);
const kratke = (n: number) =>
  z
    .string()
    .trim()
    .max(n)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const ulozPredkontaciuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        id: z.string().uuid().optional().nullable(),
        druh: z.enum(["predkontacia", "clenenie_dph"]),
        kod,
        popis: kratke(200),
        agenda: z.string().trim().max(40).optional().nullable(),
        ucet_md: kratke(20),
        ucet_d: kratke(20),
        aktivne: z.boolean().optional(),
        druhy_dokladov: z.array(z.string().max(20)).max(20).optional(),
        kategoria: kratke(40),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const riadok = {
      druhy_dokladov: data.druhy_dokladov ?? [],
      kategoria: data.kategoria,
      company_id: data.company_id,
      druh: data.druh,
      kod: data.kod,
      popis: data.popis,
      agenda: data.agenda?.trim() ?? "",
      ucet_md: data.ucet_md,
      ucet_d: data.ucet_d,
      aktivne: data.aktivne ?? true,
      updated_at: new Date().toISOString(),
    };
    const q = data.id
      ? supabase.from("predkontacie").update(riadok).eq("id", data.id).eq("company_id", data.company_id)
      : supabase.from("predkontacie").insert({ ...riadok, zdroj: "rucne" });
    const { error } = await q;
    if (error) {
      if (/duplicate|unique/i.test(error.message))
        throw new Error(`Kód ${data.kod} pre túto agendu už v číselníku je.`);
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const zmazPredkontaciuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { error } = await supabase
      .from("predkontacie")
      .delete()
      .eq("company_id", data.company_id)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Predvolené kódy podľa druhu dokladu a predkontácie podľa označenia platby. */
export const ulozPredvoleneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        hodnoty: z.record(z.string(), z.string().max(30).nullable()),
        oznaceni: z.record(z.string(), z.string().max(30)).optional().nullable(),
        blockyAgenda: z.enum(["faktura", "podla_platby"]).optional(),
        pokladna: z.string().max(20).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const zmena: Record<string, unknown> = {};
    // Prázdne pole je NULL, nie "" — prázdny reťazec by v XML vyzeral ako
    // vyplnená skratka a Pohoda by dostala prázdny element.
    for (const s of STLPCE_PREDVOLENYCH) {
      if (s in data.hodnoty) zmena[s] = data.hodnoty[s]?.trim() || null;
    }
    if (data.oznaceni !== undefined) {
      const m = Object.entries(data.oznaceni ?? {})
        .map(([k, v]) => [k, String(v ?? "").trim()] as const)
        .filter(([, v]) => v);
      zmena.pohoda_predkontacie_oznaceni = m.length ? Object.fromEntries(m) : null;
    }
    if (data.blockyAgenda) zmena.pohoda_blocky_agenda = data.blockyAgenda;
    if (data.pokladna !== undefined) zmena.pohoda_pokladna = data.pokladna?.trim() || null;
    const { error } = await supabase.from("companies").update(zmena).eq("id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Zapne (alebo zruší) žiadosť o číselníky pri najbližšom behu konektora. */
export const nacitatZPohodyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), zapnut: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { error } = await supabase
      .from("companies")
      .update({ pohoda_nacitat_ciselniky: data.zapnut })
      .eq("id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Import zo súboru: odpoveď Pohody (XML), CSV alebo Excel.
 *
 * XML z Pohody je úplný zoznam — čo v ňom chýba, sa vypne. Tabuľka je len
 * doplnenie, nič sa podľa nej nevypína.
 */
export const importCiselnikaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        nazov: z.string().max(255),
        base64: z.string().max(8_000_000),
        druh: z.enum(["predkontacia", "clenenie_dph"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const bajty = Uint8Array.from(Buffer.from(data.base64, "base64"));
    const meno = data.nazov.toLowerCase();
    const { rozoberTabulku, rozdelCsv } = await import("./predkontacie");
    const { ulozCiselnik, ulozCiselnikyZPohody } = await import("./predkontacie.server");

    const zaciatok = new TextDecoder("utf-8").decode(bajty.slice(0, 400)).replace(/^﻿/, "").trimStart();
    if (meno.endsWith(".xml") || zaciatok.startsWith("<")) {
      const { dekodujOdpoved } = await import("./pohoda-konektor.server");
      const xml = dekodujOdpoved(bajty.buffer as ArrayBuffer);
      if (/listAccounting(Double|Single)EntryRequest|listClassificationVATRequest/.test(xml) && !/responsePack/.test(xml))
        throw new Error(
          "Toto je žiadosť pre Pohodu, nie jej odpoveď. Načítajte ju v Pohode (Súbor → Dátová komunikácia → XML import) a sem nahrajte súbor, ktorý Pohoda vráti.",
        );
      const r = await ulozCiselnikyZPohody(supabase, { companyId: data.company_id, xml });
      if (!r || r.predkontacii + r.cleneni === 0)
        throw new Error("V súbore nie sú predkontácie ani členenia DPH z Pohody.");
      return { predkontacii: r.predkontacii, cleneni: r.cleneni, vypnutych: r.vypnutych };
    }

    let riadky: unknown[][];
    if (meno.endsWith(".xlsx") || meno.endsWith(".xls") || meno.endsWith(".ods")) {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(bajty, { type: "array", raw: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      riadky = ws ? XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" }) : [];
    } else {
      // CSV z Pohody býva vo Windows-1250; UTF-8 sa prezradí tým, že sa dá prečítať.
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bajty);
      } catch {
        text = new TextDecoder("windows-1250").decode(bajty);
      }
      riadky = rozdelCsv(text);
    }
    const { zaznamy, chyba } = rozoberTabulku(riadky, data.druh ?? "predkontacia");
    if (chyba) throw new Error(chyba);
    await ulozCiselnik(supabase, { companyId: data.company_id, zaznamy, zdroj: "subor" });
    return {
      predkontacii: zaznamy.filter((z) => z.druh === "predkontacia").length,
      cleneni: zaznamy.filter((z) => z.druh === "clenenie_dph").length,
      vypnutych: 0,
    };
  });
