import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MoznostKodu } from "./predkontacie";

/*
  Zaúčtovanie prijatých faktúr — predkontácia, členenie DPH, kategória a
  príznak „zaúčtované“. Zaúčtované (a ešte neodovzdané) si berie Pohoda:
  konektor aj XML v Odovzdaní. Odovzdanú faktúru už meniť nemožno — v Pohode
  by sa rozišla.

  Všetko ide cez klienta prihláseného (RLS, role).
*/

const kod = z.string().trim().max(30).optional().nullable();

export const navrhyKodovFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({ company_id: z.string().uuid(), pre: z.enum(["prijata", "doklad"]).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { ponuka } = await import("./predkontacie");
    /*
      Ponuka je číselník z Pohody (s popisom, vhodná agenda prvá) a za ním
      kódy, ktoré firma už použila, hoci v číselníku nie sú — žiadne vymyslené
      kódy Pohody.
    */
    const [{ data: firma }, { data: ciselnik }, { data: pravidla }, { data: faktury }, { data: doklady }] =
      await Promise.all([
        supabase
          .from("companies")
          .select(
            "pohoda_predkontacia_prijata, pohoda_clenenie_dph_prijata, pohoda_predkontacia_doklady, pohoda_clenenie_dph_doklady",
          )
          .eq("id", data.company_id)
          .maybeSingle(),
        supabase
          .from("predkontacie")
          .select("druh, kod, popis, agenda, ucet_md, ucet_d, aktivne, druhy_dokladov, kategoria")
          .eq("company_id", data.company_id),
        supabase.from("pravidla_uctovania").select("predkontacia, clenenie_dph").eq("company_id", data.company_id),
        supabase
          .from("purchase_invoices")
          .select("pohoda_predkontacia, pohoda_clenenie_dph")
          .eq("company_id", data.company_id)
          .not("pohoda_predkontacia", "is", null)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("expense_documents")
          .select("pohoda_predkontacia, pohoda_clenenie_dph")
          .eq("company_id", data.company_id)
          .not("pohoda_predkontacia", "is", null)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
    const pocet = (hodnoty: (string | null | undefined)[]) => {
      const m = new Map<string, number>();
      for (const h of hodnoty) {
        const t = String(h ?? "").trim();
        if (t) m.set(t, (m.get(t) ?? 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 40);
    };
    const doklad = data.pre === "doklad";
    const predvolenaPredkontacia: string | null =
      (doklad ? firma?.pohoda_predkontacia_doklady : null) || firma?.pohoda_predkontacia_prijata || null;
    const predvoleneClenenie: string | null =
      (doklad ? firma?.pohoda_clenenie_dph_doklady : null) || firma?.pohoda_clenenie_dph_prijata || null;
    const vsetky = [...(pravidla ?? []), ...(faktury ?? []), ...(doklady ?? [])];
    const doplnene = (zoCiselnika: MoznostKodu[], pouzite: string[]): MoznostKodu[] => {
      const zname = new Set(zoCiselnika.map((m) => m.kod));
      return [
        ...zoCiselnika,
        ...pouzite.filter((k) => !zname.has(k)).map((kod) => ({ kod, popis: null, agenda: "", ucty: null })),
      ];
    };
    const agendy = doklad ? ["receivedInvoice", "cashPaid", "internalDocument"] : ["receivedInvoice"];
    return {
      predkontacie: doplnene(
        ponuka(ciselnik ?? [], "predkontacia", agendy, doklad ? "doklady" : "prijata"),
        pocet([predvolenaPredkontacia, ...vsetky.map((r: any) => r.predkontacia ?? r.pohoda_predkontacia)]),
      ),
      clenenia: doplnene(
        ponuka(ciselnik ?? [], "clenenie_dph", [], doklad ? "doklady" : "prijata"),
        pocet([predvoleneClenenie, ...vsetky.map((r: any) => r.clenenie_dph ?? r.pohoda_clenenie_dph)]),
      ),
      predvolenaPredkontacia,
      predvoleneClenenie,
      maCiselnik: (ciselnik ?? []).length > 0,
      // Kategória nákladu → kódy (Predkontácie → „použiť sám pre kategóriu").
      podlaKategorie: Object.fromEntries(
        Object.entries(
          ((ciselnik ?? []) as any[])
            .filter((r) => r.kategoria && r.aktivne !== false)
            .reduce((m: Record<string, { predkontacia?: string; clenenie?: string }>, r: any) => {
              const k = (m[r.kategoria] ??= {});
              if (r.druh === "predkontacia") k.predkontacia ??= r.kod;
              else k.clenenie ??= r.kod;
              return m;
            }, {}),
        ),
      ) as Record<string, { predkontacia?: string; clenenie?: string }>,
    };
  });

/**
 * Zaúčtuje jednu alebo viac prijatých faktúr. Vyplnené kódy prepíšu tie na
 * faktúre; prázdne nechajú, čo tam je (doplnené pravidlom alebo ručne).
 */
export const zauctujPrijateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        ids: z.array(z.string().uuid()).min(1).max(500),
        predkontacia: kod,
        clenenie: kod,
        kategoria: z.string().trim().max(40).optional().nullable(),
        odpocet: z.boolean().optional(),
        kv: z.string().max(5).optional().nullable(),
        lenUlozit: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { zapocitatelna } = await import("./samofakturacia");
    const { data: riadky, error } = await supabase
      .from("purchase_invoices")
      .select("id, invoice_number, status, exported_at, deleted_at, samofakturacia, samofakturacia_stav, type")
      .eq("company_id", data.company_id)
      .in("id", data.ids);
    if (error) throw new Error(error.message);

    const preskocene: string[] = [];
    const ok: string[] = [];
    for (const r of riadky ?? []) {
      if (r.deleted_at) continue;
      if (r.exported_at) {
        preskocene.push(`${r.invoice_number}: už je odovzdaná do Pohody`);
        continue;
      }
      if (!data.lenUlozit && (r.status === "draft" || r.status === "cancelled")) {
        preskocene.push(`${r.invoice_number}: ${r.status === "draft" ? "koncept" : "stornovaná"}`);
        continue;
      }
      if (!data.lenUlozit && !zapocitatelna(r)) {
        preskocene.push(`${r.invoice_number}: samofaktúra ešte nie je odsúhlasená`);
        continue;
      }
      ok.push(r.id);
    }

    if (ok.length) {
      const zmena: Record<string, unknown> = {};
      if (data.predkontacia !== undefined) zmena.pohoda_predkontacia = data.predkontacia?.trim() || null;
      if (data.clenenie !== undefined) zmena.pohoda_clenenie_dph = data.clenenie?.trim() || null;
      if (data.kategoria !== undefined) zmena.category = data.kategoria?.trim() || null;
      if (data.odpocet !== undefined) zmena.odpocet = data.odpocet;
      if (data.kv !== undefined) zmena.kv_clenenie = data.kv?.trim() || null;
      // Hromadne sa prázdne pole neprepisuje — nesmie zmazať kód doplnený pravidlom.
      if (data.ids.length > 1) {
        for (const k of Object.keys(zmena)) if (zmena[k] === null) delete zmena[k];
      }
      if (!data.lenUlozit) {
        zmena.zauctovane_at = new Date().toISOString();
        zmena.zauctoval = context.userId;
      }
      if (Object.keys(zmena).length) {
        const { error: e2 } = await supabase.from("purchase_invoices").update(zmena).in("id", ok);
        if (e2) throw new Error(e2.message);
      }
      if (!data.lenUlozit) {
        // „Prijatá“ sa zaúčtovaním stáva „zaúčtovanou“; zaplatená ostáva zaplatená.
        await supabase.from("purchase_invoices").update({ status: "booked" }).in("id", ok).eq("status", "received");
      }
    }
    return { zauctovanych: data.lenUlozit ? 0 : ok.length, ulozenych: ok.length, preskocene };
  });

export const zrusZauctovanieFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: r } = await supabase
      .from("purchase_invoices")
      .select("id, status, exported_at")
      .eq("id", data.id)
      .maybeSingle();
    if (!r) throw new Error("Faktúra sa nenašla.");
    if (r.exported_at) {
      throw new Error("Faktúra je už v Pohode — zaúčtovanie zrušte tam a opravu urobte opravným dokladom.");
    }
    const { error } = await supabase
      .from("purchase_invoices")
      .update({ zauctovane_at: null, zauctoval: null, ...(r.status === "booked" ? { status: "received" } : {}) })
      .eq("id", r.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Predkontácia, členenie DPH a kategória na bločkoch a výdavkových dokladoch.
 *
 * Doklad nemá samostatný krok „zaúčtovať" — do Pohody ide, keď je spracovaný.
 * Tu sa mu len určí, ako sa zaúčtuje; prázdne pole nechá, čo na ňom je.
 * Odovzdaný doklad sa nemení, v Pohode by sa rozišiel.
 */
export const zauctujDokladyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        ids: z.array(z.string().uuid()).min(1).max(500),
        predkontacia: kod,
        clenenie: kod,
        kategoria: z.string().trim().max(40).optional().nullable(),
        kv: z.string().trim().max(5).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const zmena: Record<string, unknown> = {};
    if (data.kv?.trim()) zmena.kv_clenenie = data.kv.trim() === "auto" ? null : data.kv.trim();
    if (data.predkontacia?.trim()) zmena.pohoda_predkontacia = data.predkontacia.trim();
    if (data.clenenie?.trim()) zmena.pohoda_clenenie_dph = data.clenenie.trim();
    if (data.kategoria?.trim()) zmena.category = data.kategoria.trim();
    if (!Object.keys(zmena).length) return { zmenenych: 0, preskocenych: 0 };

    const { data: riadky, error } = await supabase
      .from("expense_documents")
      .select("id, exported_at")
      .eq("company_id", data.company_id)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    const ok = (riadky ?? []).filter((r: any) => !r.exported_at).map((r: any) => r.id);
    if (ok.length) {
      const { error: e2 } = await supabase
        .from("expense_documents")
        .update(zmena)
        .eq("company_id", data.company_id)
        .in("id", ok);
      if (e2) throw new Error(e2.message);
    }
    return { zmenenych: ok.length, preskocenych: (riadky ?? []).length - ok.length };
  });

