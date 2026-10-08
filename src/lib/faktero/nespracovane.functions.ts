import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Nespracované doklady (ako v Doklado) — zoznam, nahratie, detail, uloženie
  rozpracovaného, vytvorenie dokladu a zmazanie do koša.
*/

const DRUH = z.enum(["faktura", "zalohova", "dobropis", "blocek", "ostatny"]);

export const nespracovaneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const [{ data: rows }, { data: blocky }] = await Promise.all([
      supabase
        .from("nespracovane_doklady")
        .select("id, zdroj, stav, druh, file_name, udaje, chyba, created_at")
        .eq("company_id", data.company_id)
        .order("created_at", { ascending: false })
        .limit(300),
      // Bločky z appky a formulára čakajú na kontrolu v Dokladoch — patria sem tiež.
      supabase
        .from("expense_documents")
        .select("id, supplier_name, document_number, total_amount, currency, issue_date, created_at, source")
        .eq("company_id", data.company_id)
        .eq("status", "new")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);
    return {
      doklady: (rows ?? []).map((r: any) => ({
        id: r.id as string,
        typ: "nespracovany" as const,
        zdroj: r.zdroj as string,
        stav: r.stav as string,
        druh: (r.druh ?? null) as string | null,
        dodavatel: (r.udaje?.dodavatel?.nazov as string) || null,
        cislo: (r.udaje?.cislo as string) || null,
        datum: (r.udaje?.datumVystavenia as string) || null,
        suma:
          r.udaje?.celkom != null
            ? Number(r.udaje.celkom)
            : Array.isArray(r.udaje?.rozpis)
              ? r.udaje.rozpis.reduce((a: number, x: any) => a + Number(x.zaklad || 0) + Number(x.dph || 0), 0)
              : null,
        mena: (r.udaje?.mena as string) || "EUR",
        subor: r.file_name as string | null,
        chyba: r.chyba as string | null,
        vytvorene: r.created_at as string,
      })),
      blocky: (blocky ?? []).map((b: any) => ({
        id: b.id as string,
        typ: "blocek" as const,
        zdroj: b.source as string,
        dodavatel: b.supplier_name as string | null,
        cislo: b.document_number as string | null,
        datum: b.issue_date as string | null,
        suma: b.total_amount == null ? null : Number(b.total_amount),
        mena: (b.currency as string) || "EUR",
        vytvorene: b.created_at as string,
      })),
    };
  });

export const nahrajNespracovaneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        nazov: z.string().min(1).max(255),
        mime: z.string().min(3).max(120),
        subor: z.string().min(16).max(21_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const bajty = Buffer.from(data.subor, "base64");
    if (!bajty.length) throw new Error("Súbor je prázdny.");
    if (bajty.length > 15 * 1024 * 1024) throw new Error("Súbor je väčší než 15 MB.");
    const { assertCompanyActive } = await import("./active-check.server");
    await assertCompanyActive(data.company_id);
    const { zalozNespracovany, vytazNespracovany } = await import("./nespracovane.server");
    const { id } = await zalozNespracovany(context.supabase as any, {
      companyId: data.company_id,
      userId: context.userId,
      zdroj: "nahratie",
      bajty,
      nazov: data.nazov,
      mime: data.mime,
    });
    // Vyťaženie trvá aj desiatky sekúnd — beží na pozadí, zoznam sa doptáva.
    void vytazNespracovany(id);
    return { id };
  });

export const detailNespracovanehoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: r } = await supabase.from("nespracovane_doklady").select("*").eq("id", data.id).maybeSingle();
    if (!r) throw new Error("Doklad sa nenašiel — možno ho už niekto spracoval.");
    const { nacitajUdaje, udajeZAi } = await import("./nespracovane");
    const dnes = new Date().toISOString().slice(0, 10);
    const ulozene = nacitajUdaje(r.udaje);
    const udaje = ulozene.dodavatel.nazov || ulozene.cislo || !r.ai ? ulozene : udajeZAi(r.ai, dnes);
    let url: string | null = null;
    if (r.file_path) {
      const { data: s } = await supabase.storage.from("nespracovane").createSignedUrl(r.file_path, 3600);
      url = s?.signedUrl ?? null;
    }
    // Ďalší v poradí — po vytvorení sa dá rovno pokračovať.
    const { data: dalsi } = await supabase
      .from("nespracovane_doklady")
      .select("id")
      .eq("company_id", r.company_id)
      .neq("id", r.id)
      .lt("created_at", r.created_at)
      .order("created_at", { ascending: false })
      .limit(1);
    const { varovaniaNespracovaneho } = await import("./nespracovane.server");
    const { data: firma } = await supabase
      .from("companies")
      .select("ico, ic_dph, dic, povinne_polia_dokladu")
      .eq("id", r.company_id)
      .maybeSingle();
    return {
      povinne: (firma?.povinne_polia_dokladu ?? []) as string[],
      varovania: await varovaniaNespracovaneho(supabase, r, udaje, firma),
      id: r.id as string,
      companyId: r.company_id as string,
      zdroj: r.zdroj as string,
      stav: r.stav as string,
      chyba: r.chyba as string | null,
      druh: (r.druh ?? null) as string | null,
      subor: { url, nazov: r.file_name as string | null, mime: r.file_mime as string | null },
      udaje,
      dalsiId: (dalsi?.[0]?.id as string | undefined) ?? null,
    };
  });

