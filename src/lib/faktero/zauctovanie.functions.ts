import { createServerFn } from "@tanstack/react-start";
import { DOVOD_CUDZIA_ZAUCTOVANIE } from "./cudzia-faktura";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MoznostKodu } from "./predkontacie";
import { POLIA_ZAUCTOVANIA_DOKLADU, zmenaZauctovaniaDokladu } from "./zauctovanie-dokladu";
import { DOVOD_BEZ_CLENENIA } from "./clenenie-zauctovania";
import { nazovProgramuExportu } from "./odovzdanie-exportu";

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
      .object({
        company_id: z.string().uuid(),
        pre: z.enum(["prijata", "doklad", "vystavena"]).optional(),
        /** Typ vystavenej faktúry — zálohová a dobropis majú vlastné predvolené kódy. */
        typ: z.string().max(30).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { ponuka, ponukaClenenia } = await import("./predkontacie");
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
            "pohoda_predkontacia_prijata, pohoda_clenenie_dph_prijata, pohoda_predkontacia_doklady, pohoda_clenenie_dph_doklady, pohoda_predkontacia, pohoda_predkontacia_zaloha, pohoda_predkontacia_dobropis, pohoda_clenenie_dph, pohoda_clenenie_dph_pdp, pohoda_stredisko, pohoda_rad_prijate, pohoda_rad_doklady, kv_clenenie_faktura, kv_clenenie_prijata, kv_clenenie_doklady",
          )
          .eq("id", data.company_id)
          .maybeSingle(),
        supabase
          .from("predkontacie")
          .select(
            "druh, kod, popis, agenda, ucet_md, ucet_d, aktivne, druhy_dokladov, kategoria, pomer, typ_dokladu, typ_platby",
          )
          .eq("company_id", data.company_id),
        supabase.from("pravidla_uctovania").select("predkontacia, clenenie_dph").eq("company_id", data.company_id),
        supabase
          .from("purchase_invoices")
          .select("pohoda_predkontacia, pohoda_clenenie_dph")
          .eq("company_id", data.company_id)
          .is("deleted_at", null)
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
    const vystavena = data.pre === "vystavena";
    const predvolenaPredkontacia: string | null = vystavena
      ? (data.typ === "proforma"
          ? firma?.pohoda_predkontacia_zaloha
          : data.typ === "credit_note"
            ? firma?.pohoda_predkontacia_dobropis
            : firma?.pohoda_predkontacia) || null
      : (doklad ? firma?.pohoda_predkontacia_doklady : null) || firma?.pohoda_predkontacia_prijata || null;
    const predvoleneClenenie: string | null = vystavena
      ? firma?.pohoda_clenenie_dph || null
      : (doklad ? firma?.pohoda_clenenie_dph_doklady : null) || firma?.pohoda_clenenie_dph_prijata || null;
    const vsetky = [...(pravidla ?? []), ...(faktury ?? []), ...(doklady ?? [])];
    const doplnene = (zoCiselnika: MoznostKodu[], pouzite: string[]): MoznostKodu[] => {
      const zname = new Set(zoCiselnika.map((m) => m.kod));
      return [
        ...zoCiselnika,
        ...pouzite.filter((k) => !zname.has(k)).map((kod) => ({ kod, popis: null, agenda: "", ucty: null })),
      ];
    };
    const agendy = vystavena
      ? data.typ === "proforma"
        ? ["issuedAdvanceInvoice", "issuedInvoice"]
        : ["issuedInvoice"]
      : doklad
        ? ["receivedInvoice", "cashPaid", "internalDocument"]
        : ["receivedInvoice"];
    const kluc = vystavena
      ? data.typ === "proforma"
        ? "zaloha"
        : data.typ === "credit_note"
          ? "dobropis"
          : "faktura"
      : doklad
        ? "doklady"
        : "prijata";
    return {
      // Predkontácie s účtovaním pomerom — pri položke sa ukáže, že sa rozúčtuje.
      pomerove: ((ciselnik ?? []) as any[])
        .filter((r) => r.druh === "predkontacia" && r.pomer && r.aktivne !== false)
        .map((r) => String(r.kod)),
      predkontacie: doplnene(
        ponuka(ciselnik ?? [], "predkontacia", agendy, kluc),
        pocet([predvolenaPredkontacia, ...vsetky.map((r: any) => r.predkontacia ?? r.pohoda_predkontacia)]),
      ),
      clenenia: doplnene(
        ponukaClenenia(ponuka(ciselnik ?? [], "clenenie_dph", [], kluc), kluc),
        pocet([predvoleneClenenie, ...vsetky.map((r: any) => r.clenenie_dph ?? r.pohoda_clenenie_dph)]),
      ),
      predvolenaPredkontacia,
      predvoleneClenenie,
      /** Predvolené členenie KV DPH bežného dokladu tohto druhu (prázdne = automaticky). */
      predvoleneKv: ((vystavena
        ? firma?.kv_clenenie_faktura
        : doklad
          ? firma?.kv_clenenie_doklady
          : firma?.kv_clenenie_prijata) ?? null) as string | null,
      maCiselnik: (ciselnik ?? []).length > 0,
      strediska: ponuka(ciselnik ?? [], "stredisko"),
      cinnosti: ponuka(ciselnik ?? [], "cinnost"),
      pokladne: ponuka(ciselnik ?? [], "pokladna"),
      // Číselné rady: vhodná agenda Pohody prvá (prijaté či vydané faktúry, pokladňa…).
      rady: ponuka(ciselnik ?? [], "ciselny_rad").sort(
        (a, b) =>
          Number(b.agenda.startsWith(vystavena ? "vydane" : "prijate")) -
          Number(a.agenda.startsWith(vystavena ? "vydane" : "prijate")),
      ),
      predvoleneStredisko: (firma?.pohoda_stredisko ?? null) as string | null,
      predvolenyRad: ((doklad ? firma?.pohoda_rad_doklady : null) || firma?.pohoda_rad_prijate || null) as
        | string
        | null,
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
/**
 * Človek zmenil predkontáciu, ktorú navrhol alebo zaúčtoval automat —
 * zapíše sa to do histórie a pri druhej rovnakej oprave u partnera sa
 * vráti ponuka pravidla (`zaznamenajOpravu`).
 */
async function opravaAutomatu(
  typ: "prijata" | "blocek" | "vystavena",
  r: any,
  po: { predkontacia: string | null | undefined; clenenie?: string | null; kv?: string | null },
  companyId: string,
  userId: string,
) {
  if (po.predkontacia === undefined) return null;
  const auto = ["pravidlo", "zvyk", "ai"].includes(String(r.zauctovanie_zdroj ?? ""));
  const navrh = r.auto_uctovanie_navrh as { predkontacia?: string | null; zdroj?: string | null; istota?: number } | null;
  const pred = auto
    ? { predkontacia: r.pohoda_predkontacia ?? null, zdroj: r.zauctovanie_zdroj, istota: r.zauctovanie_istota ?? null }
    : navrh?.predkontacia && navrh.zdroj
      ? { predkontacia: navrh.predkontacia, zdroj: navrh.zdroj, istota: navrh.istota ?? null }
      : null;
  if (!pred) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { zaznamenajOpravu } = await import("./auto-uctovanie.server");
    const ico = typ === "vystavena" ? r.customer_ico : r.supplier_ico;
    const nazov = typ === "vystavena" ? r.customer_name : r.supplier_name;
    return await zaznamenajOpravu(supabaseAdmin, {
      companyId,
      typ,
      dokladId: r.id,
      userId,
      partner: { ico: ico ?? null, nazov: nazov ?? null },
      pred,
      po: { predkontacia: po.predkontacia ?? null, clenenie: po.clenenie ?? null, kv: po.kv ?? null },
    });
  } catch (e) {
    console.warn("[zauctovanie] oprava automatu sa nezapísala:", String((e as Error)?.message ?? e).slice(0, 160));
    return null;
  }
}

/**
 * Členenie DPH pre zaúčtovanie prijatých faktúr: čo doplniť z návrhu a ktoré
 * faktúry platiteľ DPH bez členenia nezaúčtuje. Rozhoduje `clenenieFaktur`.
 */
async function clenenieNaZauctovanie(
  supabase: any,
  data: {
    company_id: string;
    ids: string[];
    clenenie?: string | null;
    kategoria?: string | null;
    predkontacia?: string | null;
  },
  riadky: any[],
): Promise<{ doplnit: Record<string, string>; bez: string[]; predkontacie: Record<string, string> }> {
  const { clenenieFaktur, potrebujeNavrh, potrebujePredkontaciu } = await import("./clenenie-zauctovania");
  const { rezimFirmy } = await import("./dph-rezim");
  // Detail posiela členenie vždy — prázdne tam znamená „zmazať z faktúry“.
  const o = {
    zvolene: data.clenenie?.trim() || null,
    vymazat: data.ids.length === 1 && data.clenenie !== undefined && !data.clenenie?.trim(),
  };
  const [{ data: firma }, { data: kategorie }] = await Promise.all([
    supabase
      .from("companies")
      .select("country, ic_dph, vat_payer, vat_scheme, pohoda_clenenie_dph_prijata")
      .eq("id", data.company_id)
      .maybeSingle(),
    supabase
      .from("predkontacie")
      .select("kod, kategoria, aktivne")
      .eq("company_id", data.company_id)
      .eq("druh", "clenenie_dph")
      .not("kategoria", "is", null),
  ]);
  const podlaKategorie: Record<string, { clenenie: string }> = {};
  for (const r of (kategorie ?? []) as any[])
    if (r.aktivne !== false) podlaKategorie[r.kategoria] ??= { clenenie: r.kod };

  const navrhy: Record<string, string> = {};
  /*
    Predkontácia z toho istého návrhu (pravidlo, návyk dodávateľa) — len keď
    ju okno nevyplnilo (hromadné zaúčtovanie pošle `undefined`) a faktúra ju
    nemá. Inak sa členenie doplnilo zo zvyku, ale faktúra ostala zaúčtovaná
    bez predkontácie a kontrola pred odovzdaním ju zastavila.
  */
  const navrhyPk: Record<string, string> = {};
  const trebaPk = (r: any) =>
    potrebujePredkontaciu({ predkontacia: r.pohoda_predkontacia }, { zOkna: data.predkontacia !== undefined });
  const treba = riadky.filter(
    (r) => potrebujeNavrh({ clenenie: r.pohoda_clenenie_dph }, o) || trebaPk(r),
  );
  if (treba.length) {
    // Návrh potrebuje celý riadok (položky, rozpis DPH) — načíta sa len pre tieto.
    const { nacitajKontext, navrhBezAiPrijatej } = await import("./ai-predkontacia.server");
    const kontext = await nacitajKontext(supabase, data.company_id);
    const { data: cele } = await supabase
      .from("purchase_invoices")
      .select("*")
      .in(
        "id",
        treba.map((r) => r.id),
      );
    const zoznam = (cele ?? []) as any[];
    for (let i = 0; i < zoznam.length; i += 10) {
      await Promise.all(
        zoznam.slice(i, i + 10).map(async (r) => {
          const n = await navrhBezAiPrijatej(supabase, r, kontext).catch(() => ({}) as any);
          const k = n?.clenenie?.zdroj !== "doklad" ? n?.clenenie?.hodnota : null;
          if (k && potrebujeNavrh({ clenenie: r.pohoda_clenenie_dph }, o)) navrhy[r.id] = k;
          const pk = n?.predkontacia?.zdroj !== "doklad" ? n?.predkontacia?.hodnota : null;
          if (pk && trebaPk(r)) navrhyPk[r.id] = String(pk);
        }),
      );
    }
  }
  const c = clenenieFaktur(
    riadky.map((r) => ({
      id: r.id,
      clenenie: r.pohoda_clenenie_dph,
      kategoria: data.kategoria?.trim() || r.category,
      rozuctovanie: r.rozuctovanie,
      navrh: navrhy[r.id] ?? null,
    })),
    {
      ...o,
      podlaKategorie,
      predvolene: firma?.pohoda_clenenie_dph_prijata ?? null,
      platitel: rezimFirmy(firma).platitel,
    },
  );
  return { ...c, predkontacie: navrhyPk };
}

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
        stredisko: kod,
        cinnost: kod,
        rad: kod,
        intPoznamka: z.string().max(240).optional().nullable(),
        lenUlozit: z.boolean().optional(),
        /** Len kontrola členenia DPH pred zaúčtovaním — nič sa nezapíše. */
        kontrolaClenenia: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { zapocitatelna } = await import("./samofakturacia");
    const { data: riadky, error } = await supabase
      .from("purchase_invoices")
      .select(
        "id, invoice_number, status, exported_at, deleted_at, samofakturacia, samofakturacia_stav, type, supplier_ico, supplier_ic_dph, supplier_name, amount_total, opravuje_cislo, pohoda_predkontacia, pohoda_clenenie_dph, category, rozuctovanie, zauctovanie_zdroj, zauctovanie_istota, auto_uctovanie_navrh, odberatel_nesedi",
      )
      .eq("company_id", data.company_id)
      .in("id", data.ids);
    if (error) throw new Error(error.message);

    const preskocene: string[] = [];
    const ok: string[] = [];
    let ponukaPravidla: Awaited<ReturnType<typeof opravaAutomatu>> = null;
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
      // Odberateľ na doklade je iná firma — zaúčtovať až po potvrdení „patrí tejto firme“.
      if (!data.lenUlozit && r.odberatel_nesedi) {
        preskocene.push(`${r.invoice_number}: ${DOVOD_CUDZIA_ZAUCTOVANIE}`);
        continue;
      }
      ok.push(r.id);
    }

    /*
      Členenie DPH: kde ho okno nevybralo a faktúra ho nemá, doplní sa z
      návrhu pre faktúru (pravidlo, návyk dodávateľa — ako na detaile, bez AI).
      Platiteľ DPH faktúru bez členenia nezaúčtuje (clenenie-zauctovania.ts).
    */
    let doplnitClenenie: Record<string, string> = {};
    let doplnitPredkontaciu: Record<string, string> = {};
    const bezClenenia: string[] = [];
    if (!data.lenUlozit && ok.length) {
      const c = await clenenieNaZauctovanie(supabase, data, (riadky ?? []).filter((x: any) => ok.includes(x.id)));
      doplnitClenenie = c.doplnit;
      doplnitPredkontaciu = c.predkontacie;
      for (const id of c.bez) {
        const r = (riadky ?? []).find((x: any) => x.id === id);
        bezClenenia.push(String(r?.invoice_number ?? id));
        if (!data.kontrolaClenenia) preskocene.push(`${r?.invoice_number ?? id}: ${DOVOD_BEZ_CLENENIA}`);
      }
      ok.splice(0, ok.length, ...ok.filter((id) => !c.bez.includes(id)));
    }
    if (data.kontrolaClenenia)
      return {
        zauctovanych: 0,
        ulozenych: 0,
        preskocene,
        ponukaPravidla: null,
        bezClenenia,
        doplneneClenenie: Object.keys(doplnitClenenie).length,
        doplnenaPredkontacia: ok.filter((id) => doplnitPredkontaciu[id]).length,
      };

    if (ok.length) {
      const zmena: Record<string, unknown> = {};
      if (data.predkontacia !== undefined) zmena.pohoda_predkontacia = data.predkontacia?.trim() || null;
      if (data.clenenie !== undefined) zmena.pohoda_clenenie_dph = data.clenenie?.trim() || null;
      if (data.kategoria !== undefined) zmena.category = data.kategoria?.trim() || null;
      if (data.odpocet !== undefined) zmena.odpocet = data.odpocet;
      if (data.kv !== undefined) zmena.kv_clenenie = data.kv?.trim() || null;
      if (data.stredisko !== undefined) zmena.stredisko = data.stredisko?.trim() || null;
      if (data.cinnost !== undefined) zmena.cinnost = data.cinnost?.trim() || null;
      if (data.rad !== undefined) zmena.pohoda_rad = data.rad?.trim() || null;
      if (data.intPoznamka !== undefined) zmena.int_poznamka = data.intPoznamka?.trim() || null;
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
      // Členenie z návrhu — po kódoch, nech je to pár volaní aj pre stovky faktúr.
      const podlaKodu = new Map<string, string[]>();
      for (const id of ok) {
        const k = doplnitClenenie[id];
        if (k) podlaKodu.set(k, [...(podlaKodu.get(k) ?? []), id]);
      }
      for (const [k, ids] of podlaKodu) {
        const { error: e3 } = await supabase.from("purchase_invoices").update({ pohoda_clenenie_dph: k }).in("id", ids);
        if (e3) throw new Error(e3.message);
      }
      // Predkontácia z návrhu (pravidlo, návyk) — rovnako po kódoch.
      const pkPodlaKodu = new Map<string, string[]>();
      for (const id of ok) {
        const k = doplnitPredkontaciu[id];
        if (k) pkPodlaKodu.set(k, [...(pkPodlaKodu.get(k) ?? []), id]);
      }
      for (const [k, ids] of pkPodlaKodu) {
        const { error: e4 } = await supabase.from("purchase_invoices").update({ pohoda_predkontacia: k }).in("id", ids);
        if (e4) throw new Error(e4.message);
      }
      if (!data.lenUlozit) {
        // „Prijatá“ sa zaúčtovaním stáva „zaúčtovanou“; zaplatená ostáva zaplatená.
        await supabase.from("purchase_invoices").update({ status: "booked" }).in("id", ok).eq("status", "received");
      }
      /*
        Učenie z opráv: zaúčtovanie jednej faktúry je voľba človeka pre
        dodávateľa — nahradí voľbu z vytvorenia toho istého dokladu.
        Hromadné zaúčtovanie sa neučí (päťdesiat faktúr naraz by prebilo
        všetko ostatné jedným klikom).
      */
      if (data.ids.length === 1 && ok.length === 1) {
        const r = (riadky ?? []).find((x: any) => x.id === ok[0]);
        if (r) {
          const { zaznamenajVolby } = await import("./ucenie-z-oprav.server");
          const { druhPrijatej } = await import("./ucenie-z-oprav");
          const volby: Record<string, string | undefined> = {
            predkontacia: data.predkontacia === undefined ? undefined : (data.predkontacia ?? ""),
            clenenie: data.clenenie === undefined ? undefined : (data.clenenie ?? ""),
            kategoria: data.kategoria === undefined ? undefined : (data.kategoria ?? ""),
            kv: data.kv === undefined ? undefined : (data.kv ?? ""),
            stredisko: data.stredisko === undefined ? undefined : (data.stredisko ?? ""),
            cinnost: data.cinnost === undefined ? undefined : (data.cinnost ?? ""),
          };
          await zaznamenajVolby(supabase, {
            companyId: data.company_id,
            druh: druhPrijatej(r),
            dodavatel: { ico: r.supplier_ico, icDph: r.supplier_ic_dph, nazov: r.supplier_name },
            volby,
            dokladId: r.id,
            userId: context.userId,
          });
          ponukaPravidla = await opravaAutomatu(
            "prijata",
            r,
            { predkontacia: data.predkontacia === undefined ? undefined : (data.predkontacia ?? null), clenenie: data.clenenie, kv: data.kv },
            data.company_id,
            context.userId,
          );
        }
      }
    }
    return {
      zauctovanych: data.lenUlozit ? 0 : ok.length,
      ulozenych: ok.length,
      preskocene,
      ponukaPravidla,
      bezClenenia,
      doplneneClenenie: ok.filter((id) => doplnitClenenie[id]).length,
      doplnenaPredkontacia: ok.filter((id) => doplnitPredkontaciu[id]).length,
    };
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
 * Vyprázdniť kód sa dá len výslovne cez `vymazat` (detail bločku).
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
        stredisko: kod,
        cinnost: kod,
        rad: kod,
        pokladna: kod,
        /** Polia, ktoré sa majú vyprázdniť (prázdna hodnota sama nič nemení). */
        vymazat: z
          .array(z.enum(POLIA_ZAUCTOVANIA_DOKLADU as [string, ...string[]]))
          .max(10)
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const zmena = zmenaZauctovaniaDokladu(data as Parameters<typeof zmenaZauctovaniaDokladu>[0]);
    if (!Object.keys(zmena).length) return { zmenenych: 0, preskocenych: 0 };

    const { data: riadky, error } = await supabase
      .from("expense_documents")
      .select(
        "id, exported_at, supplier_ico, supplier_ic_dph, supplier_name, pohoda_predkontacia, zauctovane_at, zauctovanie_zdroj, zauctovanie_istota, auto_uctovanie_navrh",
      )
      .eq("company_id", data.company_id)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    const ok = (riadky ?? []).filter((r: any) => !r.exported_at).map((r: any) => r.id);
    let ponukaPravidla: Awaited<ReturnType<typeof opravaAutomatu>> = null;
    if (ok.length) {
      const { error: e2 } = await supabase
        .from("expense_documents")
        .update(zmena)
        .eq("company_id", data.company_id)
        .in("id", ok);
      if (e2) throw new Error(e2.message);
      // Určená predkontácia = doklad je zaúčtovaný (aj pre stránku Na kontrolu).
      if (zmena.pohoda_predkontacia) {
        await supabase
          .from("expense_documents")
          .update({ zauctovane_at: new Date().toISOString(), zauctoval: context.userId })
          .eq("company_id", data.company_id)
          .in("id", ok)
          .is("zauctovane_at", null);
      }
      // Učenie z opráv — len pri jednom bločku, ako pri prijatých faktúrach.
      if (data.ids.length === 1 && ok.length === 1) {
        const r = (riadky ?? [])[0];
        const { zaznamenajVolby } = await import("./ucenie-z-oprav.server");
        const volby: Record<string, string> = {};
        if (zmena.pohoda_predkontacia) volby.predkontacia = String(zmena.pohoda_predkontacia);
        if (zmena.pohoda_clenenie_dph) volby.clenenie = String(zmena.pohoda_clenenie_dph);
        if (zmena.category) volby.kategoria = String(zmena.category);
        if ("kv_clenenie" in zmena) volby.kv = String(zmena.kv_clenenie ?? "");
        if (zmena.stredisko) volby.stredisko = String(zmena.stredisko);
        if (zmena.cinnost) volby.cinnost = String(zmena.cinnost);
        if (r && Object.keys(volby).length)
          await zaznamenajVolby(supabase, {
            companyId: data.company_id,
            druh: "blocek",
            dodavatel: { ico: r.supplier_ico, icDph: r.supplier_ic_dph, nazov: r.supplier_name },
            volby,
            dokladId: r.id,
            userId: context.userId,
          });
        if (r && zmena.pohoda_predkontacia)
          ponukaPravidla = await opravaAutomatu(
            "blocek",
            r,
            {
              predkontacia: String(zmena.pohoda_predkontacia),
              clenenie: (zmena.pohoda_clenenie_dph as string) ?? null,
              kv: (zmena.kv_clenenie as string) ?? null,
            },
            data.company_id,
            context.userId,
          );
      }
    }
    return { zmenenych: ok.length, preskocenych: (riadky ?? []).length - ok.length, ponukaPravidla };
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