const riadokRozuctovania = z.object({
  predkontacia: z.string().max(30).nullable().optional(),
  clenenie: z.string().max(30).nullable().optional(),
  sadzba: z.number(),
  zaklad: z.number(),
  dph: z.number(),
  text: z.string().max(200).nullable().optional(),
  kv: z.string().max(5).nullable().optional(),
});

/**
 * Rozúčtovanie prijatej faktúry alebo bločku na viac riadkov.
 *
 * Súčty po sadzbách musia sedieť s dokladom na cent — kontrola beží tu, nie
 * len v prehliadači. Prázdny zoznam rozúčtovanie zruší. Odovzdaný doklad sa
 * nemení, v Pohode by sa rozišiel.
 */
export const ulozRozuctovanieFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        druh: z.enum(["prijata", "doklad"]),
        id: z.string().uuid(),
        riadky: z.array(riadokRozuctovania).max(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { chybaRozuctovania, ocisti, rozpisBlocku } = await import("./rozuctovanie");
    const tabulka = data.druh === "prijata" ? "purchase_invoices" : "expense_documents";
    const { data: d, error } = await supabase
      .from(tabulka)
      .select("*")
      .eq("company_id", data.company_id)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!d) throw new Error("Doklad sa nenašiel");
    if (d.exported_at) throw new Error("Doklad je už odovzdaný do Pohody — rozúčtovanie meňte tam.");

    let rozpis;
    if (data.druh === "prijata") {
      const { rozpisPrijatej } = await import("./prijate-do-pohody");
      rozpis = rozpisPrijatej(d);
    } else rozpis = rozpisBlocku(d);

    const riadky = ocisti(data.riadky as any);
    const chyba = chybaRozuctovania(riadky, rozpis);
    if (chyba) throw new Error(chyba);
    const { error: e2 } = await supabase
      .from(tabulka)
      .update({ rozuctovanie: riadky.length ? riadky : null })
      .eq("id", data.id)
      .eq("company_id", data.company_id);
    if (e2) throw new Error(e2.message);
    return { ok: true, riadkov: riadky.length };
  });