const UdajeVstup = z.record(z.string(), z.unknown());

export const ulozNespracovaneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), druh: DRUH.nullable(), udaje: UdajeVstup }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { nacitajUdaje } = await import("./nespracovane");
    const { data: r, error } = await supabase
      .from("nespracovane_doklady")
      .update({ druh: data.druh, udaje: nacitajUdaje(data.udaje), updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!r?.length) throw new Error("Doklad sa nenašiel.");
    return { ok: true };
  });

/**
 * Prečíta doklad znova a doplní, čo v údajoch chýba (VS, IBAN, splatnosť,
 * adresa…). Vyplnené sa neprepisuje. Beží na pozadí, detail sa doptáva.
 */
export const docitajNespracovanyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: r, error } = await supabase
      .from("nespracovane_doklady")
      .update({ stav: "cita", chyba: null })
      .eq("id", data.id)
      .not("file_path", "is", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (!r?.length) throw new Error("Doklad nemá súbor, z ktorého by sa dalo čítať.");
    const { vytazNespracovany } = await import("./nespracovane.server");
    void vytazNespracovany(data.id);
    return { ok: true };
  });

export const vytvorZNespracovanehoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        druh: DRUH,
        udaje: UdajeVstup,
        /** Človek videl upozornenie na duplicitu a chce doklad aj tak. */
        ajDuplicitu: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { nacitajUdaje, chybajuce, NAZVY_POLI } = await import("./nespracovane");
    const u = nacitajUdaje(data.udaje);
    const { data: r } = await supabase.from("nespracovane_doklady").select("*").eq("id", data.id).maybeSingle();
    if (!r) throw new Error("Doklad sa nenašiel — možno ho už niekto spracoval.");
    const { data: firma } = await supabase
      .from("companies")
      .select("povinne_polia_dokladu")
      .eq("id", r.company_id)
      .maybeSingle();
    const chyba = chybajuce(data.druh, u, firma?.povinne_polia_dokladu ?? []);
    if (chyba.length) throw new Error(`Doplňte: ${chyba.map((k) => NAZVY_POLI[k] ?? k).join(", ")}.`);
    const { assertCompanyActive } = await import("./active-check.server");
    await assertCompanyActive(r.company_id);
    /*
      Tá istá prijatá faktúra už v evidencii je (prišla mailom znova, zadal ju
      niekto ručne) — druhýkrát by bola náklad aj odpočet DPH a príkaz na
      úhradu by ju zaplatil dvakrát. Bez výslovného súhlasu sa nevytvorí.
    */
    if (!data.ajDuplicitu && (data.druh === "faktura" || data.druh === "zalohova" || data.druh === "dobropis")) {
      const { najdiDuplicituPrijatej } = await import("./prijate-duplicity.server");
      const { textDuplicity, PREDPONA_DUPLICITY } = await import("./prijate-duplicity");
      const dup = await najdiDuplicituPrijatej(
        supabase,
        r.company_id,
        {
          invoice_number: u.cislo,
          supplier_ico: u.dodavatel.ico,
          supplier_name: u.dodavatel.nazov,
          supplier_iban: u.dodavatel.iban,
          amount_total: u.celkom,
        },
        { nespracovanyId: r.id },
      );
      if (dup?.kde === "prijate")
        throw new Error(`${PREDPONA_DUPLICITY}${textDuplicity(dup)}\nVytvoriť ju aj tak druhýkrát?`);
    }
    const { vytvorDoklad } = await import("./nespracovane.server");
    return vytvorDoklad(supabase, context.userId, r, data.druh, u);
  });