/** Je faktúra už v Pohode? (konektor alebo export ju potvrdil) */
async function vPohode(supabase: any, invoiceId: string): Promise<boolean> {
  const { data } = await supabase
    .from("export_logs")
    .select("id")
    .eq("invoice_id", invoiceId)
    .eq("status", "ok")
    .limit(1);
  return Boolean(data?.length);
}

/**
 * Zaúčtovanie vystavenej faktúry — kódy na hlavičke a voliteľne na
 * položkách (ako „účtovné nastavenia položky" v Doklado). Faktúra, ktorá už
 * je v Pohode, sa nemení; najprv sa vráti.
 */
export const zauctujVystavenuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        id: z.string().uuid(),
        predkontacia: kod,
        clenenie: kod,
        kv: z.string().trim().max(5).optional().nullable(),
        stredisko: kod,
        cinnost: kod,
        intPoznamka: z.string().max(240).optional().nullable(),
        polozky: z
          .array(
            z.object({
              id: z.string().uuid(),
              predkontacia: kod,
              clenenie: kod,
              kv: z.string().trim().max(5).optional().nullable(),
            }),
          )
          .max(500)
          .optional(),
        lenUlozit: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: f } = await supabase
      .from("invoices")
      .select(
        "id, status, deleted_at, customer_ico, customer_name, pohoda_predkontacia, zauctovanie_zdroj, zauctovanie_istota, auto_uctovanie_navrh",
      )
      .eq("company_id", data.company_id)
      .eq("id", data.id)
      .maybeSingle();
    if (!f || f.deleted_at) throw new Error("Faktúra sa nenašla.");
    if (await vPohode(supabase, f.id))
      throw new Error("Faktúra je už v Pohode — najprv ju vráťte z Pohody.");
    if (!data.lenUlozit && f.status === "draft") throw new Error("Koncept sa zaúčtovať nedá — najprv ho vystavte.");

    const zmena: Record<string, unknown> = {
      pohoda_predkontacia: data.predkontacia?.trim() || null,
      pohoda_clenenie_dph: data.clenenie?.trim() || null,
      kv_clenenie: data.kv?.trim() || null,
      stredisko: data.stredisko?.trim() || null,
      cinnost: data.cinnost?.trim() || null,
      int_poznamka: data.intPoznamka?.trim() || null,
    };
    if (!data.lenUlozit) {
      zmena.zauctovane_at = new Date().toISOString();
      zmena.zauctoval = context.userId;
    }
    const { error } = await supabase.from("invoices").update(zmena).eq("id", f.id);
    if (error) throw new Error(error.message);

    for (const p of data.polozky ?? []) {
      const { error: e2 } = await supabase
        .from("invoice_items")
        .update({
          pohoda_predkontacia: p.predkontacia?.trim() || null,
          pohoda_clenenie_dph: p.clenenie?.trim() || null,
          kv_clenenie: p.kv?.trim() || null,
        })
        .eq("id", p.id)
        .eq("invoice_id", f.id);
      if (e2) throw new Error(e2.message);
    }
    const ponukaPravidla = await opravaAutomatu(
      "vystavena",
      f,
      { predkontacia: data.predkontacia?.trim() || null, clenenie: data.clenenie ?? null, kv: data.kv ?? null },
      data.company_id,
      context.userId,
    );
    return { ok: true, ponukaPravidla };
  });

export const zrusZauctovanieVystavenejFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    if (await vPohode(supabase, data.id))
      throw new Error("Faktúra je už v Pohode — najprv ju vráťte z Pohody.");
    const { error } = await supabase
      .from("invoices")
      .update({ zauctovane_at: null, zauctoval: null })
      .eq("company_id", data.company_id)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Vystavená faktúra späť z Pohody — história odovzdania sa označí ako
 * vrátená, takže ju konektor aj balík pošlú znova. V Pohode ju treba zmazať.
 */
export const vratVystavenuZPohodyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    // Faktúru musí prihlásený vidieť (RLS) — až potom sa história mení
    // servisným kľúčom; členovia ju meniť nesmú (len čítať a zapisovať).
    const { data: f } = await supabase
      .from("invoices")
      .select("id")
      .eq("company_id", data.company_id)
      .eq("id", data.id)
      .maybeSingle();
    if (!f) throw new Error("Faktúra sa nenašla.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("export_logs")
      .update({ status: "returned" })
      .eq("company_id", data.company_id)
      .eq("invoice_id", data.id)
      .eq("status", "ok");
    if (error) throw new Error(error.message);
    await supabase
      .from("invoices")
      .update({ zauctovane_at: null, zauctoval: null })
      .eq("company_id", data.company_id)
      .eq("id", data.id);
    // Oprava pôjde do Pohody pod novým id — inak by ju kontrola duplicity odmietla.
    const { zvysVerziuPohody } = await import("./pohoda-odoslane-xml.server");
    await zvysVerziuPohody(supabase, "invoices", [data.id]);
    return { ok: true };
  });

/** Stav pre panel: je v Pohode, kedy a pod akým číslom. */
export const stavVystavenejFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const [{ data: log }, { data: polozky }] = await Promise.all([
      supabase
        .from("export_logs")
        .select("created_at, pohoda_cislo, export_jobs(format)")
        .eq("invoice_id", data.id)
        .eq("status", "ok")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("invoice_items")
        .select("id, name, subtotal, vat_rate, pohoda_predkontacia, pohoda_clenenie_dph, kv_clenenie")
        .eq("invoice_id", data.id)
        .order("position"),
    ]);
    return {
      vPohode: log
        ? {
            kedy: log.created_at as string,
            cislo: (log.pohoda_cislo ?? null) as string | null,
            // Iný program než Pohoda (Money, Omega…) — null = Pohoda (odovzdanie-exportu.ts).
            program: nazovProgramuExportu((log as any).export_jobs?.format),
          }
        : null,
      polozky: (polozky ?? []) as any[],
    };
  });

/**
 * Hromadné zaúčtovanie vystavených faktúr zo zoznamu. Vyplnené pole sa
 * nastaví na všetkých; prázdne nechá, čo na faktúre je. Faktúry v Pohode a
 * koncepty sa preskočia a povie sa to.
 */
export const zauctujVystaveneHromadneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        ids: z.array(z.string().uuid()).min(1).max(500),
        predkontacia: kod,
        clenenie: kod,
        kv: z.string().trim().max(5).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const [{ data: riadky, error }, { data: logy }] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, invoice_number, status, deleted_at")
        .eq("company_id", data.company_id)
        .in("id", data.ids),
      supabase
        .from("export_logs")
        .select("invoice_id")
        .eq("company_id", data.company_id)
        .eq("status", "ok")
        .in("invoice_id", data.ids),
    ]);
    if (error) throw new Error(error.message);
    const vPohode = new Set((logy ?? []).map((l: any) => l.invoice_id));
    const preskocene: string[] = [];
    const ok: string[] = [];
    for (const r of riadky ?? []) {
      if (r.deleted_at) continue;
      if (r.status === "draft") preskocene.push(`${r.invoice_number}: koncept`);
      else if (vPohode.has(r.id)) preskocene.push(`${r.invoice_number}: už je v Pohode`);
      else ok.push(r.id);
    }
    if (ok.length) {
      const zmena: Record<string, unknown> = {
        zauctovane_at: new Date().toISOString(),
        zauctoval: context.userId,
      };
      if (data.predkontacia?.trim()) zmena.pohoda_predkontacia = data.predkontacia.trim();
      if (data.clenenie?.trim()) zmena.pohoda_clenenie_dph = data.clenenie.trim();
      if (data.kv?.trim()) zmena.kv_clenenie = data.kv.trim() === "auto" ? null : data.kv.trim();
      const { error: e2 } = await supabase.from("invoices").update(zmena).in("id", ok);
      if (e2) throw new Error(e2.message);
    }
    return { zauctovanych: ok.length, preskocene };
  });