/** Do koša — dá sa obnoviť, kým sa kôš nevysype (súbor ostáva v úložisku). */
export const zmazNespracovaneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: r } = await supabase.from("nespracovane_doklady").select("*").eq("id", data.id).maybeSingle();
    if (!r) throw new Error("Doklad sa nenašiel.");
    const { error: e1 } = await supabase.from("kos_dokladov").insert({
      company_id: r.company_id,
      druh: "nespracovany",
      zaznam_id: r.id,
      zaznam: r,
      vazby: {},
      popis:
        [r.udaje?.dodavatel?.nazov, r.udaje?.cislo].filter(Boolean).join(" · ") || r.file_name || "Nespracovaný doklad",
      zmazal: context.userId,
    });
    if (e1) throw new Error(e1.message);
    const { error } = await supabase.from("nespracovane_doklady").delete().eq("id", r.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Nespracovaný bloček (zo skenera, appky či formulára) do Nespracovaných
 * dokladov, aby sa dal zaradiť rovnako ako všetko ostatné — naskenovaná
 * faktúra totiž vznikla ako bloček a človek jej druh musí vedieť zmeniť.
 * PDF sa navrhne ako faktúra, fotka ako bloček.
 */
export const blocekDoNespracovanychFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { presunBlocekDoNespracovanych } = await import("./nespracovane.server");
    return presunBlocekDoNespracovanych(context.supabase as any, data.id, context.userId);
  });

/**
 * Prijatá faktúra späť do Nespracovaných — keď sa zle zaradila (iný druh,
 * patrí medzi bločky) a treba ju spracovať znova. Odovzdaná, zamknutá ani
 * spárovaná s platbou sa vrátiť nedá: párovanie aj zápis v účtovníctve by
 * sa stratili.
 */
export const prijataDoNespracovanychFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: p } = await supabase.from("purchase_invoices").select("*").eq("id", data.id).maybeSingle();
    if (!p || p.deleted_at) throw new Error("Faktúra sa nenašla.");
    if (p.exported_at) throw new Error("Faktúra je odovzdaná do účtovníctva — najprv ju vráťte z Pohody.");
    if (p.locked_at) throw new Error("Faktúra je zamknutá — najprv ju odomknite.");
    const { data: parovany } = await supabase
      .from("bank_transactions")
      .select("id")
      .eq("matched_purchase_invoice_id", p.id)
      .limit(1);
    if (parovany?.length) throw new Error("Faktúra je spárovaná s platbou — najprv zrušte párovanie.");

    const { udajeZPrijatej } = await import("./nespracovane");
    const { druh, udaje } = udajeZPrijatej(p);
    const id = crypto.randomUUID();
    let cesta: string | null = null;
    if (p.file_path) {
      const { data: subor } = await supabase.storage.from("purchase-invoices").download(p.file_path);
      if (subor) {
        const pripona = String(p.file_path).split(".").pop()?.toLowerCase().slice(0, 5) || "pdf";
        cesta = `${p.company_id}/${id}.${pripona}`;
        const up = await supabase.storage
          .from("nespracovane")
          .upload(cesta, new Uint8Array(await subor.arrayBuffer()), { contentType: p.file_mime ?? subor.type });
        if (up.error) throw new Error(`Súbor sa nepodarilo presunúť: ${up.error.message}`);
      }
    }
    const { error } = await supabase.from("nespracovane_doklady").insert({
      id,
      company_id: p.company_id,
      created_by: p.created_by ?? context.userId,
      zdroj: "nahratie",
      stav: "vytazene",
      druh,
      file_path: cesta,
      file_name: p.file_path ? String(p.file_path).split("/").pop() : null,
      file_mime: p.file_mime,
      file_size: p.file_size,
      ai: null,
      udaje,
    });
    if (error) {
      if (cesta) await supabase.storage.from("nespracovane").remove([cesta]);
      throw new Error(error.message);
    }
    // Faktúra zmizne; keď na ňu niečo ešte odkazuje, ostane aspoň zmazaná.
    const { error: eDel } = await supabase.from("purchase_invoices").delete().eq("id", p.id);
    if (eDel) await supabase.from("purchase_invoices").update({ deleted_at: new Date().toISOString() }).eq("id", p.id);
    else if (p.file_path) await supabase.storage.from("purchase-invoices").remove([p.file_path]);
    return { id };
  });
